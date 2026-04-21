<script lang="ts">
	import { browser } from '$app/environment';
	import { getContext, onDestroy, onMount } from 'svelte';
	import { formatTime } from '../../utils/FormatTime';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsSkipBackwardFill from 'svelte-icons-pack/bs/BsSkipBackwardFill';
	import BsSkipForwardFill from 'svelte-icons-pack/bs/BsSkipForwardFill';
	import BsPlayCircleFill from 'svelte-icons-pack/bs/BsPlayCircleFill';
	import BsPauseCircleFill from 'svelte-icons-pack/bs/BsPauseCircleFill';
	import BsVolumeUpFill from 'svelte-icons-pack/bs/BsVolumeUpFill';
	import BsVolumeMuteFill from 'svelte-icons-pack/bs/BsVolumeMuteFill';
	import BsX from 'svelte-icons-pack/bs/BsX';
	import BsShuffle from 'svelte-icons-pack/bs/BsShuffle';
	import BsHeartFill from 'svelte-icons-pack/bs/BsHeartFill';
	import BsHeart from 'svelte-icons-pack/bs/BsHeart';
	import { selectAudio, playlist, basePlaylist, currentIndex, autoNext, isShuffle, isPlaying } from '../stores/global';
	import type { AudioAsset } from '$lib/models/media-assets';
	import type { MusicAudio } from '$lib/models/music-audio';
	import type { Sermon } from '$lib/models/sermon';
	import IoRepeat from 'svelte-icons-pack/io/IoRepeat';
	import RiMediaPlayList2Fill from 'svelte-icons-pack/ri/RiMediaPlayList2Fill';
	import BsSkipStartFill from 'svelte-icons-pack/bs/BsSkipStartFill';
	import BsSkipEndFill from 'svelte-icons-pack/bs/BsSkipEndFill';
	import {
		findAdjacentPlayableIndex,
		getPlayableAudioUrl,
		type PlayableAudio
	} from '../../utils/audioPlayback';
	import { toggleFavorite, isFavorite, favorites } from '../stores/musicHistory';

	let audio: HTMLAudioElement;
	let currentTime = 0;
	let duration = 0;
	let progressBarWidth = 0;
	let indicatorPosition = 0;
	let isDragging = false;
	let initialClickX = 0;
	let initialIndicatorPosition = 0;
	let volume = 1; // Initial volume (1 = full volume, 0 = mute)
	let isMuted = false;
	let audioSrc: string = '';
	let isAudioReady = false;
	let shouldAutoplayOnLoad = false;
	let playerShell: HTMLDivElement | null = null;
	let playerResizeObserver: ResizeObserver | null = null;
	let lastPlayerInset = 0;
	let pendingPlaybackIntent: 'play' | 'pause' | null = null;

	function setPendingPlaybackIntent(intent: 'play' | 'pause' | null) {
		pendingPlaybackIntent = intent;
	}

	function playCurrentAudio() {
		if (!audio) return;
		setPendingPlaybackIntent('play');
		userWantsToPlay = true;
		if (audio.duration && audio.currentTime >= audio.duration) {
			audio.currentTime = 0;
		}
		safePlay('auto');
	}

	function pauseCurrentAudio() {
		if (!audio || audio.paused) return;
		setPendingPlaybackIntent('pause');
		userWantsToPlay = false;
		audio.pause();
	}

	function handleExternalToggle() {
		if (!audio) return;
		if (audio.paused) {
			playCurrentAudio();
			return;
		}
		pauseCurrentAudio();
	}

	// Tracks the listener's *intent* to play, separate from whether the audio
	// element is actually producing sound. Critical for resuming after system
	// interruptions (phone calls, Siri, another app grabbing the audio focus)
	// because iOS fires `pause` on the element but doesn't auto-resume once
	// the interruption ends.
	let userWantsToPlay = false;

	/** Timestamp when the audio last went into paused state (via user, OS,
	 *  or lock-screen control). Used to decide whether to reload before
	 *  playing — iOS loses the Bluetooth audio route after a long pause so
	 *  a plain `audio.play()` resumes playback silently on Bluetooth. */
	let audioPausedAt = 0;
	const PAUSE_RELOAD_THRESHOLD_MS = 1500;

	/** Watchdog that retries play() after an OS interruption (phone call,
	 *  Siri, another app grabbing audio focus). iOS doesn't fire any DOM
	 *  event when AVAudioSession ends an interruption — and for banner-style
	 *  calls the PWA never even goes hidden — so visibility/focus listeners
	 *  alone are insufficient. We poll audio.play() instead: it silently
	 *  rejects during the interruption, then succeeds the moment iOS
	 *  releases the session. The 'play' event listener clears the watchdog. */
	let resumeWatchdog: ReturnType<typeof setInterval> | null = null;
	let resumeWatchdogStartedAt = 0;
	let resumeWatchdogAttempts = 0;
	const RESUME_RETRY_INTERVAL_MS = 1500;
	const RESUME_MAX_DURATION_MS = 5 * 60 * 1000;
	const RESUME_RELOAD_EVERY_N_ATTEMPTS = 20;

	/** Guards against concurrent audio.load() calls. When the watchdog and
	 *  a visibility/focus handler both trigger safePlay('long') on resume,
	 *  overlapping load() operations corrupt the buffer and create glitches:
	 *  each call captures its own savedTime closure, the second captures 0
	 *  (because the first load already reset currentTime), and the racing
	 *  canplay handlers seek to different positions then each call play(). */
	let isReloadingSession = false;

	function syncPlayerInset() {
		if (!browser) return;
		if (!playerShell) {
			lastPlayerInset = 0;
			document.documentElement.style.setProperty('--audio-player-height', '0px');
			return;
		}

		// Keep the reserved bottom inset stable across rapid play/pause toggles.
		// `getBoundingClientRect()` can wobble by a sub-pixel and make the page
		// shimmy even though the player's real layout height did not change.
		const shellHeight = playerShell.offsetHeight;
		const topOverflow = progressBarElement ? Math.round(progressBarElement.offsetHeight / 2) : 0;
		const nextInset = shellHeight + topOverflow;

		if (nextInset === lastPlayerInset) return;
		lastPlayerInset = nextInset;
		document.documentElement.style.setProperty('--audio-player-height', `${nextInset}px`);
	}

	function getDisplayTitle(item: any): string {
		if (!item) return 'Chargement...';
		if ('french_title' in item) return item.french_title || item.english_title || 'Sans titre';
		if ('title' in item) return item.title || 'Sans titre';
		return 'Sans titre';
	}

	function getAudioFavId(item: any): string {
		if (!item) return '';
		return String(item._id || item.s3_url || item.mp3_url || '');
	}

	function handleToggleFavorite() {
		if (!$selectAudio) return;
		const audio = $selectAudio as any;
		toggleFavorite({
			_id: getAudioFavId(audio),
			title: getDisplayTitle(audio),
			artist: audio.artist,
			category: audio.category,
			s3_url: audio.s3_url
		});
	}

	$: currentFavId = getAudioFavId($selectAudio);
	$: isCurrentFavorite = isFavorite(currentFavId, $favorites);

	function handleEnded() {
		if (!$autoNext || $playlist.length === 0) {
			isPlaying.set(false);
			return;
		}

		const nextIndex = findAdjacentPlayableIndex(
			$playlist as PlayableAudio[],
			$currentIndex,
			1,
			false
		);

		if (nextIndex === -1) {
			isPlaying.set(false);
			return;
		}

		const nextItem = $playlist[nextIndex];
		const nextUrl = getPlayableAudioUrl(nextItem as PlayableAudio);

		if (!nextUrl) {
			isPlaying.set(false);
			return;
		}

		// iOS PWA background: keep the audio session alive by swapping src on the
		// existing element and calling play() synchronously — without pausing
		// first and without waiting for the async `canplay` event (which the
		// reactive-statement path relies on). Pausing or deferring play() breaks
		// background playback when the screen is locked.
		if (audio) {
			const encodedUrl = encodeURI(nextUrl);
			audioSrc = nextUrl; // prevents the reactive $: block from re-loading
			isAudioReady = false;
			currentTime = 0;
			duration = 0;
			progressBarWidth = 0;
			indicatorPosition = 0;

			audio.src = encodedUrl;
			const playPromise = audio.play();
			if (playPromise) {
				playPromise.catch((e) => {
					console.error('[AudioPlayer] Autoplay next failed:', e);
					isPlaying.set(false);
				});
			}

			if ('mediaSession' in navigator) {
				navigator.mediaSession.playbackState = 'playing';
			}
		}

		currentIndex.set(nextIndex);
		selectAudio.set(nextItem);
		isPlaying.set(true);
	}

	const toggleAutoNext = () => {
		autoNext.update((v) => !v);
	};

	function toggleShuffle() {
		isShuffle.update(shuffle => {
			const newShuffle = !shuffle;
			if (newShuffle) {
				// Shuffle logic
				const currentSong = $selectAudio;
				const list = [...$playlist];
				
				// Fisher-Yates shuffle
				for (let i = list.length - 1; i > 0; i--) {
					const j = Math.floor(Math.random() * (i + 1));
					[list[i], list[j]] = [list[j], list[i]];
				}
				
				// Ensure current song is at its new position and update index
				playlist.set(list);
				if (currentSong) {
					const newIndex = list.findIndex(s => {
						const url = 's3_url' in s ? s.s3_url : ('mp3_url' in s ? s.mp3_url : (s as AudioAsset).url);
						const currentUrl = 's3_url' in currentSong ? currentSong.s3_url : ('mp3_url' in currentSong ? currentSong.mp3_url : (currentSong as AudioAsset).url);
						return url === currentUrl;
					});
					if (newIndex !== -1) currentIndex.set(newIndex);
				}
			} else {
				// Restore original order
				const currentSong = $selectAudio;
				const originalList = $basePlaylist;
				playlist.set(originalList);
				
				if (currentSong) {
					const newIndex = originalList.findIndex(s => {
						const url = 's3_url' in s ? s.s3_url : ('mp3_url' in s ? s.mp3_url : (s as AudioAsset).url);
						const currentUrl = 's3_url' in currentSong ? currentSong.s3_url : ('mp3_url' in currentSong ? currentSong.mp3_url : (currentSong as AudioAsset).url);
						return url === currentUrl;
					});
					if (newIndex !== -1) currentIndex.set(newIndex);
				}
			}
			return newShuffle;
		});
	}

	function selectPlaylistItem(index: number, autoplay = true) {
		if (index < 0 || index >= $playlist.length) return;

		currentIndex.set(index);
		selectAudio.set($playlist[index]);

		if (autoplay) {
			shouldAutoplayOnLoad = true;
			isPlaying.set(true);
		}
	}

	function playNext() {
		if ($playlist.length === 0) return;

		const nextIndex = findAdjacentPlayableIndex($playlist as PlayableAudio[], $currentIndex, 1, true);
		if (nextIndex !== -1) {
			selectPlaylistItem(nextIndex, true);
		}
	}

	function playPrevious() {
		if ($playlist.length === 0) return;

		const prevIndex = findAdjacentPlayableIndex(
			$playlist as PlayableAudio[],
			$currentIndex,
			-1,
			true
		);
		if (prevIndex !== -1) {
			selectPlaylistItem(prevIndex, true);
		}
	}

	function updateAudioSource(url: string) {
		if (!url) return;
		
		const encodedUrl = encodeURI(url);
		console.log("[AudioPlayer] Updating source to:", encodedUrl);
		isAudioReady = false;
		currentTime = 0;
		duration = 0;
		progressBarWidth = 0;
		indicatorPosition = 0;
		const shouldResumePlayback = shouldAutoplayOnLoad || $isPlaying || userWantsToPlay;
		shouldAutoplayOnLoad = shouldResumePlayback;

		if (audio) {
			audio.pause();
			audio.src = encodedUrl;
			audio.load();
		} else {
			audio = new Audio(encodedUrl);
			audio.crossOrigin = 'anonymous';
			audio.addEventListener('ended', handleEnded);
			audio.addEventListener('timeupdate', updateAudioTime);
			audio.addEventListener('timeupdate', updateIndicator);
				audio.addEventListener('play', () => {
					setPendingPlaybackIntent(null);
					userWantsToPlay = true;
					audioPausedAt = 0;
					stopResumeWatchdog();
				isPlaying.set(true);
				if ('mediaSession' in navigator) {
					navigator.mediaSession.playbackState = 'playing';
				}
			});
				audio.addEventListener('pause', () => {
					setPendingPlaybackIntent(null);
					// Note: we do NOT clear userWantsToPlay here. A `pause` event
					// can come from the listener tapping pause OR from the OS
				// interrupting (phone call, Siri, another app). Only togglePlay
				// clears the intent flag, so this handler stays neutral and
				// the visibilitychange/focus listeners can resume when the
				// interruption ends.
				//
				// We do stamp `audioPausedAt` so safePlay() knows how long
				// the pause lasted — long-enough pauses need an audio-session
				// reload to restore Bluetooth output routing.
				audioPausedAt = Date.now();
				isPlaying.set(false);
				if ('mediaSession' in navigator) {
					navigator.mediaSession.playbackState = 'paused';
				}
				// If the pause was NOT user-initiated (togglePlay / MediaSession
				// pause clear userWantsToPlay *before* calling audio.pause()),
				// start the watchdog. It polls play() until iOS lifts the
				// AVAudioSession interruption (phone call / Siri / focus grab).
				if (userWantsToPlay) {
					startResumeWatchdog();
				}
			});
			audio.addEventListener('loadedmetadata', () => {
				duration = audio.duration;
				console.log("[AudioPlayer] Metadata loaded, duration:", duration);
			});
				audio.addEventListener('canplay', () => {
					isAudioReady = true;
					if (shouldAutoplayOnLoad || $isPlaying) {
						setPendingPlaybackIntent('play');
						audio.play().catch((e) => {
							setPendingPlaybackIntent(null);
							console.error('[AudioPlayer] Autoplay on load failed:', e);
							isPlaying.set(false);
						});
					}
					shouldAutoplayOnLoad = false;
				});
				audio.addEventListener('error', (e) => {
					setPendingPlaybackIntent(null);
					console.error("[AudioPlayer] Audio error:", e);
					isPlaying.set(false);
					isAudioReady = false;
				shouldAutoplayOnLoad = false;
			});
		}
	}

	// Reactive sync: keep the audio element's actual play/pause state in
	// lockstep with the $isPlaying store. The `pendingPlaybackIntent`
	// guard defuses a race that otherwise spawns two audio sessions on
	// iOS: when the user taps pause (or play), we call audio.pause()
	// (or .play()) synchronously, which triggers the corresponding DOM
	// event, which flips isPlaying — then this reactive block sees the
	// "new" mismatch and fires a *second* command before the first has
	// settled. Two overlapping play() calls leave a ghost audio element
	// playing in the background with no UI bound to it. Bailing out when
	// the intent is already in-flight keeps this single-track.
	//
	// NB: `return` is illegal inside a Svelte reactive block (it
	// compiles to a bare statement, not a function), so the guard is
	// expressed as nested if/else.
	$: if (browser && audio && $isPlaying !== undefined) {
		if ($isPlaying && audio.paused) {
			if (pendingPlaybackIntent !== 'pause') {
				userWantsToPlay = true;
				safePlay('auto');
			}
		} else if (!$isPlaying && !audio.paused) {
			if (pendingPlaybackIntent !== 'play') {
				audio.pause();
			}
		}
	}

	$: if ($selectAudio && browser) {
		const newSelected = $selectAudio;
		const rawUrl = getPlayableAudioUrl(newSelected as PlayableAudio);
		console.log("[AudioPlayer] Selected audio change, raw URL:", rawUrl);
		
		if (rawUrl && rawUrl !== audioSrc) {
			audioSrc = rawUrl;
			updateAudioSource(rawUrl);
		}
	}

	const toggleMute = () => {
		if (!audio) return;

		if (isMuted) {
			audio.volume = volume;
		} else {
			volume = audio.volume;
			audio.volume = 0;
		}
		isMuted = !isMuted;
	};

	let progressBarElement: HTMLDivElement;

	const startDrag = (event: TouchEvent | MouseEvent) => {
		isDragging = true;
		handleDrag(event); // Initial seek on click/touch
	};

	const endDrag = () => {
		isDragging = false;
	};

	const handleDrag = (event: TouchEvent | MouseEvent) => {
		if (!isDragging || !progressBarElement || !duration) return;

		// Get clientX from mouse or touch
		const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
		const rect = progressBarElement.getBoundingClientRect();
		
		// Calculate percentage
		let percentage = (clientX - rect.left) / rect.width;
		percentage = Math.max(0, Math.min(1, percentage));
		
		// Update UI immediately for smoothness
		// Also update indicatorPosition so the knob follows the simplified logic
		progressBarWidth = percentage * 100;
		indicatorPosition = progressBarWidth; 
		
		// Update audio
		if (audio) {
			const newTime = percentage * duration;
			if (Math.abs(audio.currentTime - newTime) > 0.1) {
				audio.currentTime = newTime;
			}
		}
	};

	const seekForward = (seconds: number = 5) => {
		if (!audio) return;
		audio.currentTime += seconds;
		updateAudioTime();
		updateIndicator();
	};

	const seekBackward = (seconds: number = 5) => {
		if (!audio) return;
		audio.currentTime -= seconds;
		updateAudioTime();
		updateIndicator();
	};

	const togglePlay = async () => {
		if (!audio) return;

		try {
			handleExternalToggle();
			// isPlaying will be updated via listeners
		} catch (error) {
			console.error('Playback failed:', error);
		}
	};
	// Update the current time and duration as the audio plays
	const updateAudioTime = () => {
		if (audio) {
			currentTime = audio.currentTime;
			duration = audio.duration;
			progressBarWidth = (currentTime / duration) * 100;
			pushMediaSessionPosition();
		}
	};
	const updateIndicator = () => {
		if (!audio) return;

		const currentTime = audio.currentTime;
		const duration = audio.duration;
		indicatorPosition = (currentTime / duration) * 100 || 0;
	};
	const seekTo = (event: TouchEvent | MouseEvent) => {
		if (!audio) return;

		const progressBar = event.currentTarget as HTMLDivElement;
		const rect = progressBar.getBoundingClientRect();
		const clickX = 'touches' in event ? event.touches[0].clientX : event.clientX;
		const barWidth = rect.width;
		let newPosition = ((clickX - rect.left) / barWidth) * duration;

		if (newPosition < 0) {
			newPosition = 0;
		} else if (newPosition > duration) {
			newPosition = duration;
		}

		audio.currentTime = newPosition;
		updateAudioTime();
		indicatorPosition = (currentTime / duration) * 100;
	};
	const dragIndicator = (event: TouchEvent | MouseEvent) => {
		if (!audio || !isDragging) return;

		const progressBar = event.currentTarget as HTMLDivElement;
		const rect = progressBar.getBoundingClientRect();
		const clickX = 'touches' in event ? event.touches[0].clientX : event.clientX;
		const barWidth = rect.width;
		let newPosition = ((clickX - rect.left) / barWidth) * duration;

		if (newPosition < 0) {
			newPosition = 0;
		} else if (newPosition > duration) {
			newPosition = duration;
		}

		audio.currentTime = newPosition;
		updateAudioTime();
		const delta = clickX - initialClickX;
		indicatorPosition = Math.min(
			100,
			Math.max(0, initialIndicatorPosition + (delta / barWidth) * 100)
		);
	};

	// Add your audio file path

	/** Timestamp (ms) recorded when the document last went hidden. Used to
	 *  coerce the same audio-session reload on return-from-background for
	 *  platforms that only fire `focus` (not `visibilitychange`). */
	let appHiddenAt = 0;

	/** Core play helper. Every pathway that resumes playback — lock-screen
	 *  MediaSession button, on-screen togglePlay, visibility-change handler,
	 *  the `$isPlaying` sync block — routes through here so the Bluetooth
	 *  output route is consistently restored.
	 *
	 *  iOS bug we're working around: when the audio element has been paused
	 *  for more than a second or two (phone call, lock-screen pause, Siri,
	 *  another app grabbing the audio focus), iOS tears down the audio
	 *  session's output route. A subsequent `audio.play()` resolves cleanly
	 *  and even advances `currentTime`, but no bytes reach the Bluetooth
	 *  sink — the listener hears silence.
	 *
	 *  Calling `audio.load()` before play() forces iOS to rebuild the audio
	 *  session and rebind it to the *currently active* output device (the
	 *  user's Bluetooth earphones), restoring sound. We only pay that
	 *  ~1-2s reload cost when the pause was long enough to warrant it. */
	function safePlay(reasonHint: 'short' | 'long' | 'auto' = 'auto') {
		if (!browser || !audio) return;

		const pausedMs = audioPausedAt > 0 ? Date.now() - audioPausedAt : 0;
		const needsReload =
			reasonHint === 'long' ||
			(reasonHint === 'auto' && pausedMs >= PAUSE_RELOAD_THRESHOLD_MS);

		if (!needsReload) {
			// Don't probe with play() while a reload is in flight — the
			// in-flight finish() will play() once the session is rebuilt.
			if (isReloadingSession) return;
			audio.play().catch((err) => {
				console.warn('[AudioPlayer] play() failed:', err);
			});
			return;
		}

		// Skip if a reload is already running. The in-flight finish() will
		// restore position and start playback — a second load() would abort
		// the first, corrupt buffers, and capture a bogus savedTime (0).
		if (isReloadingSession) return;

		const savedTime = audio.currentTime;
		const savedSrc = audio.src;
		isReloadingSession = true;
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			isReloadingSession = false;
			if (!audio || audio.src !== savedSrc) return;
			try {
				audio.currentTime = savedTime;
			} catch {
				/* metadata may not be loaded yet — ignore */
			}
			audio.play().catch((err) => {
				console.warn('[AudioPlayer] Post-reload play() failed:', err);
			});
		};
		audio.addEventListener('canplay', finish, { once: true });
		// Safety net: don't stall forever if canplay never fires.
		setTimeout(finish, 2000);
		try {
			audio.load();
		} catch (err) {
			console.warn('[AudioPlayer] audio.load() failed:', err);
			finish();
		}
	}

	/** Resume playback after an interruption only if the listener had asked
	 *  for it. Called on visibility/focus/pageshow events. */
	function tryResumeAfterInterruption(hiddenMs: number = 0) {
		if (!userWantsToPlay || !audio || !audio.paused) return;
		// Visibility/focus is the authoritative resume signal — stop the
		// polling watchdog so it can't fire a competing reload or play()
		// probe that races with the session rebuild below.
		stopResumeWatchdog();
		safePlay(hiddenMs >= PAUSE_RELOAD_THRESHOLD_MS ? 'long' : 'short');
	}

	function stopResumeWatchdog() {
		if (resumeWatchdog !== null) {
			clearInterval(resumeWatchdog);
			resumeWatchdog = null;
		}
		resumeWatchdogAttempts = 0;
	}

	function startResumeWatchdog() {
		if (!browser || !audio) return;
		if (resumeWatchdog !== null) return;
		resumeWatchdogStartedAt = Date.now();
		resumeWatchdogAttempts = 0;
		resumeWatchdog = setInterval(() => {
			if (!browser || !audio) return stopResumeWatchdog();
			if (!userWantsToPlay || !audio.paused) return stopResumeWatchdog();
			if (Date.now() - resumeWatchdogStartedAt > RESUME_MAX_DURATION_MS) {
				return stopResumeWatchdog();
			}
			// While a reload is rebuilding the session, don't probe — the
			// in-flight finish() will start playback once canplay fires.
			if (isReloadingSession) return;
			resumeWatchdogAttempts++;
			// First attempt and every ~30s afterwards does a full reload to
			// rebuild the audio session / Bluetooth route. Intermediate ticks
			// just probe with plain play() — cheap, no data usage on reject.
			if (
				resumeWatchdogAttempts === 1 ||
				resumeWatchdogAttempts % RESUME_RELOAD_EVERY_N_ATTEMPTS === 0
			) {
				safePlay('long');
			} else {
				audio.play().catch(() => {
					/* interruption still active — next tick will retry */
				});
			}
		}, RESUME_RETRY_INTERVAL_MS);
	}

	onMount(() => {
		if (!browser) return;

		const onVisibility = () => {
			if (document.visibilityState === 'hidden') {
				appHiddenAt = Date.now();
			} else {
				const elapsed = appHiddenAt > 0 ? Date.now() - appHiddenAt : 0;
				appHiddenAt = 0;
				tryResumeAfterInterruption(elapsed);
			}
		};
		// `focus` and `pageshow` on iOS can fire without a preceding
		// `visibilitychange` (e.g. returning from control-center).
		const onFocus = () => {
			const elapsed = appHiddenAt > 0 ? Date.now() - appHiddenAt : 0;
			appHiddenAt = 0;
			tryResumeAfterInterruption(elapsed);
		};
		const onPageShow = () => {
			const elapsed = appHiddenAt > 0 ? Date.now() - appHiddenAt : 0;
			appHiddenAt = 0;
			tryResumeAfterInterruption(elapsed);
		};

		document.addEventListener('visibilitychange', onVisibility);
		window.addEventListener('focus', onFocus);
		window.addEventListener('pageshow', onPageShow);

		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('focus', onFocus);
			window.removeEventListener('pageshow', onPageShow);
		};
	});

	// ── Media Session API (Bluetooth / lockscreen / car controls) ──
	// Register action handlers ONCE on mount — some platforms (iOS Safari
	// especially) only wire up hardware keys if the handlers exist at the
	// moment audio starts playing, and reactive re-binding is unreliable.
	// Metadata is still updated reactively below, and positionState is
	// pushed on every timeupdate so the lock-screen seek bar tracks
	// progress accurately.
	onMount(() => {
		if (!browser || !('mediaSession' in navigator)) return;
		try {
			navigator.mediaSession.setActionHandler('play', () => {
				userWantsToPlay = true;
				// Lock-screen / Bluetooth play: route through safePlay so a
				// long paused-on-lockscreen window reloads the audio session
				// before attempting playback. Without this, play() resumes
				// silently over Bluetooth after a few seconds of pause.
				safePlay('auto');
			});
			navigator.mediaSession.setActionHandler('pause', () => {
				userWantsToPlay = false;
				audio?.pause();
			});
			navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
			navigator.mediaSession.setActionHandler('nexttrack', playNext);
			navigator.mediaSession.setActionHandler('seekbackward', (details) => {
				seekBackward(details.seekOffset ?? 10);
			});
			navigator.mediaSession.setActionHandler('seekforward', (details) => {
				seekForward(details.seekOffset ?? 10);
			});
			// `seekto` lets the car / lock screen scrub the timeline directly.
			navigator.mediaSession.setActionHandler('seekto', (details) => {
				if (!audio || details.seekTime == null) return;
				if (details.fastSeek && 'fastSeek' in audio) {
					audio.fastSeek(details.seekTime);
				} else {
					audio.currentTime = details.seekTime;
				}
			});
			navigator.mediaSession.setActionHandler('stop', () => {
				userWantsToPlay = false;
				if (audio) {
					audio.pause();
					audio.currentTime = 0;
				}
			});
		} catch (err) {
			console.warn('[AudioPlayer] MediaSession handler registration failed:', err);
		}
	});

	/** Pull the right artwork URL for a track so the car/lockscreen shows
	 *  something meaningful instead of the app logo every time. */
	function getArtworkUrl(item: PlayableAudio | null): string {
		if (!item) return '/icons/pwa-512x512.png';
		const anyItem = item as { thumbnail_url?: string; cover_url?: string };
		return anyItem.thumbnail_url || anyItem.cover_url || '/icons/pwa-512x512.png';
	}

	// Reactive metadata updates — whenever the selected track changes, the
	// car/lock screen reads the new title/artist/album/artwork.
	$: if (browser && $selectAudio && 'mediaSession' in navigator) {
		const current = $selectAudio;
		const isMusic = 'category' in current;
		const isSermon = 'mp3_url' in current;
		const artworkUrl = getArtworkUrl(current as PlayableAudio);

		navigator.mediaSession.metadata = new MediaMetadata({
			title: ('title' in current ? current.title : (isSermon ? (current as Sermon).french_title || (current as Sermon).english_title : 'Sans titre')) || 'Sans titre',
			artist: isMusic ? (current as MusicAudio).artist || 'Artiste inconnu' : (isSermon ? (current as Sermon).author : 'Missionnaire'),
			album: isMusic
				? (current as MusicAudio).book_full_name || (current as MusicAudio).category || 'Missionnaire'
				: (isSermon ? (current as Sermon).iso_date || 'Prédication' : 'Media'),
			artwork: [
				{ src: artworkUrl, sizes: '96x96', type: 'image/png' },
				{ src: artworkUrl, sizes: '192x192', type: 'image/png' },
				{ src: artworkUrl, sizes: '512x512', type: 'image/png' }
			]
		});
	}

	/** Push the current playback position to the OS so the lock-screen /
	 *  car head-unit seek bar can animate accurately. Called on every
	 *  `timeupdate` via updateAudioTime below. */
	function pushMediaSessionPosition() {
		if (!browser || !('mediaSession' in navigator) || !audio) return;
		const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
		if (dur <= 0) return;
		try {
			navigator.mediaSession.setPositionState({
				duration: dur,
				playbackRate: audio.playbackRate || 1,
				position: Math.min(audio.currentTime, dur)
			});
		} catch {
			/* setPositionState isn't supported on older Safari — ignore */
		}
	}

	// Keyboard shortcuts
	function handleKeydown(event: KeyboardEvent) {
		// Don't trigger if user is typing in an input or textarea
		const target = event.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

		const key = event.key.toLowerCase();

		switch (key) {
			case 'n': // Next
				playNext();
				break;
			case 'p': // Previous
				playPrevious();
				break;
			case 'arrowright': // Seek Forward
				seekForward();
				break;
			case 'arrowleft': // Seek Backward
				seekBackward();
				break;
			case ' ': // Space bar - Play/Pause
				event.preventDefault(); // Prevent page scroll
				togglePlay();
				break;
			case 'm': // Mute
				toggleMute();
				break;
		}
	}

	// Ensure audio is stopped when the component is unmounted
	onMount(() => {
		if (!browser) return;

		syncPlayerInset();
		window.addEventListener('resize', syncPlayerInset);
		window.addEventListener('missionnaire-audio-toggle', handleExternalToggle);
		window.addEventListener('missionnaire-audio-play', playCurrentAudio);
		window.addEventListener('missionnaire-audio-pause', pauseCurrentAudio);

		if (typeof ResizeObserver !== 'undefined' && playerShell) {
			playerResizeObserver = new ResizeObserver(syncPlayerInset);
			playerResizeObserver.observe(playerShell);
		}

		return () => {
			window.removeEventListener('resize', syncPlayerInset);
			window.removeEventListener('missionnaire-audio-toggle', handleExternalToggle);
			window.removeEventListener('missionnaire-audio-play', playCurrentAudio);
			window.removeEventListener('missionnaire-audio-pause', pauseCurrentAudio);
			playerResizeObserver?.disconnect();
			playerResizeObserver = null;
			lastPlayerInset = 0;
			document.documentElement.style.setProperty('--audio-player-height', '0px');
		};
	});

	onDestroy(() => {
		stopResumeWatchdog();
		if (audio) {
			audio.pause();
			audio.removeEventListener('ended', handleEnded);
			audio.removeEventListener('timeupdate', updateAudioTime);
			audio.removeEventListener('timeupdate', updateIndicator);
		}
		lastPlayerInset = 0;
		document.documentElement.style.setProperty('--audio-player-height', '0px');
	});
