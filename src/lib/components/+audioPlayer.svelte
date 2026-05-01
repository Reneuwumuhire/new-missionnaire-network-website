<script lang="ts">
	import { browser } from '$app/environment';
	import { getContext, onDestroy, onMount } from 'svelte';
	import { get } from 'svelte/store';
	import {
		clearPlayerSnapshot,
		clearResumeState,
		pendingPlaybackSeek
	} from '$lib/utils/audioResume';
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
	import BsThreeDotsVertical from 'svelte-icons-pack/bs/BsThreeDotsVertical';
	import {
		selectAudio,
		playlist,
		basePlaylist,
		currentIndex,
		isShuffle,
		isPlaying,
		playbackIntent,
		repeatOne
	} from '../stores/global';
	import type { AudioAsset } from '$lib/models/media-assets';
	import type { MusicAudio } from '$lib/models/music-audio';
	import type { Sermon } from '$lib/models/sermon';
	import RiMediaRepeatOneLine from 'svelte-icons-pack/ri/RiMediaRepeatOneLine';
	import BsSkipStartFill from 'svelte-icons-pack/bs/BsSkipStartFill';
	import BsSkipEndFill from 'svelte-icons-pack/bs/BsSkipEndFill';
	import {
		findAdjacentPlayableIndex,
		getPlayableAudioUrl,
		type PlayableAudio
	} from '../../utils/audioPlayback';
	import { toggleFavorite, isFavorite, favorites } from '../stores/musicHistory';
	// ── BEGIN: cache indicator imports (added) ────────────────────
	import { isCached, prefetchAudio } from '$lib/audioCache';
	import { isOnline } from '$lib/onlineStatus';
	// ── END: cache indicator imports ──────────────────────────────

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
	let lastKnownPlaybackTime = 0;
	let lastKnownPlaybackDuration = 0;
	let pendingSessionResumeTime: number | null = null;
	let isChangingSource = false;
	const SLEEP_TIMER_STORAGE_KEY = 'missionnaire:sleep-timer-ends-at';
	const sleepTimerOptions = [15, 30, 45, 60, 90];
	let isSleepTimerOpen = false;
	let sleepTimerEndsAt: number | null = null;
	let sleepTimerRemainingMs = 0;
	let sleepTimerTimeout: ReturnType<typeof setTimeout> | null = null;
	let sleepTimerTick: ReturnType<typeof setInterval> | null = null;
	let customSleepTime = '';

	$: sleepTimerRemainingLabel =
		sleepTimerEndsAt !== null ? formatSleepTimerRemaining(sleepTimerRemainingMs) : '';
	$: sleepTimerEndLabel =
		sleepTimerEndsAt !== null ? formatSleepTimerEndTime(sleepTimerEndsAt) : '';
	$: if (browser && isSleepTimerOpen && !customSleepTime) {
		setDefaultSleepTimerClockTime();
	}

	function setPendingPlaybackIntent(intent: 'play' | 'pause' | null) {
		pendingPlaybackIntent = intent;
	}

	function playCurrentAudio() {
		if (!audio) return;
		setPendingPlaybackIntent('play');
		setUserWantsToPlay(true);
		if (audio.duration && audio.currentTime >= audio.duration) {
			audio.currentTime = 0;
		}
		safePlay('auto');
	}

	function pauseCurrentAudio() {
		if (!audio || audio.paused) return;
		setPendingPlaybackIntent('pause');
		setUserWantsToPlay(false);
		rememberPlaybackPosition();
		audio.pause();
	}

	function stopAudioForSleepTimer() {
		setUserWantsToPlay(false);
		shouldAutoplayOnLoad = false;
		stopResumeWatchdog();
		rememberPlaybackPosition();

		if (audio && !audio.paused) {
			setPendingPlaybackIntent('pause');
			audio.pause();
		} else {
			setPendingPlaybackIntent(null);
			isPlaying.set(false);
		}

		if ('mediaSession' in navigator) {
			navigator.mediaSession.playbackState = 'paused';
		}
	}

	function closeAudioPlayer() {
		setUserWantsToPlay(false);
		shouldAutoplayOnLoad = false;
		stopResumeWatchdog();

		if (audio && !audio.paused) {
			setPendingPlaybackIntent('pause');
			rememberPlaybackPosition();
			audio.pause();
		}

		selectAudio.set(null);
		isPlaying.set(false);
		pendingPlaybackSeek.set(null);
		clearResumeState();
		clearPlayerSnapshot();
	}

	function formatSleepTimerRemaining(ms: number) {
		const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
		if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
		return `${seconds}s`;
	}

	function formatSleepTimerEndTime(timestamp: number) {
		return new Intl.DateTimeFormat('fr-FR', {
			hour: '2-digit',
			minute: '2-digit'
		}).format(new Date(timestamp));
	}

	function clearSleepTimer(options: { persist?: boolean; closeMenu?: boolean } = {}) {
		const persist = options.persist ?? true;
		if (sleepTimerTimeout) {
			clearTimeout(sleepTimerTimeout);
			sleepTimerTimeout = null;
		}
		if (sleepTimerTick) {
			clearInterval(sleepTimerTick);
			sleepTimerTick = null;
		}
		sleepTimerEndsAt = null;
		sleepTimerRemainingMs = 0;
		customSleepTime = '';
		if (options.closeMenu) {
			isSleepTimerOpen = false;
		}
		if (persist && browser) {
			localStorage.removeItem(SLEEP_TIMER_STORAGE_KEY);
		}
	}

	function handleSleepTimerFinished() {
		if (sleepTimerEndsAt === null) return;
		clearSleepTimer({ closeMenu: true });
		stopAudioForSleepTimer();
	}

	function refreshSleepTimerRemaining() {
		if (sleepTimerEndsAt === null) return;
		const remaining = sleepTimerEndsAt - Date.now();
		if (remaining <= 0) {
			handleSleepTimerFinished();
			return;
		}
		sleepTimerRemainingMs = remaining;
	}

	function scheduleSleepTimer(endsAt: number, options: { persist?: boolean } = {}) {
		if (!Number.isFinite(endsAt)) return;

		clearSleepTimer({ persist: false });
		sleepTimerEndsAt = endsAt;
		isSleepTimerOpen = false;
		refreshSleepTimerRemaining();

		if (sleepTimerEndsAt === null) return;

		if ((options.persist ?? true) && browser) {
			localStorage.setItem(SLEEP_TIMER_STORAGE_KEY, String(endsAt));
		}

		const delay = Math.max(0, endsAt - Date.now());
		sleepTimerTimeout = setTimeout(handleSleepTimerFinished, Math.min(delay, 2_147_483_647));
		sleepTimerTick = setInterval(refreshSleepTimerRemaining, 1000);
	}

	function setSleepTimerForMinutes(minutes: number) {
		if (!Number.isFinite(minutes) || minutes <= 0) return;
		scheduleSleepTimer(Date.now() + minutes * 60 * 1000);
	}

	function setDefaultSleepTimerClockTime() {
		const target = new Date(Date.now() + 10 * 60 * 1000);
		const hours = target.getHours().toString().padStart(2, '0');
		const minutes = target.getMinutes().toString().padStart(2, '0');
		customSleepTime = `${hours}:${minutes}`;
	}

	function setSleepTimerForClockTime(value: string) {
		const match = /^(\d{2}):(\d{2})$/.exec(value);
		if (!match) return;

		const hours = Number(match[1]);
		const minutes = Number(match[2]);
		if (hours > 23 || minutes > 59) return;

		const target = new Date();
		target.setHours(hours, minutes, 0, 0);
		if (target.getTime() <= Date.now() + 1000) {
			target.setDate(target.getDate() + 1);
		}
		scheduleSleepTimer(target.getTime());
	}

	function rememberPlaybackPosition(
		time = audio?.currentTime ?? 0,
		mediaDuration = audio?.duration ?? 0
	) {
		if (!Number.isFinite(time) || time < 0) return;
		lastKnownPlaybackTime = time;
		if (Number.isFinite(mediaDuration) && mediaDuration > 0) {
			lastKnownPlaybackDuration = mediaDuration;
		}
	}

	function resetRememberedPlaybackPosition() {
		lastKnownPlaybackTime = 0;
		lastKnownPlaybackDuration = 0;
		pendingSessionResumeTime = null;
	}

	function getReliablePlaybackTime() {
		if (!audio) return 0;
		const liveTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
		// audio.load() can temporarily report 0 during an OS interruption. Keep
		// the last real playback position so the next play() does not restart.
		if (liveTime <= 0.25 && lastKnownPlaybackTime > 0.25) {
			return lastKnownPlaybackTime;
		}
		return Math.max(0, liveTime);
	}

	function restorePlaybackPosition(time: number) {
		if (!audio || !Number.isFinite(time) || time <= 0) return false;
		try {
			audio.currentTime = time;
			currentTime = time;
			const mediaDuration =
				Number.isFinite(audio.duration) && audio.duration > 0
					? audio.duration
					: lastKnownPlaybackDuration;
			if (mediaDuration > 0) {
				duration = mediaDuration;
				progressBarWidth = (time / mediaDuration) * 100;
				indicatorPosition = progressBarWidth;
			}
			rememberPlaybackPosition(time, mediaDuration);
			return true;
		} catch {
			// metadata may not be loaded yet — keep the pending time for canplay
			return false;
		}
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

	function setUserWantsToPlay(v: boolean) {
		userWantsToPlay = v;
		// Mirror to the global store so the resume recorder can read intent
		// when deciding whether to rehydrate the player on a cold reload.
		// Without this, an OS-initiated pause (phone call, Siri) right
		// before iOS kills the PWA would persist `isPlaying: false` and
		// the player wouldn't come back, even though the user was actively
		// listening when interrupted.
		playbackIntent.set(v);
	}

	// True when the currently loaded track was paused by the OS (phone call,
	// Siri, audio focus grab) at any point. We rebuild the audio session
	// before auto-advancing to the next track in that case — without it,
	// iOS's degraded session can leave the next track silent or stuttering
	// (the symptom users describe as "the next song doesn't play immediately"
	// or "the audio feels corrupted until I refresh"). Reset on every track
	// switch.
	let currentTrackInterrupted = false;

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

	/** Set true when onDestroy has run. Every code path that could call
	 *  audio.play() — the pause-event-driven watchdog, safePlay's deferred
	 *  finish(), the reactive $isPlaying sync block — checks this flag
	 *  before touching the audio element. Without this guard, Vite HMR
	 *  on a playing component leaks the old <audio>: pause() fires the
	 *  pause listener which (seeing userWantsToPlay === true) starts a
	 *  fresh watchdog interval on the orphaned element, and play() keeps
	 *  resuming it 1.5s later — overlapping the new component's playback. */
	let destroyed = false;
	let isPageLifecycleTeardown = false;

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

	// ── BEGIN: cache indicator state (added) ──────────────────────
	// Tracks whether the currently playing track has been cached by
	// the service worker. `null` while we don't know yet (initial
	// load / between tracks); boolean once isCached() resolves.
	let isCurrentTrackCached: boolean | null = null;
	let cacheCheckToken = 0;

	async function refreshCachedFlag(url: string, token: number) {
		if (!url) {
			isCurrentTrackCached = null;
			return;
		}
		const result = await isCached(url);
		// Drop the result if a newer track was selected mid-flight.
		if (token !== cacheCheckToken) return;
		isCurrentTrackCached = result;
	}

	// Re-check the cache flag whenever the selected track changes OR
	// whenever it starts playing (so a freshly fetched-and-cached track
	// flips its badge from "not cached" to "cached" without a refresh).
	$: if (browser && $selectAudio) {
		const url = getPlayableAudioUrl($selectAudio as PlayableAudio);
		isCurrentTrackCached = null;
		cacheCheckToken++;
		void refreshCachedFlag(url, cacheCheckToken);
	}

	$: if (browser && $isPlaying && $selectAudio) {
		const url = getPlayableAudioUrl($selectAudio as PlayableAudio);
		const token = ++cacheCheckToken;
		// Small delay: let the SW finish writing the response to cache
		// before we re-check, otherwise the first poll always misses.
		setTimeout(() => void refreshCachedFlag(url, token), 1500);
	}

	$: showOfflineUnavailable = browser && !$isOnline && isCurrentTrackCached === false;

	// ── Adjacent-track prefetch (added) ──────────────────────────
	// On 3G the audio element still has to wait for the first bytes
	// of each track to arrive over the wire. Warming the NEXT track
	// in the playlist while the current one plays makes "Next" feel
	// instant even when the network is slow. The fetch flows through
	// the SW, which writes the body into `audio-cache-v1`, so by the
	// time the listener hits the next track its file is already on
	// disk and only needs slicing for the Range request.
	//
	// Delay before kicking off so the current track gets first call
	// on the connection — on a slow link, racing the prefetch against
	// the active stream would slow down both. 4 s is enough for the
	// audio element to have its initial buffer; we then quietly
	// prefetch the next URL with `priority: 'low'`.
	let prefetchTimer: ReturnType<typeof setTimeout> | null = null;

	// Sermons (predications) are 30–120 MB long-form files we deliberately
	// keep out of the cache, so don't prefetch the next track when the
	// current one is a sermon either. Detection: Sermon has `mp3_url` and
	// not `s3_url`; MusicAudio has `s3_url`; AudioAsset has neither.
	function isSermonItem(item: unknown): boolean {
		return !!item && typeof item === 'object' && 'mp3_url' in item && !('s3_url' in item);
	}

	$: if (browser && $selectAudio && $playlist.length > 1) {
		if (prefetchTimer) clearTimeout(prefetchTimer);

		if (isSermonItem($selectAudio)) {
			// No-op: skip prefetch entirely while a sermon is playing.
		} else {
			const nextIndex = findAdjacentPlayableIndex(
				$playlist as PlayableAudio[],
				$currentIndex,
				1,
				false
			);
			const nextItem = nextIndex >= 0 ? $playlist[nextIndex] : null;
			// Also skip if the *next* track is a sermon — no point warming it.
			const nextUrl =
				nextItem && !isSermonItem(nextItem) ? getPlayableAudioUrl(nextItem as PlayableAudio) : '';
			if (nextUrl) {
				prefetchTimer = setTimeout(() => void prefetchAudio(nextUrl), 4000);
			}
		}
	}

	onDestroy(() => {
		if (prefetchTimer) clearTimeout(prefetchTimer);
	});
	// ── END: cache indicator state ────────────────────────────────

	function clearFinishedPlayerSnapshot() {
		setUserWantsToPlay(false);
		clearResumeState();
		clearPlayerSnapshot();
	}

	function handleEnded() {
		if ($repeatOne && audio) {
			currentTime = 0;
			progressBarWidth = 0;
			indicatorPosition = 0;
			resetRememberedPlaybackPosition();

			try {
				audio.currentTime = 0;
			} catch {
				/* ignore seek failure at end of media */
			}

			setPendingPlaybackIntent('play');
			setUserWantsToPlay(true);
			const playPromise = audio.play();
			if (playPromise) {
				playPromise.catch((e) => {
					setPendingPlaybackIntent(null);
					console.error('[AudioPlayer] Repeat failed:', e);
					isPlaying.set(false);
				});
			}
			isPlaying.set(true);
			return;
		}

		if ($playlist.length === 0) {
			clearFinishedPlayerSnapshot();
			isPlaying.set(false);
			return;
		}

		const nextIndex = findAdjacentPlayableIndex(
			$playlist as PlayableAudio[],
			$currentIndex,
			1,
			$playlist.length > 1
		);

		if (nextIndex === -1 || nextIndex === $currentIndex) {
			clearFinishedPlayerSnapshot();
			isPlaying.set(false);
			return;
		}

		const nextItem = $playlist[nextIndex];
		const nextUrl = getPlayableAudioUrl(nextItem as PlayableAudio);

		if (!nextUrl) {
			clearFinishedPlayerSnapshot();
			isPlaying.set(false);
			return;
		}

		// iOS PWA background: keep the audio session alive by swapping src on the
		// existing element and calling play() synchronously — without pausing
		// first and without waiting for the async `canplay` event (which the
		// reactive-statement path relies on). Pausing or deferring play() breaks
		// background playback when the screen is locked.
		//
		// Exception: if the previous track was interrupted by the OS (phone
		// call, Siri), the audio session is in a degraded state. A bare
		// play() can leave the next track silent or stuttering ("corrupted
		// until refresh"). In that case we mirror safePlay('long') — call
		// load() to rebuild the session, then play() once canplay fires.
		if (audio) {
			const encodedUrl = encodeURI(nextUrl);
			audioSrc = nextUrl; // prevents the reactive $: block from re-loading
			isAudioReady = false;
			currentTime = 0;
			duration = 0;
			progressBarWidth = 0;
			indicatorPosition = 0;
			resetRememberedPlaybackPosition();

			const wasInterrupted = currentTrackInterrupted;
			currentTrackInterrupted = false;

			audio.src = encodedUrl;

			if (wasInterrupted) {
				let settled = false;
				const playWhenReady = () => {
					if (settled) return;
					settled = true;
					if (destroyed || !audio) return;
					if (audio.src !== encodedUrl) return;
					audio.play().catch((e) => {
						console.warn('[AudioPlayer] Post-interruption next-track play failed:', e);
						isPlaying.set(false);
					});
				};
				audio.addEventListener('canplay', playWhenReady, { once: true });
				// Safety net if `canplay` never fires (slow network, cached
				// edge case). Mirrors the 2 s safety in safePlay().
				setTimeout(playWhenReady, 2000);
				try {
					audio.load();
				} catch (err) {
					console.warn('[AudioPlayer] handleEnded load() failed:', err);
					playWhenReady();
				}
			} else {
				const playPromise = audio.play();
				if (playPromise) {
					playPromise.catch((e) => {
						console.error('[AudioPlayer] Autoplay next failed:', e);
						isPlaying.set(false);
					});
				}
			}

			if ('mediaSession' in navigator) {
				navigator.mediaSession.playbackState = 'playing';
			}
		}

		currentIndex.set(nextIndex);
		selectAudio.set(nextItem);
		isPlaying.set(true);
	}

	const toggleRepeatOne = () => {
		repeatOne.update((v) => !v);
	};

	function toggleShuffle() {
		isShuffle.update((shuffle) => {
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
					const newIndex = list.findIndex((s) => {
						const url =
							's3_url' in s ? s.s3_url : 'mp3_url' in s ? s.mp3_url : (s as AudioAsset).url;
						const currentUrl =
							's3_url' in currentSong
								? currentSong.s3_url
								: 'mp3_url' in currentSong
									? currentSong.mp3_url
									: (currentSong as AudioAsset).url;
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
					const newIndex = originalList.findIndex((s) => {
						const url =
							's3_url' in s ? s.s3_url : 'mp3_url' in s ? s.mp3_url : (s as AudioAsset).url;
						const currentUrl =
							's3_url' in currentSong
								? currentSong.s3_url
								: 'mp3_url' in currentSong
									? currentSong.mp3_url
									: (currentSong as AudioAsset).url;
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

		const nextIndex = findAdjacentPlayableIndex(
			$playlist as PlayableAudio[],
			$currentIndex,
			1,
			true
		);
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
		console.log('[AudioPlayer] Updating source to:', encodedUrl);
		// New track — drop any "previous track was interrupted" carry-over.
		currentTrackInterrupted = false;
		isAudioReady = false;
		currentTime = 0;
		duration = 0;
		progressBarWidth = 0;
		indicatorPosition = 0;
		const shouldResumePlayback = shouldAutoplayOnLoad || $isPlaying || userWantsToPlay;
		shouldAutoplayOnLoad = shouldResumePlayback;

		if (audio) {
			isChangingSource = true;
			try {
				audio.pause();
			} finally {
				isChangingSource = false;
			}
			resetRememberedPlaybackPosition();
			audio.src = encodedUrl;
			audio.load();
		} else {
			resetRememberedPlaybackPosition();
			audio = new Audio(encodedUrl);
			audio.crossOrigin = 'anonymous';
			audio.addEventListener('ended', handleEnded);
			audio.addEventListener('timeupdate', updateAudioTime);
			audio.addEventListener('timeupdate', updateIndicator);
			audio.addEventListener('play', () => {
				setPendingPlaybackIntent(null);
				setUserWantsToPlay(true);
				if (pendingSessionResumeTime !== null) {
					const restored = restorePlaybackPosition(pendingSessionResumeTime);
					if (restored) pendingSessionResumeTime = null;
				}
				audioPausedAt = 0;
				stopResumeWatchdog();
				isPlaying.set(true);
				if ('mediaSession' in navigator) {
					navigator.mediaSession.playbackState = 'playing';
				}
			});
			audio.addEventListener('pause', () => {
				if (isChangingSource) return;
				setPendingPlaybackIntent(null);
				rememberPlaybackPosition();
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
				// Also flag the current track as interrupted so handleEnded
				// rebuilds the audio session before auto-advancing — without
				// that rebuild, the post-interruption iOS session can leave
				// the next track silent or stuttering until a manual refresh.
				if (userWantsToPlay) {
					currentTrackInterrupted = true;
					startResumeWatchdog();
				}
			});
			audio.addEventListener('loadedmetadata', () => {
				duration = audio.duration;
				if (pendingSessionResumeTime !== null) {
					restorePlaybackPosition(pendingSessionResumeTime);
				}
				console.log('[AudioPlayer] Metadata loaded, duration:', duration);
			});
			audio.addEventListener('canplay', () => {
				isAudioReady = true;
				if (pendingSessionResumeTime !== null) {
					restorePlaybackPosition(pendingSessionResumeTime);
				}
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
				console.error('[AudioPlayer] Audio error:', e);
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
	$: if (browser && audio && !destroyed && $isPlaying !== undefined) {
		if ($isPlaying && audio.paused) {
			if (pendingPlaybackIntent !== 'pause') {
				setUserWantsToPlay(true);
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
		console.log('[AudioPlayer] Selected audio change, raw URL:', rawUrl);

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
			rememberPlaybackPosition(newTime, duration);
		}
	};

	const seekForward = (seconds: number = 5) => {
		if (!audio) return;
		audio.currentTime += seconds;
		rememberPlaybackPosition();
		updateAudioTime();
		updateIndicator();
	};

	const seekBackward = (seconds: number = 5) => {
		if (!audio) return;
		audio.currentTime -= seconds;
		rememberPlaybackPosition();
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
			rememberPlaybackPosition(currentTime, duration);
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
		rememberPlaybackPosition(newPosition, duration);
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
		rememberPlaybackPosition(newPosition, duration);
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
		// HMR / unmount safety — never resume a destroyed component's
		// audio. The deferred `finish()` setTimeout below also rechecks.
		if (destroyed) return;

		const pausedMs = audioPausedAt > 0 ? Date.now() - audioPausedAt : 0;

		// Cold-load rehydration sets `pendingPlaybackSeek` so the first
		// user-tap-play after a snapshot restore lands at the saved time.
		// iOS clamps bare `currentTime` assignments to 0 before metadata is
		// fully loaded, so we route through the load() + canplay-driven
		// seek path which is reliable. Match by URL: a leftover hint from
		// a previous session is ignored once the user picks a new track.
		const seekHint = get(pendingPlaybackSeek);
		const sel = get(selectAudio);
		const currentSelUrl = sel ? getPlayableAudioUrl(sel as PlayableAudio) : '';
		const hasOverrideSeek =
			!!seekHint &&
			seekHint.url === currentSelUrl &&
			Number.isFinite(seekHint.time) &&
			seekHint.time > 0;

		const needsReload =
			reasonHint === 'long' ||
			hasOverrideSeek ||
			(reasonHint === 'auto' && pausedMs >= PAUSE_RELOAD_THRESHOLD_MS);

		if (!needsReload) {
			// Don't probe with play() while a reload is in flight — the
			// in-flight finish() will play() once the session is rebuilt.
			if (isReloadingSession) return;
			if (pendingSessionResumeTime !== null) {
				restorePlaybackPosition(pendingSessionResumeTime);
			} else if (audio.currentTime <= 0.25 && lastKnownPlaybackTime > 0.25) {
				restorePlaybackPosition(lastKnownPlaybackTime);
			}
			audio.play().catch((err) => {
				console.warn('[AudioPlayer] play() failed:', err);
			});
			return;
		}

		// Skip if a reload is already running. The in-flight finish() will
		// restore position and start playback — a second load() would abort
		// the first, corrupt buffers, and capture a bogus savedTime (0).
		// Don't consume the override hint yet: we haven't actually used it.
		if (isReloadingSession) return;

		// Consume the override now that we're committed to the reload path.
		// Doing this only after the early-return guards above ensures a hint
		// isn't wasted if we bail out without using it.
		if (hasOverrideSeek) {
			pendingPlaybackSeek.set(null);
		}

		const savedTime = hasOverrideSeek ? seekHint.time : getReliablePlaybackTime();
		const savedSrc = audio.src;
		if (savedTime > 0.25) {
			pendingSessionResumeTime = savedTime;
		}
		isReloadingSession = true;
		let settled = false;
		const finish = () => {
			if (settled) return;
			settled = true;
			isReloadingSession = false;
			// The 2s safety-net timeout below can fire after the component
			// has been destroyed (HMR, navigation away). Don't resume.
			if (destroyed) return;
			if (!audio || audio.src !== savedSrc) return;
			restorePlaybackPosition(pendingSessionResumeTime ?? savedTime);
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
		// Critical for HMR: the pause event handler calls us when
		// userWantsToPlay is true, which is true at the moment onDestroy
		// runs audio.pause(). Without this guard a fresh interval would
		// start on the about-to-be-orphaned audio element.
		if (destroyed) return;
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

		const markPageLifecycleTeardown = () => {
			isPageLifecycleTeardown = true;
		};
		const clearPageLifecycleTeardown = () => {
			isPageLifecycleTeardown = false;
		};
		const onVisibility = () => {
			if (document.visibilityState === 'hidden') {
				appHiddenAt = Date.now();
			} else {
				clearPageLifecycleTeardown();
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
		window.addEventListener('pagehide', markPageLifecycleTeardown);
		window.addEventListener('beforeunload', markPageLifecycleTeardown);

		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			window.removeEventListener('focus', onFocus);
			window.removeEventListener('pageshow', onPageShow);
			window.removeEventListener('pagehide', markPageLifecycleTeardown);
			window.removeEventListener('beforeunload', markPageLifecycleTeardown);
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
				setUserWantsToPlay(true);
				// Lock-screen / Bluetooth play: route through safePlay so a
				// long paused-on-lockscreen window reloads the audio session
				// before attempting playback. Without this, play() resumes
				// silently over Bluetooth after a few seconds of pause.
				safePlay('auto');
			});
			navigator.mediaSession.setActionHandler('pause', () => {
				setUserWantsToPlay(false);
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
				rememberPlaybackPosition(details.seekTime, audio.duration);
			});
			navigator.mediaSession.setActionHandler('stop', () => {
				setUserWantsToPlay(false);
				if (audio) {
					audio.pause();
					audio.currentTime = 0;
				}
				resetRememberedPlaybackPosition();
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
			title:
				('title' in current
					? current.title
					: isSermon
						? (current as Sermon).french_title || (current as Sermon).english_title
						: 'Sans titre') || 'Sans titre',
			artist: isMusic
				? (current as MusicAudio).artist || 'Artiste inconnu'
				: isSermon
					? (current as Sermon).author
					: 'Missionnaire',
			album: isMusic
				? (current as MusicAudio).book_full_name ||
					(current as MusicAudio).category ||
					'Missionnaire'
				: isSermon
					? (current as Sermon).iso_date || 'Prédication'
					: 'Media',
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
		if (event.key === 'Escape' && isSleepTimerOpen) {
			isSleepTimerOpen = false;
			return;
		}

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
		const closeSleepTimerMenu = () => {
			isSleepTimerOpen = false;
		};

		const savedSleepTimer = Number(localStorage.getItem(SLEEP_TIMER_STORAGE_KEY));
		if (Number.isFinite(savedSleepTimer) && savedSleepTimer > Date.now()) {
			scheduleSleepTimer(savedSleepTimer, { persist: false });
		} else {
			localStorage.removeItem(SLEEP_TIMER_STORAGE_KEY);
		}

		window.addEventListener('resize', syncPlayerInset);
		window.addEventListener('click', closeSleepTimerMenu);
		window.addEventListener('missionnaire-audio-toggle', handleExternalToggle);
		window.addEventListener('missionnaire-audio-play', playCurrentAudio);
		window.addEventListener('missionnaire-audio-pause', pauseCurrentAudio);

		if (typeof ResizeObserver !== 'undefined' && playerShell) {
			playerResizeObserver = new ResizeObserver(syncPlayerInset);
			playerResizeObserver.observe(playerShell);
		}

		return () => {
			window.removeEventListener('resize', syncPlayerInset);
			window.removeEventListener('click', closeSleepTimerMenu);
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
		// Order matters. Set `destroyed` first so every guarded code
		// path bails — including the pause-event handler that runs
		// synchronously inside audio.pause() below. On explicit closes we
		// clear userWantsToPlay, but during page/app teardown we preserve it
		// so the resume recorder can rehydrate the player after a cold return.
		// Only after that do we touch the audio element.
		const preservePlaybackIntent =
			browser &&
			userWantsToPlay &&
			(isPageLifecycleTeardown || document.visibilityState === 'hidden');

		destroyed = true;
		if (!preservePlaybackIntent) {
			setUserWantsToPlay(false);
		}
		shouldAutoplayOnLoad = false;
		clearSleepTimer({ persist: false });
		stopResumeWatchdog();
		if (audio) {
			try {
				audio.pause();
				// Detach the source and force the media pipeline to release.
				// Without this, the orphaned audio element keeps its network
				// stream alive and can resume when the new component mounts.
				audio.removeAttribute('src');
				audio.load();
			} catch {
				/* ignore — element may already be in a dead state */
			}
			audio.removeEventListener('ended', handleEnded);
			audio.removeEventListener('timeupdate', updateAudioTime);
			audio.removeEventListener('timeupdate', updateIndicator);
		}
		// Drop the reference so any stray async callback that escaped
		// the destroyed guard finds nothing to play on.
		audio = null as unknown as HTMLAudioElement;
		isPlaying.set(false);
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
						class="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-4 bg-missionnaire border-[3px] border-white rounded-full shadow-md transform transition-transform duration-100 {isDragging
							? 'scale-125'
							: 'scale-100'} md:scale-0 md:group-hover/progress:scale-100"
					></div>
				</div>
			</div>
		</div>

		<div class="px-5 md:px-10 max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:gap-8">
			<!-- Info Row -->
			<div class="flex items-center justify-between mb-3 md:mb-0 md:flex-1 md:min-w-0">
				<div class="flex-1 min-w-0 min-h-[2.75rem] md:min-h-[3rem]">
					<div
						class="text-[10px] uppercase tracking-[0.2em] font-bold text-missionnaire mb-0.5 opacity-80 flex items-center gap-2"
					>
						<span>Lecture en cours</span>
						<!-- ── BEGIN: cache indicator badge (added) ──────────── -->
						{#if isCurrentTrackCached === true}
							<span
								class="inline-flex items-center gap-1 text-[9px] font-semibold tracking-normal normal-case text-emerald-600"
								title="Disponible hors ligne"
								aria-label="Piste en cache"
							>
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
									<polyline points="9 14 11 16 15 12" />
								</svg>
								<span>En cache</span>
							</span>
						{/if}
						{#if showOfflineUnavailable}
							<span
								class="inline-flex items-center gap-1 text-[9px] font-semibold tracking-normal normal-case text-amber-600"
								title="Hors ligne — cette piste n'est pas en cache"
								aria-label="Piste indisponible hors ligne"
							>
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									stroke-linecap="round"
									stroke-linejoin="round"
									aria-hidden="true"
								>
									<line x1="1" y1="1" x2="23" y2="23" />
									<path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
									<path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
									<path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
									<path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
									<path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
									<line x1="12" y1="20" x2="12.01" y2="20" />
								</svg>
								<span>Hors ligne</span>
							</span>
						{/if}
						<!-- ── END: cache indicator badge ────────────────────── -->
					</div>
					<div
						class="font-black text-sm md:text-lg text-stone-900 truncate pr-4"
						title={getDisplayTitle($selectAudio)}
					>
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
					class="p-2 rounded-full transition-colors flex-shrink-0 {isCurrentFavorite
						? 'text-red-500 hover:text-red-600'
						: 'text-stone-300 hover:text-red-400'}"
					on:click={handleToggleFavorite}
					aria-label={isCurrentFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
					title={isCurrentFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
				>
					<Icon src={isCurrentFavorite ? BsHeartFill : BsHeart} size="18" />
				</button>

				<div class="relative flex-shrink-0">
					<button
						type="button"
						class="relative p-2 rounded-full transition-colors {sleepTimerEndsAt !== null
							? 'bg-stone-900 text-white hover:bg-black'
							: 'text-stone-300 hover:bg-stone-100 hover:text-missionnaire'}"
						on:click|stopPropagation={() => (isSleepTimerOpen = !isSleepTimerOpen)}
						aria-label={sleepTimerEndsAt !== null
							? `Options du lecteur, minuterie active, arrêt dans ${sleepTimerRemainingLabel}`
							: 'Options du lecteur'}
						aria-expanded={isSleepTimerOpen}
						title={sleepTimerEndsAt !== null
							? `Options · arrêt dans ${sleepTimerRemainingLabel}`
							: 'Options'}
					>
						<Icon src={BsThreeDotsVertical} size="18" />
						{#if sleepTimerEndsAt !== null}
							<span
								class="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white"
								aria-hidden="true"
							></span>
						{/if}
					</button>

					{#if isSleepTimerOpen}
						<!-- svelte-ignore a11y-click-events-have-key-events -->
						<!-- svelte-ignore a11y-no-static-element-interactions -->
						<div
							class="absolute right-0 bottom-full z-[120] mb-3 w-72 max-w-[calc(100vw-2rem)] border border-stone-200 bg-white p-3 shadow-2xl rounded-lg"
							on:click|stopPropagation={() => undefined}
						>
							<div class="mb-3 flex items-center justify-between gap-3">
								<div class="min-w-0">
									<div class="text-[10px] font-bold uppercase tracking-[0.22em] text-missionnaire">
										Options
									</div>
									<div class="mt-0.5 text-xs font-semibold text-stone-500">
										{#if sleepTimerEndsAt !== null}
											Minuterie · arrêt à {sleepTimerEndLabel} · {sleepTimerRemainingLabel}
										{:else}
											Minuterie désactivée
										{/if}
									</div>
								</div>
								{#if sleepTimerEndsAt !== null}
									<button
										type="button"
										class="shrink-0 rounded-full border border-stone-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500 transition-colors hover:border-missionnaire hover:text-missionnaire"
										on:click={() => clearSleepTimer({ closeMenu: true })}
									>
										Annuler
									</button>
								{/if}
							</div>

							<button
								type="button"
								class="mb-3 flex w-full items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-left transition-colors hover:border-missionnaire hover:bg-missionnaire/5"
								on:click={toggleRepeatOne}
								aria-pressed={$repeatOne}
							>
								<span class="inline-flex min-w-0 items-center gap-2">
									<Icon
										src={RiMediaRepeatOneLine}
										size="17"
										color={$repeatOne ? '#FF880C' : '#a8a29e'}
									/>
									<span class="truncate text-xs font-bold text-stone-700">Répéter la piste</span>
								</span>
								<span
									class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] {$repeatOne
										? 'bg-missionnaire text-white'
										: 'bg-white text-stone-400'}"
								>
									{$repeatOne ? 'On' : 'Off'}
								</span>
							</button>

							<div class="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
								Minuterie de sommeil
							</div>
							<div class="grid grid-cols-3 gap-2">
								{#each sleepTimerOptions as minutes}
									<button
										type="button"
										class="rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs font-bold text-stone-700 transition-colors hover:border-missionnaire hover:bg-missionnaire/5 hover:text-missionnaire"
										on:click={() => setSleepTimerForMinutes(minutes)}
									>
										{minutes} min
									</button>
								{/each}
							</div>

							<div class="mt-3 border-t border-stone-100 pt-3">
								<label
									for="sleep-timer-time"
									class="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400"
								>
									Arrêter à
								</label>
								<div class="flex items-center gap-2">
									<input
										id="sleep-timer-time"
										type="time"
										bind:value={customSleepTime}
										class="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 outline-none transition-colors focus:border-missionnaire"
									/>
									<button
										type="button"
										disabled={!customSleepTime}
										class="rounded-lg bg-stone-900 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-white transition-colors {!customSleepTime
											? 'cursor-not-allowed opacity-40'
											: 'hover:bg-black'}"
										on:click={() => setSleepTimerForClockTime(customSleepTime)}
									>
										OK
									</button>
								</div>
							</div>
						</div>
					{/if}
				</div>

				<button
					class="bg-gray-900 hover:bg-black text-white p-2 rounded-full transition-colors md:hidden"
					on:click={closeAudioPlayer}
					aria-label="Fermer le lecteur"
				>
					<Icon src={BsX} size="20" />
				</button>
			</div>

			<!-- Controls & Time Row -->
			<div
				class="flex -translate-y-[5px] flex-col items-center md:translate-y-0 md:flex-row md:gap-6 w-full md:w-auto"
			>
				<!-- Main Playback Controls -->
				<div class="flex items-center justify-center gap-4 md:gap-6">
					<!-- Shuffle on mobile side -->
					<div class="flex md:hidden items-center gap-1">
						<button
							on:click={toggleShuffle}
							class="p-2.5 rounded-full transition-all flex items-center gap-2 {$isShuffle
								? 'bg-missionnaire text-white shadow-md shadow-missionnaire/20'
								: 'bg-stone-50 text-stone-400 hover:bg-stone-100 hover:text-stone-600'}"
							title={$isShuffle ? 'Aléatoire activé' : 'Aléatoire désactivé'}
						>
							<Icon src={BsShuffle} size="16" />
						</button>
					</div>

					<div class="flex items-center gap-1 md:gap-3">
						<button
							on:click={playPrevious}
							class="p-2 text-stone-600 hover:text-missionnaire transition-colors"
							title="Précédent"
						>
							<Icon src={BsSkipStartFill} size="22" />
						</button>

						<button
							on:click={() => seekBackward()}
							class="hidden md:block p-2 text-stone-300 hover:text-missionnaire transition-colors"
							title="-5s"
						>
							<Icon src={BsSkipBackwardFill} size="16" />
						</button>

						<button
							on:click={togglePlay}
							class="relative flex items-center justify-center w-14 h-14 md:w-12 md:h-12 bg-missionnaire text-white rounded-full hover:scale-105 transition-transform shadow-lg shadow-missionnaire/20"
						>
							{#if $isPlaying}
								<Icon src={BsPauseCircleFill} size="32" />
							{:else}
								<Icon src={BsPlayCircleFill} size="32" />
							{/if}
						</button>

						<button
							on:click={() => seekForward()}
							class="hidden md:block p-2 text-stone-300 hover:text-missionnaire transition-colors"
							title="+5s"
						>
							<Icon src={BsSkipForwardFill} size="16" />
						</button>

						<button
							on:click={playNext}
							class="p-2 text-stone-600 hover:text-missionnaire transition-colors"
							title="Suivant"
						>
							<Icon src={BsSkipEndFill} size="22" />
						</button>
					</div>

					<!-- Repeat on mobile side -->
					<div class="flex md:hidden items-center gap-1">
						<button
							on:click={toggleRepeatOne}
							class="p-2.5 rounded-full transition-all flex items-center gap-2 {$repeatOne
								? 'bg-missionnaire text-white shadow-md shadow-missionnaire/20'
								: 'bg-stone-50 text-stone-400 hover:bg-stone-100 hover:text-stone-600'}"
							title={$repeatOne ? 'Répéter activé' : 'Répéter désactivé'}
						>
							<Icon
								src={RiMediaRepeatOneLine}
								size="20"
								color={$repeatOne ? '#ffffff' : '#a8a29e'}
							/>
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
							class="p-2.5 rounded-full transition-all flex items-center gap-2 {$isShuffle
								? 'bg-missionnaire text-white'
								: 'bg-stone-50 text-stone-400 hover:bg-stone-100 hover:text-stone-600'}"
							title={$isShuffle ? 'Aléatoire activé' : 'Aléatoire désactivé'}
						>
							<Icon src={BsShuffle} size="16" />
						</button>

						<button
							on:click={toggleRepeatOne}
							class="p-2.5 rounded-full transition-all flex items-center gap-2 {$repeatOne
								? 'bg-missionnaire text-white shadow-md shadow-missionnaire/20'
								: 'bg-stone-50 text-stone-400 hover:bg-stone-100'}"
							title={$repeatOne ? 'Répéter activé' : 'Répéter désactivé'}
						>
							<Icon
								src={RiMediaRepeatOneLine}
								size="20"
								color={$repeatOne ? '#ffffff' : '#a8a29e'}
							/>
						</button>

						<div class="flex items-center gap-2 ml-2">
							<button
								on:click={toggleMute}
								class="p-2 text-stone-400 hover:text-missionnaire transition-colors"
							>
								{#if !isMuted}
									<Icon src={BsVolumeUpFill} size="20" />
								{:else}
									<Icon src={BsVolumeMuteFill} size="20" />
								{/if}
							</button>
						</div>

						<button
							class="ml-4 bg-gray-900 text-white p-2 rounded-full hover:bg-black transition-colors"
							on:click={closeAudioPlayer}
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
