<script lang="ts">
	import { browser } from '$app/environment';
	import { getContext, onDestroy, onMount, tick } from 'svelte';
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
	import BsMusicNoteList from 'svelte-icons-pack/bs/BsMusicNoteList';
	import SyncedLyrics from '$lib/components/SyncedLyrics.svelte';
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

	type LyricLine = string | Record<string, unknown>;

	let audio: HTMLAudioElement;
	// Bumped to force Svelte to destroy + remount the <audio> element via the
	// `{#key audioElementKey}` block in the template. Used by the rapid-repause
	// recovery path (rebuildAudioElement) to obtain a brand-new media element,
	// which is the only reliable way to reset a degraded iOS AVAudioSession.
	let audioElementKey = 0;
	// Diagnostic counter — increments every time bind:this resolves to a
	// new DOM node. Compared in logs to prove (or disprove) the hypothesis
	// that lock-screen transport ownership is detached by element rebuilds.
	let audioInstanceSeq = 0;
	let audioInstanceId = '';
	function tagAudioInstance(el: HTMLAudioElement) {
		audioInstanceSeq++;
		audioInstanceId = `${Date.now().toString(36)}-${audioInstanceSeq}`;
		el.dataset.instanceId = audioInstanceId;
		console.log('[Audio Element]', {
			instanceId: audioInstanceId,
			seq: audioInstanceSeq,
			keyAtCreate: audioElementKey,
			isConnected: el.isConnected
		});
	}
	// Tracks which element we've already wired listeners to, so the reactive
	// attach block below doesn't double-bind when other state triggers a re-run.
	let listenersBoundTo: HTMLAudioElement | null = null;
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
	let hasPlaylistNavigation = false;
	let lyricsLines: LyricLine[] = [];
	let lyricsPanelOpen = false;
	let hasLyrics = false;
	let lyricsFetchToken = 0;
	let lastLyricsAudioId = '';

	$: hasPlaylistNavigation = $playlist.length > 1;
	$: sleepTimerRemainingLabel =
		sleepTimerEndsAt !== null ? formatSleepTimerRemaining(sleepTimerRemainingMs) : '';
	$: sleepTimerEndLabel =
		sleepTimerEndsAt !== null ? formatSleepTimerEndTime(sleepTimerEndsAt) : '';
	$: if (browser && isSleepTimerOpen && !customSleepTime) {
		setDefaultSleepTimerClockTime();
	}
	$: if (!hasPlaylistNavigation && $isShuffle) {
		isShuffle.set(false);
	}

	function setPendingPlaybackIntent(intent: 'play' | 'pause' | null) {
		pendingPlaybackIntent = intent;
	}

	function playCurrentAudio() {
		if (!audio) return;
		setPendingPlaybackIntent('play');
		setUserWantsToPlay(true);
		consecutiveFailedResumes = 0;
		audioElementRebuilt = false;
		if (audio.duration && audio.currentTime >= audio.duration) {
			audio.currentTime = 0;
		}
		// Cold-start path — bind MediaSession metadata inside the user
		// gesture so iOS's mediaserverd attributes the audio session to
		// this PWA. safePlay deliberately no longer does this on its own.
		applyMediaSessionMetadata();
		// Start the silent-loop session keeper inside the same user
		// gesture. iOS requires a user-gesture origin for the first
		// .play() of any media element; piggy-backing on this one
		// satisfies that without an extra interaction.
		startSilentLoop();
		safePlay('auto');
	}

	function pauseCurrentAudio() {
		if (!audio || audio.paused) return;
		setPendingPlaybackIntent('pause');
		setUserWantsToPlay(false);
		rememberPlaybackPosition();
		audio.pause();
		// Note: silent loop stays running so a later resume can
		// re-acquire the audio session reliably.
	}

	function stopAudioForSleepTimer() {
		setUserWantsToPlay(false);
		shouldAutoplayOnLoad = false;
		stopResumeWatchdog();
		stopSilentLoop();
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
		stopSilentLoop();

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
		// Forget the metadata fingerprint so the next track (even the same
		// one) re-applies metadata when selected.
		lastMetadataKey = '';
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

	/** Bounded auto-retry. After an OS interruption (iOS phone call, macOS
	 *  Continuity call, AirPods route swap), the audio session can be in a
	 *  degraded state where `play()` succeeds for a fraction of a second
	 *  before the OS pauses the element again. Without a bound, the
	 *  watchdog resumes → OS re-pauses → watchdog resumes … cycle keeps
	 *  going for up to RESUME_MAX_DURATION_MS and the play/pause icon
	 *  flickers the whole time. We count consecutive "rapid re-pauses"
	 *  (a pause within RAPID_REPAUSE_THRESHOLD_MS of the last successful
	 *  play event) and stop restarting the watchdog after the bound is
	 *  hit. The user breaks the latch by tapping play, hitting play on
	 *  the lock screen, or returning to the app — all of which reset
	 *  the counter so a fresh resume can be attempted. */
	let lastSuccessfulPlayAt = 0;
	let consecutiveFailedResumes = 0;
	const RAPID_REPAUSE_THRESHOLD_MS = 2500;

	/** Set true after the audio element has been torn down and rebuilt to
	 *  break out of a rapid-repause cycle. The watchdog approach polls
	 *  play() on the existing element, but if iOS/macOS has the audio
	 *  session itself in a bad state (Bluetooth route teardown,
	 *  AVAudioSession partially-released after a phone call), no number
	 *  of play() calls on the same element will recover it — only a
	 *  fresh element does, mirroring what reloading the page achieves.
	 *  We rebuild ONCE per cycle so we don't loop forever if the system
	 *  is genuinely stuck. Reset on user-initiated play, MediaSession
	 *  play, and track changes so the next interruption gets a fresh
	 *  budget. */
	let audioElementRebuilt = false;

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

	function getLyricsAudioId(item: unknown): string {
		if (!item || typeof item !== 'object' || !('s3_url' in item)) return '';
		const id = (item as { _id?: unknown })._id;
		return typeof id === 'string' && id.trim() ? id.trim() : '';
	}

	function resetLyricsState() {
		lyricsLines = [];
		lyricsPanelOpen = false;
	}

	async function loadLyricsForAudio(audioId: string, token: number) {
		lyricsLines = [];
		lyricsPanelOpen = false;

		try {
			const response = await fetch(`/api/music-audio/${encodeURIComponent(audioId)}/lyrics`);
			if (token !== lyricsFetchToken) return;

			if (!response.ok) {
				resetLyricsState();
				return;
			}

			const payload = (await response.json()) as {
				data?: { lines?: LyricLine[]; timeline_published?: unknown } | null;
			};
			lyricsLines = Array.isArray(payload.data?.lines) ? payload.data.lines : [];
		} catch (error) {
			if (token === lyricsFetchToken) {
				console.warn('[AudioPlayer] Lyrics load failed:', error);
				resetLyricsState();
			}
		}
	}

	function toggleLyricsPanel() {
		if (lyricsLines.length === 0) return;
		lyricsPanelOpen = !lyricsPanelOpen;
	}

	function handleLyricsSeek(event: CustomEvent<{ time: number }>) {
		if (!audio || !Number.isFinite(event.detail.time)) return;
		audio.currentTime = Math.max(0, event.detail.time);
		rememberPlaybackPosition(audio.currentTime, audio.duration);
		updateAudioTime();
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
	$: hasLyrics = lyricsLines.length > 0;

	$: if (browser) {
		const lyricsAudioId = getLyricsAudioId($selectAudio);
		if (lyricsAudioId !== lastLyricsAudioId) {
			lastLyricsAudioId = lyricsAudioId;
			lyricsFetchToken++;
			if (lyricsAudioId) {
				void loadLyricsForAudio(lyricsAudioId, lyricsFetchToken);
			} else {
				resetLyricsState();
			}
		}
	}

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
		console.log('[Audio] ended event');
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
			if ('mediaSession' in navigator) {
				navigator.mediaSession.playbackState = 'none';
			}
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
			if ('mediaSession' in navigator) {
				navigator.mediaSession.playbackState = 'none';
			}
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
			consecutiveFailedResumes = 0;
			lastSuccessfulPlayAt = 0;
			audioElementRebuilt = false;

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
		if (!hasPlaylistNavigation) return;
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
			// Catch the user gesture from playlist navigation taps so
			// the silent loop can register without an extra interaction.
			// Idempotent — bails if already running.
			startSilentLoop();
		}
	}

	function playNext() {
		if (!hasPlaylistNavigation) return;

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
		if (!hasPlaylistNavigation) return;

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

	function handleAudioPlay() {
		console.log('[Audio] play event', {
			readyState: audio?.readyState,
			currentTime: audio?.currentTime
		});
		setPendingPlaybackIntent(null);
		setUserWantsToPlay(true);
		lastSuccessfulPlayAt = Date.now();
		if (pendingSessionResumeTime !== null) {
			const restored = restorePlaybackPosition(pendingSessionResumeTime);
			if (restored) pendingSessionResumeTime = null;
		}
		audioPausedAt = 0;
		stopResumeWatchdog();
		isPlaying.set(true);
		if ('mediaSession' in navigator) {
			navigator.mediaSession.playbackState = 'playing';
			// Re-assert handlers now that playback has resumed. iOS's
			// Control Center caches handler-availability against the
			// last session metadata was applied with; if the audio
			// session was rebuilt during background, the cached binding
			// is stale and lock-screen buttons silently no-op. Calling
			// setActionHandler again rebinds Control Center to the
			// live session. Idempotent and cheap.
			if (!mediaSessionHandlersBound) registerMediaSessionHandlers();
		}
		// Defensive: if the silent loop ever stops (an OS interruption
		// can pause both elements), the main element's play event is a
		// safe checkpoint to re-engage it. Idempotent.
		if (!silentLoopRunning) startSilentLoop();
	}

	function handleAudioPause() {
		console.log('[Audio] pause event', {
			readyState: audio?.readyState,
			currentTime: audio?.currentTime,
			isChangingSource
		});
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

		if (!userWantsToPlay) return;
		currentTrackInterrupted = true;

		// Two distinct kinds of OS-driven pause:
		//   1. Genuine fresh interruption (audio was playing for a while
		//      before this pause). Cheap recovery — start the watchdog and
		//      let it probe play() until the audio session reopens.
		//   2. Rapid re-pause (pause fires within RAPID_REPAUSE_THRESHOLD_MS
		//      of the last successful play). Means the watchdog already
		//      managed to call play() and the OS slammed it back into
		//      paused — the audio session is in a degraded state that
		//      retrying play() on the same element can't fix. The only
		//      reliable recovery is to throw away the <audio> element and
		//      build a fresh one (mirrors what a page reload does).
		const playedDurationMs =
			lastSuccessfulPlayAt > 0 ? Date.now() - lastSuccessfulPlayAt : 0;
		const isRapidRepause =
			lastSuccessfulPlayAt > 0 && playedDurationMs < RAPID_REPAUSE_THRESHOLD_MS;

		if (!isRapidRepause) {
			// Fresh interruption — clean slate, try the cheap path first.
			consecutiveFailedResumes = 0;
			audioElementRebuilt = false;
			startResumeWatchdog();
			return;
		}

		consecutiveFailedResumes++;
		if (!audioElementRebuilt) {
			// First rapid re-pause this cycle — rebuild the audio element.
			// Don't start the watchdog: the rebuild owns the resume from here.
			audioElementRebuilt = true;
			console.warn(
				'[AudioPlayer] Rapid re-pause detected — rebuilding audio element to reset audio session.'
			);
			rebuildAudioElement();
		} else {
			// Rebuild already happened and the OS is STILL re-pausing within
			// the threshold. The system is stuck. Stop auto-retrying; the
			// user can tap play, hit play on the lock screen, or come back
			// to the app to re-arm the rebuild path.
			console.warn(
				'[AudioPlayer] Audio session still rejecting playback after rebuild — giving up. Tap play to retry.'
			);
		}
	}

	function handleAudioLoadedMetadata() {
		duration = audio.duration;
		if (pendingSessionResumeTime !== null) {
			restorePlaybackPosition(pendingSessionResumeTime);
		}
		console.log('[AudioPlayer] Metadata loaded, duration:', duration);
	}

	function handleAudioCanPlay() {
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
	}

	function handleAudioError(e: Event) {
		setPendingPlaybackIntent(null);
		console.error('[AudioPlayer] Audio error:', e);
		isPlaying.set(false);
		isAudioReady = false;
		shouldAutoplayOnLoad = false;
	}

	// Diagnostic-only listeners. Help debug iOS lock-screen / Bluetooth /
	// AVAudioSession issues. They do not mutate state.
	const logSuspend = () => console.log('[Audio] suspend');
	const logWaiting = () => console.log('[Audio] waiting');
	const logStalled = () => console.log('[Audio] stalled');
	const logEmptied = () => console.log('[Audio] emptied');
	const logAbort = () => console.log('[Audio] abort');

	function attachAudioListeners(el: HTMLAudioElement) {
		el.addEventListener('ended', handleEnded);
		el.addEventListener('timeupdate', updateAudioTime);
		el.addEventListener('timeupdate', updateIndicator);
		el.addEventListener('play', handleAudioPlay);
		el.addEventListener('pause', handleAudioPause);
		el.addEventListener('loadedmetadata', handleAudioLoadedMetadata);
		el.addEventListener('canplay', handleAudioCanPlay);
		el.addEventListener('error', handleAudioError);
		el.addEventListener('suspend', logSuspend);
		el.addEventListener('waiting', logWaiting);
		el.addEventListener('stalled', logStalled);
		el.addEventListener('emptied', logEmptied);
		el.addEventListener('abort', logAbort);
	}

	function detachAudioListeners(el: HTMLAudioElement) {
		el.removeEventListener('ended', handleEnded);
		el.removeEventListener('timeupdate', updateAudioTime);
		el.removeEventListener('timeupdate', updateIndicator);
		el.removeEventListener('play', handleAudioPlay);
		el.removeEventListener('pause', handleAudioPause);
		el.removeEventListener('loadedmetadata', handleAudioLoadedMetadata);
		el.removeEventListener('canplay', handleAudioCanPlay);
		el.removeEventListener('error', handleAudioError);
		el.removeEventListener('suspend', logSuspend);
		el.removeEventListener('waiting', logWaiting);
		el.removeEventListener('stalled', logStalled);
		el.removeEventListener('emptied', logEmptied);
		el.removeEventListener('abort', logAbort);
	}

	// Auto-bind listeners whenever `audio` resolves to a new element — covers
	// both the initial mount and every rebuild triggered by audioElementKey++.
	// Without this, the {#key} rebuild path would leave a fresh DOM element
	// without any event wiring. Also catches up any pending `audioSrc` that
	// the $selectAudio reactive block queued before bind:this had fired.
	$: if (browser && audio && audio !== listenersBoundTo) {
		if (listenersBoundTo) {
			console.log('[Audio Element] node replaced', {
				oldInstanceId: listenersBoundTo.dataset.instanceId ?? '?',
				key: audioElementKey
			});
			detachAudioListeners(listenersBoundTo);
		}
		tagAudioInstance(audio);
		attachAudioListeners(audio);
		listenersBoundTo = audio;
		if (audioSrc && !audio.src) {
			audio.src = encodeURI(audioSrc);
			audio.load();
		}
	}

	/** Tear down the live <audio> element and build a fresh one preloaded
	 *  to the same src and time. Used to escape a rapid-repause cycle
	 *  caused by a degraded OS audio session — calling load()/play() on
	 *  the existing element can't reset AVAudioSession's output route
	 *  state, but constructing a brand-new element does (this is the
	 *  same thing reloading the page achieves, just scoped to the
	 *  audio).
	 *
	 *  The element lives in the DOM (template binding) so that iOS
	 *  attributes the audio session to *this* PWA's WebKit process —
	 *  detached `new Audio()` instances route through the shared media
	 *  daemon, which on iOS can cause the lock-screen Now Playing tap to
	 *  open whichever other PWA last touched media. The rebuild now
	 *  bumps a Svelte `{#key}` so the framework destroys+remounts the
	 *  element for us, and the reactive attach block re-wires listeners. */
	async function rebuildAudioElement() {
		if (!audio || destroyed) return;
		console.log('[Audio Element] REBUILD START — this destroys the DOM node', {
			oldInstanceId: audio.dataset.instanceId ?? '?',
			keyBefore: audioElementKey,
			hidden: document.hidden,
			ts: Date.now()
		});

		const savedSrc = audio.src;
		const savedTime = getReliablePlaybackTime();
		const wantedToPlay = userWantsToPlay;

		// Stop the polling watchdog and any in-flight reload before
		// dropping references — otherwise a tick fires play() on the
		// orphan element after we've moved on.
		stopResumeWatchdog();
		isReloadingSession = false;

		try {
			audio.pause();
			audio.removeAttribute('src');
			audio.load();
		} catch (err) {
			console.warn('[AudioPlayer] Old element teardown failed:', err);
		}

		// Force Svelte to recreate the <audio> element. The reactive
		// listener-attach block above re-binds events on the new node;
		// `await tick()` waits for that to land before we touch `audio`.
		audioElementKey++;
		await tick();

		if (!audio || destroyed) return;

		if (savedTime > 0.25) {
			pendingSessionResumeTime = savedTime;
		}
		shouldAutoplayOnLoad = wantedToPlay;
		audioPausedAt = 0;
		audio.src = savedSrc;
		audio.load();
	}

	function updateAudioSource(url: string) {
		if (!url) return;

		const encodedUrl = encodeURI(url);
		console.log('[AudioPlayer] Updating source to:', encodedUrl);
		// New track — drop any "previous track was interrupted" carry-over.
		currentTrackInterrupted = false;
		consecutiveFailedResumes = 0;
		lastSuccessfulPlayAt = 0;
		audioElementRebuilt = false;
		isAudioReady = false;
		currentTime = 0;
		duration = 0;
		progressBarWidth = 0;
		indicatorPosition = 0;
		const shouldResumePlayback = shouldAutoplayOnLoad || $isPlaying || userWantsToPlay;
		shouldAutoplayOnLoad = shouldResumePlayback;

		// On the very first render, the reactive $selectAudio block can fire
		// before bind:this has wired up `audio`. In that case, store the URL
		// on `audioSrc` (already done by the caller) and bail — the listener-
		// attach reactive block below catches up and loads the queued src
		// the moment the DOM-mounted element binds.
		if (!audio) return;

		isChangingSource = true;
		try {
			audio.pause();
		} finally {
			isChangingSource = false;
		}
		resetRememberedPlaybackPosition();
		audio.src = encodedUrl;
		audio.load();
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

		// Only stamp metadata if it hasn't been bound to the current track
		// yet — assigning `mediaSession.metadata = new MediaMetadata(...)`
		// resets playbackState to 'none' on iOS, which flickers the lock-
		// screen tile. The reactive `$: applyMediaSessionMetadata()` block
		// already runs on every $selectAudio change, and playCurrentAudio
		// stamps it inside its own gesture frame for cold starts. We don't
		// want to re-stamp on every safePlay() call (resume watchdog,
		// visibility re-entry, lock-screen long-pause fallback).

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
		// Only treat a long absence as a "fresh signal" worth re-arming
		// the rebuild path. Bare focus/visibility events fire repeatedly
		// during a phone-call banner on macOS — resetting on every one
		// would let the rapid-repause cycle restart indefinitely.
		if (hiddenMs >= PAUSE_RELOAD_THRESHOLD_MS) {
			consecutiveFailedResumes = 0;
			audioElementRebuilt = false;
		}
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
			console.log('[Visibility]', document.visibilityState);
			if (document.visibilityState === 'hidden') {
				appHiddenAt = Date.now();
			} else {
				clearPageLifecycleTeardown();
				const elapsed = appHiddenAt > 0 ? Date.now() - appHiddenAt : 0;
				appHiddenAt = 0;
				// iOS may have torn down the AVAudioSession while we
				// were hidden. Re-assert the MediaSession handlers
				// before attempting to resume so Control Center binds
				// to the live session.
				registerMediaSessionHandlers();
				tryResumeAfterInterruption(elapsed);
			}
		};
		// `focus` and `pageshow` on iOS can fire without a preceding
		// `visibilitychange` (e.g. returning from control-center).
		const onFocus = () => {
			const elapsed = appHiddenAt > 0 ? Date.now() - appHiddenAt : 0;
			appHiddenAt = 0;
			registerMediaSessionHandlers();
			tryResumeAfterInterruption(elapsed);
		};
		const onPageShow = () => {
			console.log('[PageShow]');
			const elapsed = appHiddenAt > 0 ? Date.now() - appHiddenAt : 0;
			appHiddenAt = 0;
			registerMediaSessionHandlers();
			tryResumeAfterInterruption(elapsed);
		};

		// Page Lifecycle API: 'freeze' fires when the OS actually suspends
		// the WKWebView process (JS event loop frozen). 'resume' fires when
		// it's unfrozen. These are distinct from 'visibilitychange' —
		// during a freeze, MediaSession handlers physically cannot run
		// because JS is paused, so any lock-screen tap during this window
		// is silently dropped. Distinguishing this from a live-but-detached
		// transport is the whole point of the diagnosis.
		const onFreeze = () => {
			console.log('[Lifecycle] freeze', {
				boundInstanceId: audio?.dataset.instanceId ?? null,
				ts: Date.now()
			});
		};
		const onResume = () => {
			console.log('[Lifecycle] resume', {
				boundInstanceId: audio?.dataset.instanceId ?? null,
				ts: Date.now()
			});
			registerMediaSessionHandlers();
		};
		const onBlur = () => console.log('[Lifecycle] blur', { ts: Date.now() });
		const onFocusLog = () => console.log('[Lifecycle] focus', { ts: Date.now() });

		document.addEventListener('visibilitychange', onVisibility);
		document.addEventListener('freeze', onFreeze);
		document.addEventListener('resume', onResume);
		window.addEventListener('focus', onFocus);
		window.addEventListener('focus', onFocusLog);
		window.addEventListener('blur', onBlur);
		window.addEventListener('pageshow', onPageShow);
		window.addEventListener('pagehide', markPageLifecycleTeardown);
		window.addEventListener('beforeunload', markPageLifecycleTeardown);

		return () => {
			document.removeEventListener('visibilitychange', onVisibility);
			document.removeEventListener('freeze', onFreeze);
			document.removeEventListener('resume', onResume);
			window.removeEventListener('focus', onFocus);
			window.removeEventListener('focus', onFocusLog);
			window.removeEventListener('blur', onBlur);
			window.removeEventListener('pageshow', onPageShow);
			window.removeEventListener('pagehide', markPageLifecycleTeardown);
			window.removeEventListener('beforeunload', markPageLifecycleTeardown);
		};
	});

	// ── Media Session API (Bluetooth / lockscreen / car controls) ──
	// Register core action handlers on mount — some platforms (iOS Safari
	// especially) only wire up hardware keys if handlers exist when audio
	// starts. Playlist handlers are synced separately so single-track
	// playback does not expose previous/next controls.
	function syncMediaSessionPlaylistHandlers(canNavigate = hasPlaylistNavigation) {
		if (!browser || !('mediaSession' in navigator)) return;
		try {
			navigator.mediaSession.setActionHandler(
				'previoustrack',
				canNavigate
					? () => {
							console.log('[REMOTE COMMAND RECEIVED] previoustrack', {
								boundInstanceId: audio?.dataset.instanceId ?? null
							});
							playPrevious();
						}
					: null
			);
			navigator.mediaSession.setActionHandler(
				'nexttrack',
				canNavigate
					? () => {
							console.log('[REMOTE COMMAND RECEIVED] nexttrack', {
								boundInstanceId: audio?.dataset.instanceId ?? null
							});
							playNext();
						}
					: null
			);
		} catch (err) {
			console.warn('[AudioPlayer] MediaSession playlist handler sync failed:', err);
		}
	}

	$: if (browser) {
		syncMediaSessionPlaylistHandlers(hasPlaylistNavigation);
	}

	// ── Silent-loop session keeper (iOS standalone PWA workaround) ──
	// In iOS standalone PWA mode, audio.pause() on the main element
	// releases the AVAudioSession's output route. The next play() resolves
	// but produces no sound until the app returns to the foreground.
	// Tested workaround: a second hidden <audio> element loops a tiny
	// silent .mp3 continuously. Its decoded (silent) output keeps the
	// AVAudioSession alive across pauses of the main element, so
	// lock-screen play/pause cycles on the main element work reliably.
	//
	// MediaSession transport ownership: iOS binds Now-Playing to the page
	// (not to a specific element). We start the silent loop AFTER the
	// main element's first user-gesture play() resolves, so the user-
	// visible "primary" media is unambiguous from iOS's perspective.
	let silentAudio: HTMLAudioElement | null = null;
	let silentLoopRunning = false;

	function startSilentLoop() {
		if (!browser || !silentAudio || silentLoopRunning) return;
		// `playsinline` + `muted=false` (a fully-silent file is enough —
		// muting would tell iOS to skip decoding and we'd be back at the
		// original suspension bug).
		silentAudio.loop = true;
		silentAudio.volume = 1;
		const p = silentAudio.play();
		if (p && typeof p.then === 'function') {
			p.then(() => {
				silentLoopRunning = true;
				console.log('[SilentLoop] started');
			}).catch((err) => {
				console.warn('[SilentLoop] failed to start', err);
			});
		} else {
			silentLoopRunning = true;
			console.log('[SilentLoop] started (sync)');
		}
	}

	function stopSilentLoop() {
		if (!silentAudio || !silentLoopRunning) return;
		try {
			silentAudio.pause();
			silentAudio.currentTime = 0;
		} catch {
			/* ignore */
		}
		silentLoopRunning = false;
		console.log('[SilentLoop] stopped');
	}

	// Idempotent registration. iOS's mediaserverd can tear down the audio
	// session after a long background pause; Control Center caches handler
	// availability against the *last* session metadata was applied with, so
	// the buttons go inert until we call setActionHandler again. Re-assert
	// on visibility return, pageshow, focus, and on the audio `play` event.
	let mediaSessionHandlersBound = false;
	function registerMediaSessionHandlers() {
		if (!browser || !('mediaSession' in navigator)) return;
		try {
			navigator.mediaSession.setActionHandler('play', async () => {
				console.log('[REMOTE COMMAND RECEIVED] play', {
					boundInstanceId: audio?.dataset.instanceId ?? null,
					currentSeq: audioInstanceSeq,
					hidden: document.hidden,
					silentLoopRunning,
					ts: Date.now()
				});
				if (!audio) return;
				setUserWantsToPlay(true);
				consecutiveFailedResumes = 0;
				audioElementRebuilt = false;
				// Defensive: if the silent loop somehow stopped (e.g. an
				// OS interruption killed it too), the lock-screen gesture
				// is our chance to restart it inside a valid user-action
				// frame.
				if (!silentLoopRunning) startSilentLoop();

				// iOS rule: the play() call MUST originate inside the
				// MediaSession action callback's gesture frame. Anything
				// deferred (setTimeout, canplay listener, safePlay's
				// load()→canplay→play() path) is treated as autoplay
				// and silently dropped on the lock screen. All recovery
				// in this handler stays inside this callback stack.
				if (audio.duration && audio.currentTime >= audio.duration) {
					audio.currentTime = 0;
				}
				if (audio.readyState === 0) {
					try { audio.load(); } catch {}
				}

				try {
					await audio.play();
					navigator.mediaSession.playbackState = 'playing';
				} catch (err) {
					console.error('[MediaSession] play failed', err);
					// Muted fallback — still inside the gesture frame.
					// When iOS has torn down the AVAudioSession it will
					// often allow a muted play() to reopen the route;
					// we unmute the instant it succeeds.
					try {
						audio.muted = true;
						await audio.play();
						audio.muted = false;
						navigator.mediaSession.playbackState = 'playing';
					} catch (err2) {
						audio.muted = false;
						console.error('[MediaSession] muted fallback failed', err2);
						// Surrender this gesture rather than schedule a
						// deferred play() (which iOS would drop). The
						// user can tap again; the watchdog can also
						// recover when the app comes back to foreground.
						navigator.mediaSession.playbackState = 'paused';
					}
				}
			});
			navigator.mediaSession.setActionHandler('pause', () => {
				console.log('[REMOTE COMMAND RECEIVED] pause', {
					boundInstanceId: audio?.dataset.instanceId ?? null,
					currentSeq: audioInstanceSeq,
					hidden: document.hidden,
					silentLoopRunning,
					ts: Date.now()
				});
				if (!audio) return;
				setUserWantsToPlay(false);
				setPendingPlaybackIntent('pause');
				// Stamp playbackState first for immediate lock-screen
				// feedback — the `pause` event listener will run a tick
				// later and is redundant for the UI, but still needed for
				// audioPausedAt / rememberPlaybackPosition bookkeeping.
				navigator.mediaSession.playbackState = 'paused';
				rememberPlaybackPosition();
				// Note: we do NOT stop the silent loop here. It keeps the
				// AVAudioSession alive so the next lock-screen play can
				// re-acquire the output route without losing audio.
				audio.pause();
			});
			syncMediaSessionPlaylistHandlers();
			navigator.mediaSession.setActionHandler('seekbackward', (details) => {
				console.log('[REMOTE COMMAND RECEIVED] seekbackward', {
					boundInstanceId: audio?.dataset.instanceId ?? null,
					offset: details.seekOffset
				});
				seekBackward(details.seekOffset ?? 10);
			});
			navigator.mediaSession.setActionHandler('seekforward', (details) => {
				console.log('[REMOTE COMMAND RECEIVED] seekforward', {
					boundInstanceId: audio?.dataset.instanceId ?? null,
					offset: details.seekOffset
				});
				seekForward(details.seekOffset ?? 10);
			});
			// `seekto` lets the car / lock screen scrub the timeline directly.
			navigator.mediaSession.setActionHandler('seekto', (details) => {
				console.log('[REMOTE COMMAND RECEIVED] seekto', {
					boundInstanceId: audio?.dataset.instanceId ?? null,
					seekTime: details.seekTime
				});
				if (!audio || details.seekTime == null) return;
				if (details.fastSeek && 'fastSeek' in audio) {
					audio.fastSeek(details.seekTime);
				} else {
					audio.currentTime = details.seekTime;
				}
				rememberPlaybackPosition(details.seekTime, audio.duration);
			});
			navigator.mediaSession.setActionHandler('stop', () => {
				console.log('[REMOTE COMMAND RECEIVED] stop', {
					boundInstanceId: audio?.dataset.instanceId ?? null,
					currentSeq: audioInstanceSeq
				});
				setUserWantsToPlay(false);
				if (audio) {
					audio.pause();
					audio.currentTime = 0;
				}
				resetRememberedPlaybackPosition();
				navigator.mediaSession.playbackState = 'none';
			});
			mediaSessionHandlersBound = true;
			console.log('[MediaSession] handlers (re)registered');
		} catch (err) {
			console.warn('[AudioPlayer] MediaSession handler registration failed:', err);
		}
	}

	onMount(() => {
		registerMediaSessionHandlers();
	});

	/** Pull the right artwork URL for a track so the car/lockscreen shows
	 *  something meaningful instead of the app logo every time. */
	function getArtworkUrl(item: PlayableAudio | null): string {
		if (!item) return '/icons/pwa-512x512.png';
		const anyItem = item as { thumbnail_url?: string; cover_url?: string };
		return anyItem.thumbnail_url || anyItem.cover_url || '/icons/pwa-512x512.png';
	}

	function getLyricsArtworkStyle(item: PlayableAudio | null): string {
		const safeUrl = encodeURI(getArtworkUrl(item)).replace(/"/g, '%22');
		return `--lyrics-artwork: url("${safeUrl}")`;
	}

	// Lock-screen / Bluetooth metadata. Pulled into a function so it can be
	// re-applied right before play() in safePlay — iOS only attributes the
	// audio session to *this* PWA when metadata is non-null at the moment
	// play() resolves. The reactive `$:` below covers track changes; the
	// imperative call inside safePlay covers cold starts.
	//
	// Fingerprint guard: re-assigning `mediaSession.metadata = new
	// MediaMetadata(...)` on iOS flips playbackState back to 'none' and
	// detaches the Now-Playing buttons' binding even though
	// setActionHandler was never null'd. We therefore only mutate metadata
	// when the track identity actually changes — every other reactive
	// trigger short-circuits.
	let lastMetadataKey = '';

	function getMetadataKey(track: unknown): string {
		if (!track || typeof track !== 'object') return '';
		const t = track as {
			_id?: unknown;
			s3_url?: unknown;
			mp3_url?: unknown;
			url?: unknown;
		};
		const id = typeof t._id === 'string' ? t._id : '';
		const src =
			(typeof t.s3_url === 'string' && t.s3_url) ||
			(typeof t.mp3_url === 'string' && t.mp3_url) ||
			(typeof t.url === 'string' && t.url) ||
			'';
		return `${id}|${src}`;
	}

	function applyMediaSessionMetadata() {
		if (!browser || !('mediaSession' in navigator)) return;
		const current = $selectAudio;
		if (!current) return;
		const key = getMetadataKey(current);
		if (key && key === lastMetadataKey && navigator.mediaSession.metadata) {
			// Same track, metadata still mounted — re-assigning would only
			// churn the lock-screen handler binding on iOS. Skip.
			return;
		}
		lastMetadataKey = key;
		const isMusic = 'category' in current;
		const isSermon = 'mp3_url' in current;
		const artworkUrl = getArtworkUrl(current as PlayableAudio);

		console.log('[MediaSession] metadata applied', { key });
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
					: 'Missionnaire Network',
			album: isMusic
				? (current as MusicAudio).book_full_name ||
					(current as MusicAudio).category ||
					'Missionnaire Network'
				: isSermon
					? (current as Sermon).iso_date || 'Prédication'
					: 'Missionnaire Network',
			artwork: [
				{ src: artworkUrl, sizes: '96x96', type: 'image/png' },
				{ src: artworkUrl, sizes: '192x192', type: 'image/png' },
				{ src: artworkUrl, sizes: '256x256', type: 'image/png' },
				{ src: artworkUrl, sizes: '384x384', type: 'image/png' },
				{ src: artworkUrl, sizes: '512x512', type: 'image/png' }
			]
		});
	}

	$: if (browser && $selectAudio) applyMediaSessionMetadata();

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
		if (event.key === 'Escape' && lyricsPanelOpen) {
			lyricsPanelOpen = false;
			return;
		}

		// Don't trigger if user is typing in an input or textarea
		const target = event.target as HTMLElement;
		if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

		const key = event.key.toLowerCase();

		switch (key) {
			case 'n': // Next
				if (hasPlaylistNavigation) playNext();
				break;
			case 'p': // Previous
				if (hasPlaylistNavigation) playPrevious();
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

	$: if (browser && playerShell) {
		lyricsPanelOpen;
		lyricsLines.length;
		void tick().then(syncPlayerInset);
	}

	onDestroy(() => {
		// SvelteKit invokes onDestroy during SSR cleanup too. None of the
		// teardown below is meaningful on the server — there's no audio
		// element, no DOM, no listeners to remove — and touching `document`
		// throws. Bail before any browser-only work.
		if (!browser) {
			destroyed = true;
			return;
		}

		// Order matters. Set `destroyed` first so every guarded code
		// path bails — including the pause-event handler that runs
		// synchronously inside audio.pause() below. On explicit closes we
		// clear userWantsToPlay, but during page/app teardown we preserve it
		// so the resume recorder can rehydrate the player after a cold return.
		// Only after that do we touch the audio element.
		const preservePlaybackIntent =
			userWantsToPlay &&
			(isPageLifecycleTeardown || document.visibilityState === 'hidden');

		destroyed = true;
		if (!preservePlaybackIntent) {
			setUserWantsToPlay(false);
		}
		shouldAutoplayOnLoad = false;
		clearSleepTimer({ persist: false });
		stopResumeWatchdog();
		stopSilentLoop();
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

<!--
	DOM-attached audio element. Lives outside the {#if $selectAudio} so it
	mounts on first render and persists across track changes / player UI
	visibility toggles. Attaching the audio to the DOM (instead of using
	`new Audio()`) makes iOS bind the audio session unambiguously to *this*
	PWA's WebKit process — the fix for the lock-screen Now Playing tap
	opening the wrong installed PWA. The {#key} wrapper lets
	rebuildAudioElement() force-recreate the element to escape a degraded
	AVAudioSession (rapid-repause recovery). `hidden` keeps it invisible
	without affecting playback behavior.
-->
{#key audioElementKey}
	<audio bind:this={audio} crossorigin="anonymous" playsinline preload="none" hidden></audio>
{/key}

<!--
	Silent-loop element — keeps the AVAudioSession alive across pauses of
	the main element in iOS standalone PWA mode. Sourced from a 1-second
	silent .mp3 in /static; loops forever once started by a user gesture.
	`preload="auto"` is intentional — we want the bytes ready before the
	user taps play on the main element so startSilentLoop() never stalls.
-->
<audio
	bind:this={silentAudio}
	src="/silence.mp3"
	loop
	playsinline
	preload="auto"
	hidden
	data-role="silent-loop"
></audio>

{#if $selectAudio}
	<div
		bind:this={playerShell}
		class:lyrics-open={lyricsPanelOpen && hasLyrics}
		class="audio-player-shell fixed z-[100] bottom-0 left-0 right-0 w-full bg-white/95 backdrop-blur-md border-t border-stone-200 shadow-[0_-4px_20px_rgb(0,0,0,0.06)] pt-2 md:pt-4"
		style={lyricsPanelOpen && hasLyrics
			? getLyricsArtworkStyle($selectAudio as PlayableAudio)
			: undefined}
	>
		{#if lyricsPanelOpen && hasLyrics}
			<div class="lyrics-drawer px-4 pb-3 pt-2 md:px-10 md:pb-4">
				<div class="lyrics-drawer-content mx-auto max-w-4xl">
					<div class="lyrics-sheet-handle" aria-hidden="true"></div>
					<div class="lyrics-drawer-header mb-3 flex items-center justify-between gap-3">
						<div class="min-w-0">
							<div class="text-[10px] font-bold uppercase tracking-[0.22em] text-missionnaire/90">
								Paroles disponibles
							</div>
							<div class="mt-0.5 truncate text-sm font-semibold text-stone-500">
								{getDisplayTitle($selectAudio)}
							</div>
						</div>
						<button
							type="button"
							class="lyrics-close-btn"
							on:click={() => (lyricsPanelOpen = false)}
						>
							Fermer
						</button>
					</div>
					<SyncedLyrics
						lines={lyricsLines}
						{currentTime}
						fullscreenMobile={true}
						on:seek={handleLyricsSeek}
					/>
				</div>
			</div>
		{/if}

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

		<div
			class="player-main px-5 md:px-10 max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:gap-8"
		>
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

				{#if hasLyrics}
					<button
						type="button"
						class="inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-2.5 py-2 text-xs font-bold transition-colors {lyricsPanelOpen
							? 'bg-missionnaire text-white'
							: 'bg-stone-50 text-stone-500 hover:bg-stone-100 hover:text-missionnaire'}"
						on:click={toggleLyricsPanel}
						aria-expanded={lyricsPanelOpen}
						aria-label={lyricsPanelOpen ? 'Fermer les paroles' : 'Ouvrir les paroles'}
						title={lyricsPanelOpen ? 'Fermer les paroles' : 'Paroles'}
					>
						<Icon src={BsMusicNoteList} size="17" />
						<span class="hidden sm:inline">Paroles</span>
					</button>
				{/if}

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
					{#if hasPlaylistNavigation}
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
					{/if}

					<div class="flex items-center gap-1 md:gap-3">
						{#if hasPlaylistNavigation}
							<button
								on:click={playPrevious}
								class="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition-colors hover:bg-missionnaire hover:text-white"
								aria-label="Piste précédente"
								title="Précédent"
							>
								<Icon src={BsSkipStartFill} size="20" />
							</button>
						{:else}
							<button
								on:click={() => seekBackward()}
								class="flex h-11 w-11 items-center justify-center rounded-full bg-stone-50 text-stone-400 transition-colors hover:bg-stone-100 hover:text-missionnaire md:hidden"
								title="-5s"
							>
								<Icon src={BsSkipBackwardFill} size="18" />
							</button>
						{/if}

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

						{#if hasPlaylistNavigation}
							<button
								on:click={playNext}
								class="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition-colors hover:bg-missionnaire hover:text-white"
								aria-label="Piste suivante"
								title="Suivant"
							>
								<Icon src={BsSkipEndFill} size="20" />
							</button>
						{:else}
							<button
								on:click={() => seekForward()}
								class="flex h-11 w-11 items-center justify-center rounded-full bg-stone-50 text-stone-400 transition-colors hover:bg-stone-100 hover:text-missionnaire md:hidden"
								title="+5s"
							>
								<Icon src={BsSkipForwardFill} size="18" />
							</button>
						{/if}
					</div>

					<!-- Repeat on mobile side -->
					{#if hasPlaylistNavigation}
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
					{/if}
				</div>

				<!-- Time & Extra Controls (Desktop) -->
				<div class="hidden md:flex items-center gap-6">
					<div class="flex items-center gap-1.5 font-bold text-[13px] text-stone-500 min-w-[90px]">
						<span class="text-stone-500">{formatTime(currentTime)}</span>
						<span class="text-stone-300">/</span>
						<span>{formatTime(duration)}</span>
					</div>

					<div class="flex items-center gap-2 border-l border-stone-100 pl-6">
						{#if hasPlaylistNavigation}
							<button
								on:click={toggleShuffle}
								class="p-2.5 rounded-full transition-all flex items-center gap-2 {$isShuffle
									? 'bg-missionnaire text-white'
									: 'bg-stone-50 text-stone-400 hover:bg-stone-100 hover:text-stone-600'}"
								title={$isShuffle ? 'Aléatoire activé' : 'Aléatoire désactivé'}
							>
								<Icon src={BsShuffle} size="16" />
							</button>
						{/if}

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
	.audio-player-shell {
		--lyrics-artwork: none;
		position: fixed;
		inset-inline: 0;
		bottom: 0;
		max-width: 100vw;
		padding-bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));
		-webkit-backface-visibility: hidden;
		backface-visibility: hidden;
		isolation: isolate;
	}

	.audio-player-shell.lyrics-open {
		background: rgba(250, 248, 243, 0.97);
		box-shadow: 0 -18px 60px rgba(41, 37, 36, 0.12);
	}

	.lyrics-drawer {
		border-bottom: 1px solid rgba(231, 229, 228, 0.74);
		background: linear-gradient(180deg, rgba(255, 251, 245, 0.92), rgba(250, 248, 243, 0.68));
	}

	.lyrics-drawer-content {
		position: relative;
	}

	.lyrics-sheet-handle {
		width: 2.85rem;
		height: 0.25rem;
		margin: 0 auto 0.8rem;
		border-radius: 999px;
		background: rgba(120, 113, 108, 0.28);
	}

	.lyrics-close-btn {
		flex-shrink: 0;
		border: 1px solid rgba(214, 211, 209, 0.9);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.74);
		padding: 0.45rem 0.85rem;
		color: rgb(87 83 78);
		font-size: 0.62rem;
		font-weight: 900;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		transition:
			border-color 160ms ease,
			background-color 160ms ease,
			color 160ms ease;
	}

	.lyrics-close-btn:hover {
		border-color: rgba(255, 136, 12, 0.55);
		background: white;
		color: rgb(194 100 12);
	}

	@media (min-width: 768px) {
		.audio-player-shell {
			padding-bottom: 1rem;
		}

		.audio-player-shell.lyrics-open .lyrics-drawer {
			padding-top: 0.75rem;
		}
	}

	@media (max-width: 767px) {
		/* Warm espresso base — same brand-warmth as the cream theme, just
		   pulled into shadow. Deliberate dark, not "art bleeding through
		   black". The artwork is atmospheric texture (low opacity), not
		   the dominant color. */
		.audio-player-shell.lyrics-open {
			top: 0;
			height: 100dvh;
			display: flex;
			flex-direction: column;
			overflow: hidden;
			padding-top: 0;
			background: #1a130c;
			color: #efe5d0;
		}

		.audio-player-shell.lyrics-open::before {
			content: '';
			position: absolute;
			inset: -2rem;
			z-index: -2;
			background-image:
				linear-gradient(180deg, rgba(26, 19, 12, 0.74), rgba(20, 14, 8, 0.96)),
				var(--lyrics-artwork);
			background-position: center;
			background-size: cover;
			filter: blur(36px) saturate(0.92);
			opacity: 0.32;
			transform: scale(1.08);
		}

		.audio-player-shell.lyrics-open::after {
			content: '';
			position: absolute;
			inset: 0;
			z-index: -1;
			background:
				radial-gradient(circle at 50% 6%, rgba(255, 136, 12, 0.14), transparent 28%),
				linear-gradient(180deg, rgba(26, 19, 12, 0.18), rgba(16, 11, 6, 0.78) 62%);
			pointer-events: none;
		}

		.audio-player-shell.lyrics-open .lyrics-drawer {
			order: 2;
			position: relative;
			z-index: 1;
			min-height: 0;
			flex: 1 1 auto;
			display: flex;
			flex-direction: column;
			margin-top: 0.45rem;
			/* Hairline cream rule — picks up the cream text instead of cool grey */
			border: 1px solid rgba(239, 229, 208, 0.08);
			border-bottom: 0;
			border-radius: 2rem 2rem 0 0;
			/* Warm dark espresso surface, slightly translucent so the artwork
			   atmosphere reads through subtly without dominating */
			background: rgba(35, 25, 16, 0.82);
			box-shadow: 0 -22px 70px rgba(0, 0, 0, 0.45);
			padding: 0.9rem 1.25rem 1rem;
			backdrop-filter: blur(28px) saturate(1.1);
		}

		.audio-player-shell.lyrics-open .lyrics-drawer-content {
			min-height: 0;
			width: 100%;
			display: flex;
			flex: 1 1 auto;
			flex-direction: column;
		}

		.audio-player-shell.lyrics-open .lyrics-drawer-header {
			border: 0;
			border-radius: 0;
			background: transparent;
			padding: 0.15rem 0.2rem 0.85rem;
			box-shadow: none;
		}

		.audio-player-shell.lyrics-open .lyrics-drawer-header .text-missionnaire\/90 {
			color: #efe5d0;
			letter-spacing: 0;
			text-transform: none;
			font-size: 0.95rem;
		}

		.audio-player-shell.lyrics-open .lyrics-drawer-header .text-stone-500 {
			color: rgba(239, 229, 208, 0.5);
		}

		.audio-player-shell.lyrics-open .lyrics-sheet-handle {
			width: 3.35rem;
			height: 0.24rem;
			margin-bottom: 1rem;
			background: rgba(239, 229, 208, 0.7);
		}

		.audio-player-shell.lyrics-open .lyrics-close-btn {
			border-color: rgba(239, 229, 208, 0.16);
			background: rgba(239, 229, 208, 0.06);
			color: rgba(239, 229, 208, 0.78);
		}

		.audio-player-shell.lyrics-open .lyrics-close-btn:hover {
			border-color: rgba(255, 190, 119, 0.45);
			background: rgba(255, 136, 12, 0.12);
			color: #ffbe77;
		}

		.audio-player-shell.lyrics-open .player-main {
			order: 1;
			position: relative;
			z-index: 1;
			width: 100%;
			flex-shrink: 0;
			border-top: 0;
			background: transparent;
			/* 0.75rem above the safe-area is enough breathing room — the
			   previous 2rem combined with the iPhone notch was eating
			   ~85px and pushing the title + buttons off-screen. */
			padding: calc(0.75rem + env(safe-area-inset-top, 0px)) 1rem 0.4rem;
			box-shadow: none;
		}

		/* Title block: tighten label, brighten title, drop the redundant
		   time display (the progress bar at top + lyrics drawer give the
		   user enough context — saving vertical space). */
		.audio-player-shell.lyrics-open .player-main > div:first-child {
			margin-bottom: 0.6rem;
			gap: 0.5rem;
		}

		.audio-player-shell.lyrics-open .player-main .font-black {
			font-size: 0.92rem;
			font-weight: 700;
			letter-spacing: 0;
		}

		.audio-player-shell.lyrics-open .player-main .text-missionnaire.opacity-80 {
			opacity: 0.7;
			font-size: 9px;
		}

		/* Hide the lyrics-toggle button in the player header when lyrics are
		   already open — the FERMER button in the drawer handles closing.
		   Same for the sleep-timer button: not critical when the user is
		   actively reading lyrics. Heart + close X stay visible. The X close
		   doesn't get matched: its aria-label has "lecteur" but no
		   aria-expanded attribute. */
		.audio-player-shell.lyrics-open .player-main button[aria-label*='paroles'],
		.audio-player-shell.lyrics-open .player-main button[aria-label*='lecteur'][aria-expanded] {
			display: none;
		}

		.audio-player-shell.lyrics-open .player-main .text-missionnaire {
			color: #ffbe77;
		}

		.audio-player-shell.lyrics-open .player-main .text-stone-900,
		.audio-player-shell.lyrics-open .player-main .text-stone-500 {
			color: #efe5d0;
		}

		.audio-player-shell.lyrics-open .player-main .text-stone-400 {
			color: rgba(239, 229, 208, 0.62);
		}

		.audio-player-shell.lyrics-open .player-main .text-stone-300 {
			color: rgba(239, 229, 208, 0.5);
		}

		.audio-player-shell.lyrics-open .player-main .bg-stone-50,
		.audio-player-shell.lyrics-open .player-main .bg-stone-100 {
			background: rgba(239, 229, 208, 0.08);
		}

		.audio-player-shell.lyrics-open .player-main .bg-gray-900 {
			background: rgba(255, 255, 255, 0.12);
		}

		.audio-player-shell.lyrics-open .player-main .bg-gray-900:hover {
			background: rgba(255, 255, 255, 0.18);
		}

		.audio-player-shell.lyrics-open .player-main .bg-stone-200 {
			background: rgba(255, 255, 255, 0.22);
		}
	}
</style>