</script>

<svelte:window 
	on:keydown={handleKeydown} 
	on:mousemove={handleDrag}
	on:touchmove={handleDrag}
	on:mouseup={endDrag}
	on:touchend={endDrag}
/>

{#if $selectAudio}
<div
	bind:this={playerShell}
	class="fixed z-[100] bottom-0 left-0 w-full bg-white/95 backdrop-blur-md border-t border-stone-200 shadow-[0_-4px_20px_rgb(0,0,0,0.06)] pb-safe pt-2 md:pt-4 md:pb-4"
>
	<!-- Top Progress Bar -->
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
	bind:this={progressBarElement}
	class="absolute top-0 left-0 w-full h-8 -translate-y-1/2 cursor-pointer group/progress flex items-center justify-start z-50 touch-none select-none"
	on:mousedown={startDrag}
	on:touchstart|nonpassive={startDrag}
	on:click={seekTo}
>
	<!-- Visual Track -->
	<div class="w-full h-[4px] bg-stone-200 relative overflow-visible rounded-full">
		<!-- Active Progress -->
		<div 
			class="h-full bg-missionnaire rounded-full relative" 
			style="width: {progressBarWidth}%"
		>
			<!-- Indicator Knob -->
			<div 
				class="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 bg-missionnaire border-[3px] border-white rounded-full shadow-md transform transition-transform duration-100 {isDragging ? 'scale-125' : 'scale-100'} md:scale-0 md:group-hover/progress:scale-100"
			></div>
		</div>
	</div>
</div>

	<div class="px-5 md:px-10 max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:gap-8">
		<!-- Info Row -->
		<div class="flex items-center justify-between mb-3 md:mb-0 md:flex-1 md:min-w-0">
			<div class="flex-1 min-w-0 min-h-[2.75rem] md:min-h-[3rem]">
				<div class="text-[10px] uppercase tracking-[0.2em] font-bold text-missionnaire mb-0.5 opacity-80">Lecture en cours</div>
				<div class="font-black text-sm md:text-lg text-stone-900 truncate pr-4" title={getDisplayTitle($selectAudio)}>
					{getDisplayTitle($selectAudio)}
				</div>
				{#if !isAudioReady}
					<div class="text-[10px] font-medium uppercase tracking-[0.15em] text-stone-400 mt-1">
						Chargement...
					</div>
				{/if}
				<div class="flex items-center gap-2 mt-0.5 md:hidden">
					<span class="text-[10px] font-medium text-stone-400">{formatTime(currentTime)}</span>
					<div class="w-1 h-1 rounded-full bg-stone-200"></div>
					<span class="text-[10px] font-medium text-stone-400">{formatTime(duration)}</span>
				</div>
			</div>

			<button
				class="p-2 rounded-full transition-colors flex-shrink-0 {isCurrentFavorite ? 'text-red-500 hover:text-red-600' : 'text-stone-300 hover:text-red-400'}"
				on:click={handleToggleFavorite}
				aria-label={isCurrentFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
				title={isCurrentFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
			>
				<Icon src={isCurrentFavorite ? BsHeartFill : BsHeart} size="18" />
			</button>

			<button
				class="bg-stone-50 hover:bg-stone-100 text-stone-400 hover:text-stone-800 p-2 rounded-full transition-colors md:hidden"
				on:click={() => {
					selectAudio.set(null);
					if (audio) audio.pause();
				}}
				aria-label="Fermer le lecteur"
			>
				<Icon src={BsX} size="20" />
			</button>
		</div>

		<!-- Controls & Time Row -->
		<div class="flex flex-col items-center md:flex-row md:gap-6 w-full md:w-auto">
			<!-- Main Playback Controls -->
			<div class="flex items-center justify-center gap-4 md:gap-6">
				<!-- Repeat/Auto-next on mobile side -->
				<div class="flex md:hidden items-center gap-1">
					<button 
						on:click={toggleShuffle} 
						class="p-2 transition-all {$isShuffle ? 'text-missionnaire' : 'text-stone-300'}"
					>
						<Icon src={BsShuffle} size="16" />
					</button>
				</div>

				<div class="flex items-center gap-1 md:gap-3">
					<button on:click={playPrevious} class="p-2 text-stone-600 hover:text-missionnaire transition-colors" title="Précédent">
						<Icon src={BsSkipStartFill} size="22" />
					</button>

					<button on:click={() => seekBackward()} class="hidden md:block p-2 text-stone-300 hover:text-missionnaire transition-colors" title="-5s">
						<Icon src={BsSkipBackwardFill} size="16" />
					</button>

					<button on:click={togglePlay} class="relative flex items-center justify-center w-14 h-14 md:w-12 md:h-12 bg-missionnaire text-white rounded-full hover:scale-105 transition-transform shadow-lg shadow-missionnaire/20">
						{#if $isPlaying}
							<Icon src={BsPauseCircleFill} size="32" />
						{:else}
							<Icon src={BsPlayCircleFill} size="32" />
						{/if}
					</button>

					<button on:click={() => seekForward()} class="hidden md:block p-2 text-stone-300 hover:text-missionnaire transition-colors" title="+5s">
						<Icon src={BsSkipForwardFill} size="16" />
					</button>

					<button on:click={playNext} class="p-2 text-stone-600 hover:text-missionnaire transition-colors" title="Suivant">
						<Icon src={BsSkipEndFill} size="22" />
					</button>
				</div>

				<!-- Auto-Next Side -->
				<div class="flex md:hidden items-center gap-1">
					<button 
						on:click={toggleAutoNext} 
						class="p-2 transition-all {$autoNext ? 'text-missionnaire bg-orange-50 rounded-lg' : 'text-stone-300'}"
						title={$autoNext ? 'Lecture auto activée' : 'Lecture auto désactivée'}
					>
						<Icon src={RiMediaPlayList2Fill} size="18" />
					</button>
				</div>
			</div>

			<!-- Time & Extra Controls (Desktop) -->
			<div class="hidden md:flex items-center gap-6">
				<div class="flex items-center gap-1.5 font-bold text-[13px] text-stone-500 min-w-[90px]">
					<span class="text-stone-500">{formatTime(currentTime)}</span>
					<span class="text-stone-300">/</span>
					<span>{formatTime(duration)}</span>
				</div>

				<div class="flex items-center gap-2 border-l border-stone-100 pl-6">
					<button 
						on:click={toggleShuffle} 
						class="p-2.5 rounded-full transition-all flex items-center gap-2 {$isShuffle ? 'bg-missionnaire text-white' : 'bg-stone-50 text-stone-400 hover:bg-stone-100 hover:text-stone-600'}"
						title={$isShuffle ? 'Aléatoire activé' : 'Aléatoire désactivé'}
					>
						<Icon src={BsShuffle} size="16" />
					</button>

					<button 
						on:click={toggleAutoNext} 
						class="p-2.5 rounded-full transition-all flex items-center gap-2 {$autoNext ? 'bg-missionnaire text-white shadow-md shadow-missionnaire/20' : 'bg-stone-50 text-stone-400 hover:bg-stone-100'}"
						title={$autoNext ? 'Lecture auto activée' : 'Lecture auto désactivée'}
					>
						<Icon src={RiMediaPlayList2Fill} size="18" />
					</button>

					<div class="flex items-center gap-2 ml-2">
						<button on:click={toggleMute} class="p-2 text-stone-400 hover:text-missionnaire transition-colors">
							{#if !isMuted}
								<Icon src={BsVolumeUpFill} size="20" />
							{:else}
								<Icon src={BsVolumeMuteFill} size="20" />
							{/if}
						</button>
					</div>

					<button
						class="ml-4 bg-gray-900 text-white p-2 rounded-full hover:bg-black transition-colors"
						on:click={() => {
							selectAudio.set(null);
							if (audio) audio.pause();
						}}
					>
						<Icon src={BsX} size="20" />
					</button>
				</div>
			</div>
		</div>
	</div>
</div>
{/if}

<style>
</style>
