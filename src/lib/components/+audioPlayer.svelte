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
	import { focusTrap } from '$lib/actions/focusTrap';
	import { t } from '../../i18n';
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
	import RiSystemShareForwardLine from 'svelte-icons-pack/ri/RiSystemShareForwardLine';
	import BsLink45deg from 'svelte-icons-pack/bs/BsLink45deg';
	import BsChevronDown from 'svelte-icons-pack/bs/BsChevronDown';
	import BsMusicNoteList from 'svelte-icons-pack/bs/BsMusicNoteList';
	import AiOutlineDownload from 'svelte-icons-pack/ai/AiOutlineDownload';
	import SyncedLyrics from '$lib/components/SyncedLyrics.svelte';
	import {
		selectAudio,
		playlist,
		basePlaylist,
		currentIndex,
		isShuffle,
		isPlaying,
		playbackIntent,
		repeatOne,
		replayPlayback,
		livePlayback
	} from '../stores/global';
	import { isLiveStreamTrack, type LiveStreamTrack } from '$lib/utils/liveTrack';
	import type Hls from 'hls.js';
	import type { AudioAsset } from '$lib/models/media-assets';
	import type { MusicAudio } from '$lib/models/music-audio';
	import type { Sermon } from '$lib/models/sermon';
	import RiMediaRepeatOneLine from 'svelte-icons-pack/ri/RiMediaRepeatOneLine';
	import BsSkipStartFill from 'svelte-icons-pack/bs/BsSkipStartFill';
	import BsSkipEndFill from 'svelte-icons-pack/bs/BsSkipEndFill';
	import {
		encodeUrlPath,
		findAdjacentPlayableIndex,
		getPlayableAudioUrl,
		type PlayableAudio
	} from '../../utils/audioPlayback';
	import { toggleFavorite, isFavorite, favorites } from '../stores/musicHistory';
	import { songSlug } from '$lib/utils/songSlug';
	import { downloadAudioFile } from '../../utils/downloadAudio';
	import { getIntroSkipSeconds } from '$lib/utils/introSkip';
	// ── BEGIN: cache indicator imports (added) ────────────────────
	import { isCached, prefetchAudio } from '$lib/audioCache';
	import { isOnline } from '$lib/onlineStatus';
	// ── END: cache indicator imports ──────────────────────────────

	type LyricLine = string | Record<string, unknown>;

	let audio: HTMLAudioElement = $state(undefined as unknown as HTMLAudioElement);
	// Bumped to force Svelte to destroy + remount the <audio> element via the
	// `{#key audioElementKey}` block in the template. Used by the rapid-repause
	// recovery path (rebuildAudioElement) to obtain a brand-new media element,
	// which is the only reliable way to reset a degraded iOS AVAudioSession.
	let audioElementKey = $state(0);
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
	let currentTime = $state(0);
	let duration = $state(0);
	let progressBarWidth = $state(0);
	let indicatorPosition = 0;
	let isDragging = $state(false);
	let initialClickX = 0;
	let initialIndicatorPosition = 0;
	let volume = 1; // Initial volume (1 = full volume, 0 = mute)
	let isMuted = $state(false);
	let audioSrc: string = '';
	let isAudioReady = $state(false);
	let shouldAutoplayOnLoad = false;
	let playerShell: HTMLDivElement | null = $state(null);
	let playerResizeObserver: ResizeObserver | null = null;
	let lastPlayerInset = 0;
	let pendingPlaybackIntent: 'play' | 'pause' | null = $state(null);
	let lastKnownPlaybackTime = 0;
	let lastKnownPlaybackDuration = 0;
	let pendingSessionResumeTime: number | null = null;
	let isChangingSource = false;
	// Intro-skip bookkeeping: applied once per loaded source so a listener
	// deliberately seeking back to 0:00 isn't yanked forward again ('canplay'
	// re-fires after seeks). Plain lets — never read in templates.
	let introSkipAppliedForSrc = '';
	let introFadeTimer: ReturnType<typeof setInterval> | null = null;
	const SLEEP_TIMER_STORAGE_KEY = 'missionnaire:sleep-timer-ends-at';
	const sleepTimerOptions = [15, 30, 45, 60, 90];
	let isSleepTimerOpen = $state(false);
	let sleepTimerEndsAt: number | null = $state(null);
	let sleepTimerRemainingMs = $state(0);
	let sleepTimerTimeout: ReturnType<typeof setTimeout> | null = null;
	let sleepTimerTick: ReturnType<typeof setInterval> | null = null;
	let customSleepTime = $state('');
	let hasPlaylistNavigation = $derived($playlist.length > 1);

	// ── Live broadcast mode ────────────────────────────────────────
	// The live radio stream plays through this player as a pseudo-track
	// (see $lib/utils/liveTrack). Broadcast behavior differs from files:
	// Icecast reports Infinity duration so seeking/progress are meaningless,
	// "ended" means the connection dropped (reconnect at the live edge, not
	// next-track), and position save/restore must never apply.
	let isLiveTrack = $derived(isLiveStreamTrack($selectAudio));
	// Wall-clock epoch of the current stream connection: position 0 of a
	// fresh Icecast connection is "live at that instant". Stamped on every
	// `loadstart` so ALL reconnect paths (safePlay reload, element rebuild,
	// explicit live reconnect) keep the transcript sync correct.
	let liveConnectEpochMs: number | null = $state(null);
	let lastLiveProgressMs = 0;
	let liveReconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let liveReconnectAttempts = 0;
	const LIVE_RECONNECT_DELAYS = [1000, 2000, 3000, 5000, 10000, 15000];
	const LIVE_MAX_RECONNECT_ATTEMPTS = 8;
	// Icecast's silence fallback keeps bytes flowing through source blips, so
	// a wedged stream (no forward progress while playing) is a client-side
	// connection problem — reconnecting gets a fresh burst at the live edge.
	const LIVE_STALL_TIMEOUT_MS = 15_000;
	const LIVE_STALL_CHECK_INTERVAL_MS = 3_000;
	let liveStallTimer: ReturnType<typeof setInterval> | null = null;

	function withLiveCacheBuster(url: string): string {
		return `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
	}

	function clearLiveReconnectTimer() {
		if (liveReconnectTimer) {
			clearTimeout(liveReconnectTimer);
			liveReconnectTimer = null;
		}
	}

	// ── Live DVR (HLS) ─────────────────────────────────────────────
	// When the track carries an hlsUrl the player uses the server-side DVR
	// window instead of the Icecast byte stream: pause/resume of any length,
	// seeking back through the window, and an explicit jump-to-live — the
	// YouTube model. Safari/iOS plays HLS natively; everywhere else hls.js
	// drives MSE (loaded lazily so music listeners never pay for it).
	// Icecast (track.url) remains the fallback whenever HLS can't start.
	let hlsInstance: Hls | null = null;
	let liveIsHls = $state(false);
	let liveHlsFailed = false;
	let liveSeekStart = $state(0);
	let liveSeekEnd = $state(0);
	let liveDvrSeeking = $state(false);
	let liveDvrValue = $state(0);
	let liveDvrWindowSec = $derived(liveSeekEnd - liveSeekStart);
	// Only surface the scrubber once there's a meaningful window to seek in.
	let hasLiveDvr = $derived(isLiveTrack && liveIsHls && liveDvrWindowSec > 45);
	let liveBehindSec = $derived(Math.max(0, liveSeekEnd - currentTime));
	// HLS players hold ~3 target durations behind the playlist end while "at
	// the live edge" — anything under this is not a deliberate rewind.
	let liveAtEdge = $derived(liveBehindSec < 25);

	function destroyHls() {
		if (hlsInstance) {
			try {
				hlsInstance.destroy();
			} catch {
				/* already dead */
			}
			hlsInstance = null;
		}
	}

	/** Icecast fallback: (re)connect at the live edge with a fresh cache-buster. */
	function connectLiveIcecast() {
		if (!audio || !isLiveTrack) return;
		const rawUrl = getPlayableAudioUrl($selectAudio as PlayableAudio);
		if (!rawUrl) return;
		destroyHls();
		liveIsHls = false;
		isAudioReady = false;
		audio.crossOrigin = null; // Icecast sends no CORS headers — see <audio> template comment
		audio.src = withLiveCacheBuster(encodeUrlPath(rawUrl));
		audio.load();
		audio.play().catch(() => {
			// The error/ended handlers schedule the next attempt.
		});
	}

	async function connectLiveHlsJs(hlsUrl: string): Promise<boolean> {
		const mod = await import('hls.js');
		const HlsCtor = mod.default;
		if (!HlsCtor.isSupported()) return false;
		if (!audio || !isLiveTrack) return false;
		destroyHls();
		const h = new HlsCtor({ backBufferLength: 90 });
		hlsInstance = h;
		h.on(HlsCtor.Events.ERROR, (_event, data) => {
			if (!data.fatal) return;
			if (data.type === HlsCtor.ErrorTypes.NETWORK_ERROR) {
				// Playlist/segment fetch failed — resume loading from the same
				// position; the DVR window keeps it valid.
				h.startLoad();
			} else if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
				h.recoverMediaError();
			} else {
				console.warn('[AudioPlayer] Fatal HLS error — falling back to Icecast', data);
				liveHlsFailed = true;
				destroyHls();
				if (userWantsToPlay) connectLiveIcecast();
			}
		});
		h.loadSource(hlsUrl);
		h.attachMedia(audio);
		audio.play().catch(() => {
			// Autoplay policy — the canplay/gesture paths retry.
		});
		return true;
	}

	/** Single live entry point: prefer the HLS DVR, fall back to Icecast. */
	function connectLiveStream() {
		if (!audio || !isLiveTrack) return;
		const track = $selectAudio as LiveStreamTrack;
		const hlsUrl = track.hlsUrl;
		if (hlsUrl && !liveHlsFailed) {
			isAudioReady = false;
			audio.crossOrigin = null;
			// Safari/iOS: native HLS — seekable ranges and getStartDate() come
			// straight from the media engine.
			if (audio.canPlayType('application/vnd.apple.mpegurl')) {
				destroyHls();
				liveIsHls = true;
				audio.src = hlsUrl;
				audio.load();
				audio.play().catch(() => {});
				return;
			}
			liveIsHls = true;
			void connectLiveHlsJs(hlsUrl).then((ok) => {
				if (!ok) {
					liveHlsFailed = true;
					connectLiveIcecast();
				}
			});
			return;
		}
		connectLiveIcecast();
	}

	function seekToLiveEdge() {
		if (!audio) return;
		const syncPos = hlsInstance?.liveSyncPosition;
		if (typeof syncPos === 'number' && Number.isFinite(syncPos)) {
			audio.currentTime = syncPos;
		} else if (audio.seekable.length > 0) {
			const end = audio.seekable.end(audio.seekable.length - 1);
			audio.currentTime = Math.max(audio.seekable.start(0), end - 18);
		}
		void audio.play().catch(() => {});
	}

	// ── Behind-live indicator (both modes) ─────────────────────────
	// HLS: distance to the DVR window's end. Icecast: wall-clock elapsed
	// beyond the audio being heard (connection epoch + position) — grows
	// while paused, resets on the fresh-connection reconnect. The 1s ticker
	// keeps it counting while paused, when no timeupdate fires.
	let liveNowMs = $state(Date.now());
	let liveTicker: ReturnType<typeof setInterval> | null = null;
	function startLiveTicker() {
		if (liveTicker || !browser) return;
		liveTicker = setInterval(() => {
			liveNowMs = Date.now();
		}, 1000);
	}
	function stopLiveTicker() {
		if (liveTicker) {
			clearInterval(liveTicker);
			liveTicker = null;
		}
	}
	let liveIcecastBehindSec = $derived(
		!liveIsHls && liveConnectEpochMs !== null
			? Math.max(0, (liveNowMs - (liveConnectEpochMs + currentTime * 1000)) / 1000)
			: 0
	);
	let liveBehindDisplaySec = $derived(liveIsHls ? liveBehindSec : liveIcecastBehindSec);
	// Normal playback sits ~15-20s behind on HLS and ~5-15s on Icecast (burst
	// buffer) — only call it "behind" past deliberate-pause territory.
	let liveIsBehind = $derived(liveIsHls ? liveBehindSec >= 25 : liveIcecastBehindSec >= 45);

	/** The bottom-bar EN DIRECT button: snap back to the live edge. */
	function goToLiveEdge() {
		if (!audio || !isLiveTrack) return;
		setUserWantsToPlay(true);
		if (liveIsHls) {
			seekToLiveEdge();
			return;
		}
		// Icecast has no seekable window — a fresh connection IS the live edge.
		connectLiveStream();
	}

	function onLiveDvrInput(event: Event) {
		liveDvrSeeking = true;
		liveDvrValue = Number((event.target as HTMLInputElement).value);
	}

	function onLiveDvrCommit(event: Event) {
		if (!audio) return;
		let value = Number((event.target as HTMLInputElement).value);
		// Keep clear of both bounds: the window's tail is about to be deleted
		// server-side, and the head stalls if we outrun the last segment.
		value = Math.min(Math.max(value, liveSeekStart + 2), liveSeekEnd - 8);
		try {
			audio.currentTime = value;
			currentTime = value;
		} catch {
			/* not seekable yet */
		}
		liveDvrSeeking = false;
		void audio.play().catch(() => {});
	}

	function scheduleLiveReconnect() {
		if (liveReconnectTimer) return;
		if (liveReconnectAttempts >= LIVE_MAX_RECONNECT_ATTEMPTS) {
			liveReconnectAttempts = 0;
			setUserWantsToPlay(false);
			isPlaying.set(false);
			return;
		}
		const delay =
			LIVE_RECONNECT_DELAYS[Math.min(liveReconnectAttempts, LIVE_RECONNECT_DELAYS.length - 1)];
		liveReconnectAttempts += 1;
		liveReconnectTimer = setTimeout(() => {
			liveReconnectTimer = null;
			if (!isLiveTrack || !userWantsToPlay) return;
			connectLiveStream();
		}, delay);
	}

	function startLiveStallWatch() {
		if (liveStallTimer || !browser) return;
		lastLiveProgressMs = Date.now();
		liveStallTimer = setInterval(() => {
			if (!audio || !isLiveTrack || !userWantsToPlay) return;
			// Hidden tabs throttle timers and timeupdate — don't judge staleness.
			if (document.visibilityState !== 'visible' || audio.paused) {
				lastLiveProgressMs = Date.now();
				return;
			}
			if (liveReconnectTimer) return;
			if (Date.now() - lastLiveProgressMs < LIVE_STALL_TIMEOUT_MS) return;
			lastLiveProgressMs = Date.now();
			console.warn('[AudioPlayer] Live stream stalled — reconnecting at the live edge');
			connectLiveStream();
		}, LIVE_STALL_CHECK_INTERVAL_MS);
	}

	function stopLiveStallWatch() {
		if (liveStallTimer) {
			clearInterval(liveStallTimer);
			liveStallTimer = null;
		}
	}

	/** Fresh connection: position 0 is "live at this instant". Fires on every
	 *  load() regardless of which recovery path triggered it. */
	function handleLoadStart() {
		if (!isLiveTrack) return;
		liveConnectEpochMs = Date.now();
		lastLiveProgressMs = Date.now();
	}
	let lyricsLines: LyricLine[] = $state([]);
	let lyricsPanelOpen = $state(false);
	let hasLyrics = $derived(lyricsLines.length > 0);
	let lyricsFetchToken = 0;
	let lastLyricsAudioId = '';


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
		// ZERO-GAP TRANSITION (mirrors the MediaSession 'play' handler):
		// keep the silent loop alive across the play() call — iOS releases
		// the AVAudioSession in any gap between silent.pause() and main's
		// play promise resolving. handleAudioPlay stops the loop once main
		// is actually producing audio. While the keeper held the session
		// during the pause, a plain play() is reliable — no reload needed.
		resumeSessionHeld = silentLoopRunning;
		safePlay('auto');
	}

	function pauseCurrentAudio() {
		if (!audio || audio.paused) return;
		setPendingPlaybackIntent('pause');
		setUserWantsToPlay(false);
		rememberPlaybackPosition();
		// Start silent loop before pausing main so the AVAudioSession
		// stays alive — covers the "user paused in-app then locked
		// the device" path, where they later expect to resume from
		// the lock screen. Silent loop is iOS-PWA only (gated inside
		// startSilentLoop).
		startSilentLoop();
		audio.pause();
		if ('mediaSession' in navigator) {
			// Re-stamp metadata so iOS doesn't attribute the Now-Playing
			// widget to the silent loop (which has no metadata) and unmount
			// it — symptom: lock screen shows "playing" with no audio after
			// an in-app pause. Force-bypass the fingerprint memo first.
			lastMetadataKey = '';
			applyMediaSessionMetadata();
			// Defensive: starting the silent loop can cause the browser to
			// auto-flip playbackState back to 'playing' (silent is actively
			// playing media on the page). Re-stamp 'paused' explicitly so
			// the lock screen and hardware media keys see the correct state.
			navigator.mediaSession.playbackState = 'paused';
		}
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
		// Live: there is no meaningful position to remember — every resume
		// reconnects at the live edge.
		if (isLiveTrack) return;
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
		if (!audio || isLiveTrack) return 0;
		const liveTime = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
		// audio.load() can temporarily report 0 during an OS interruption. Keep
		// the last real playback position so the next play() does not restart.
		if (liveTime <= 0.25 && lastKnownPlaybackTime > 0.25) {
			return lastKnownPlaybackTime;
		}
		return Math.max(0, liveTime);
	}

	function restorePlaybackPosition(time: number) {
		// Live: seeking a continuous Icecast stream stalls the element — a
		// reconnect at the live edge is always the right recovery instead.
		if (isLiveTrack) return false;
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

	/** True when the silent-loop keeper held the AVAudioSession across the
	 *  pause we're now resuming from (iOS standalone PWA). In that case the
	 *  output route never tore down, so safePlay can use an instant plain
	 *  play() instead of the 1-2s load()-reload — the single biggest
	 *  "doesn't feel native" cost on in-app pause→resume. Consumed (reset)
	 *  by the next safePlay call. */
	let resumeSessionHeld = false;
	/** One-shot guard so the stuck-playback verifier escalates at most once
	 *  per resume attempt. Re-armed on each user-initiated resume. */
	let stuckVerifierArmed = false;
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
	let destroyed = $state(false);
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

	let titleProbeEl: HTMLSpanElement | null = $state(null);
	let titleViewportEl: HTMLDivElement | null = $state(null);
	let titleOverflows = $state(false);
	let titleMarqueeDuration = $state('18s');
	let titleResizeObserver: ResizeObserver | null = null;
	let titleMeasureRaf = 0;

	function measureTitleOverflow() {
		if (!browser) return;
		cancelAnimationFrame(titleMeasureRaf);
		titleMeasureRaf = requestAnimationFrame(() => {
			if (!titleViewportEl || !titleProbeEl) {
				titleOverflows = false;
				return;
			}
			const viewportWidth = titleViewportEl.clientWidth;
			const naturalWidth = titleProbeEl.getBoundingClientRect().width;
			if (viewportWidth <= 0 || naturalWidth <= 0) return;
			const overflows = naturalWidth > viewportWidth - 4;
			if (overflows) {
				// ~34px / second; clamped 12–28s so short overflows aren't a blur
				// and very long titles don't crawl forever.
				const seconds = Math.min(28, Math.max(12, naturalWidth / 34));
				titleMarqueeDuration = `${seconds.toFixed(2)}s`;
			}
			if (overflows !== titleOverflows) titleOverflows = overflows;
		});
	}

	function attachTitleObservers() {
		if (!browser) return;
		if (titleResizeObserver) titleResizeObserver.disconnect();
		if (!titleViewportEl || !titleProbeEl) return;
		titleResizeObserver = new ResizeObserver(measureTitleOverflow);
		titleResizeObserver.observe(titleViewportEl);
		titleResizeObserver.observe(titleProbeEl);
		measureTitleOverflow();
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

	/** Same as handleLyricsSeek but for window-level events from outside the
	 *  player (the rediffusion-page transcript). */
	function handleExternalSeek(event: CustomEvent<{ time: number }>) {
		handleLyricsSeek(event);
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

	// Build a shareable deep-link to the currently playing track. The
	// /musique page reads `?play=<id-or-slug>` on mount and starts that
	// song. We prefer a human-readable title slug — it renders nicely
	// in WhatsApp / iMessage / address bar — but fall back to the
	// ObjectId when the title is missing. The resolver accepts both, so
	// older ObjectId-style shares keep working.
	function buildShareUrl(audio: any): string {
		if (!audio || !browser) return '';
		// The live broadcast shares the live page itself, not a track link.
		if (isLiveStreamTrack(audio)) {
			return `${window.location.origin}/live`;
		}
		const id = typeof audio._id === 'string' ? audio._id.trim() : '';
		// Live rediffusions (past broadcasts) are shaped as MusicAudio with
		// `category: 'Direct'`, but they live under /live/rediffusions/<id>,
		// not /musique. Point their share link at the rediffusion page with
		// `?autoplay=1` so a recipient lands straight on the recording and
		// it starts playing.
		if (audio.category === 'Direct' && id) {
			return `${window.location.origin}/live/rediffusions/${id}?autoplay=1`;
		}
		const slug = songSlug(typeof audio.title === 'string' ? audio.title : '');
		const key = slug || id;
		if (!key) return '';
		return `${window.location.origin}/musique?play=${encodeURIComponent(key)}`;
	}

	let shareFeedback: 'copied' | 'error' | null = $state(null);
	let shareFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;
	let isShareMenuOpen = $state(false);
	let hasNativeShare = $state(false);

	function flashShareFeedback(state: 'copied' | 'error') {
		shareFeedback = state;
		if (shareFeedbackTimeout) clearTimeout(shareFeedbackTimeout);
		shareFeedbackTimeout = setTimeout(() => {
			shareFeedback = null;
			shareFeedbackTimeout = null;
		}, 1800);
	}

	function toggleShareMenu() {
		if (!browser || !$selectAudio) return;
		isShareMenuOpen = !isShareMenuOpen;
	}

	function closeShareMenu() {
		isShareMenuOpen = false;
	}

	async function copyShareLink() {
		closeShareMenu();
		if (!browser || !$selectAudio) return;
		const shareUrl = buildShareUrl($selectAudio as any);
		if (!shareUrl) return;
		try {
			await navigator.clipboard.writeText(shareUrl);
			flashShareFeedback('copied');
		} catch {
			flashShareFeedback('error');
		}
	}

	async function nativeShare() {
		closeShareMenu();
		if (!browser || !$selectAudio) return;
		const audio = $selectAudio as any;
		const shareUrl = buildShareUrl(audio);
		if (!shareUrl) return;

		const title = getDisplayTitle(audio);
		const shareData: ShareData = {
			title,
			text: `${title} — Missionnaire Network`,
			url: shareUrl
		};

		try {
			if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
				await navigator.share(shareData);
				return;
			}
		} catch (err) {
			if ((err as DOMException)?.name === 'AbortError') return;
		}

		// Web Share unsupported or threw — fall back to clipboard.
		try {
			await navigator.clipboard.writeText(shareUrl);
			flashShareFeedback('copied');
		} catch {
			flashShareFeedback('error');
		}
	}

	// ── Download the currently playing track ──────────────────────
	// Streams the file to disk (XHR blob) with live progress shown
	// inside the pill, mirroring the download buttons in the music /
	// sermon list rows. A second click while a download is in flight
	// cancels it via the AbortController.
	let isDownloading = $state(false);
	let downloadPercent: number | null = $state(0);
	let downloadController: AbortController | null = null;
	let downloadFeedback: 'error' | null = $state(null);
	let downloadFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;

	async function downloadCurrentAudio() {
		if (isDownloading && downloadController) {
			downloadController.abort();
			return;
		}
		if (!browser || !$selectAudio) return;
		const url = getPlayableAudioUrl($selectAudio as PlayableAudio);
		if (!url) return;

		const controller = new AbortController();
		downloadController = controller;
		isDownloading = true;
		downloadPercent = 0;
		try {
			await downloadAudioFile(url, getDisplayTitle($selectAudio), {
				signal: controller.signal,
				onProgress: (p) => (downloadPercent = p.percent)
			});
		} catch (err) {
			if (!controller.signal.aborted) {
				console.error('[AudioPlayer] Download failed:', err);
				downloadFeedback = 'error';
				if (downloadFeedbackTimeout) clearTimeout(downloadFeedbackTimeout);
				downloadFeedbackTimeout = setTimeout(() => {
					downloadFeedback = null;
					downloadFeedbackTimeout = null;
				}, 2200);
			}
		} finally {
			downloadController = null;
			isDownloading = false;
			downloadPercent = 0;
		}
	}



	// ── BEGIN: cache indicator state (added) ──────────────────────
	// Tracks whether the currently playing track has been cached by
	// the service worker. `null` while we don't know yet (initial
	// load / between tracks); boolean once isCached() resolves.
	let isCurrentTrackCached: boolean | null = $state(null);
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


	onDestroy(() => {
		if (prefetchTimer) clearTimeout(prefetchTimer);
		if (downloadFeedbackTimeout) clearTimeout(downloadFeedbackTimeout);
		downloadController?.abort();
	});
	// ── END: cache indicator state ────────────────────────────────

	function clearFinishedPlayerSnapshot() {
		setUserWantsToPlay(false);
		clearResumeState();
		clearPlayerSnapshot();
	}

	function handleEnded() {
		console.log('[Audio] ended event');
		// A live stream only "ends" when the connection breaks (Icecast
		// restart, network drop) — reconnect at the live edge instead of
		// advancing a playlist. The live page closes the player when the
		// broadcast is actually over.
		if (isLiveTrack) {
			isPlaying.set(false);
			if (userWantsToPlay) scheduleLiveReconnect();
			return;
		}
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
			const encodedUrl = encodeUrlPath(nextUrl);
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
			// Make sure silent loop is OFF — new main track will be the
			// active audio source.
			stopSilentLoop();
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
		// Defensive: main is now producing audio, so silent loop must
		// not be. Idempotent — bails if it's already stopped.
		stopSilentLoop();
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

		// Live: connection-level recovery is owned by the ended/error handlers
		// and the stall watchdog; OS interruptions (phone call) resume via the
		// visibility-return path. The file-oriented resume watchdog would race
		// those with competing play()/load() probes.
		if (isLiveTrack) return;
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

	/** Jump past a known-silent intro and ramp the volume up over ~600ms so
	 *  the entry feels gentle. No-ops when the listener is resuming mid-track
	 *  or the source was already handled. iOS ignores programmatic volume, so
	 *  there the seek applies without the fade — still better than dead air. */
	function applyIntroSkip() {
		if (!audio) return;
		const src = audio.currentSrc || audio.src;
		if (!src || introSkipAppliedForSrc === src) return;
		introSkipAppliedForSrc = src;
		if (pendingSessionResumeTime !== null) return;
		const skip = getIntroSkipSeconds($selectAudio);
		if (skip <= 0 || audio.currentTime >= skip) return;
		if (Number.isFinite(audio.duration) && audio.duration > 0 && skip >= audio.duration) return;
		try {
			audio.currentTime = skip;
		} catch {
			return;
		}
		if (isMuted) return;
		const targetVolume = audio.volume;
		if (introFadeTimer) clearInterval(introFadeTimer);
		audio.volume = 0;
		const startedAt = Date.now();
		const FADE_MS = 600;
		introFadeTimer = setInterval(() => {
			if (!audio) {
				if (introFadeTimer) clearInterval(introFadeTimer);
				introFadeTimer = null;
				return;
			}
			const progress = Math.min(1, (Date.now() - startedAt) / FADE_MS);
			audio.volume = targetVolume * progress;
			if (progress >= 1 && introFadeTimer) {
				clearInterval(introFadeTimer);
				introFadeTimer = null;
			}
		}, 40);
	}

	function handleAudioCanPlay() {
		isAudioReady = true;
		if (pendingSessionResumeTime !== null) {
			restorePlaybackPosition(pendingSessionResumeTime);
		}
		applyIntroSkip();
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
		// Live: a media error usually means the connection died mid-stream.
		// Keep the listener's intent and retry at the live edge with backoff.
		if (isLiveTrack && userWantsToPlay && audio?.src && audio.src !== location.href) {
			scheduleLiveReconnect();
		}
	}

	// Diagnostic-only listeners. Help debug iOS lock-screen / Bluetooth /
	// AVAudioSession issues. They do not mutate state.
	const logSuspend = () => console.log('[Audio] suspend');
	const logWaiting = () => console.log('[Audio] waiting');
	const logStalled = () => console.log('[Audio] stalled');
	const logEmptied = () => console.log('[Audio] emptied');
	const logAbort = () => console.log('[Audio] abort');

	function attachAudioListeners(el: HTMLAudioElement) {
		el.addEventListener('loadstart', handleLoadStart);
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
		el.removeEventListener('loadstart', handleLoadStart);
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
		// Live: the saved src may be an MSE blob URL (hls.js) — meaningless on
		// a fresh element. Reconnect through the live dispatcher instead.
		if (isLiveTrack) {
			connectLiveStream();
			return;
		}
		audio.src = savedSrc;
		audio.load();
	}

	function updateAudioSource(url: string) {
		if (!url) return;

		// Live streams get a per-connect cache-buster so every (re)connect is a
		// fresh Icecast session at the live edge, never a stale cached response.
		const encodedUrl = isLiveTrack
			? withLiveCacheBuster(encodeUrlPath(url))
			: encodeUrlPath(url);
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
		// Live routes through the HLS/Icecast dispatcher, never the generic
		// file path — DVR mode must engage when the track advertises it.
		if (isLiveTrack) {
			connectLiveStream();
			return;
		}
		// Belt-and-suspenders with the template's reactive crossorigin: make
		// sure the mode is right before the fetch starts.
		audio.crossOrigin = 'anonymous';
		audio.src = encodedUrl;
		audio.load();
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

	let progressBarElement: HTMLDivElement = $state(undefined as unknown as HTMLDivElement);

	// touchstart must be non-passive so startDrag can preventDefault scrolling.
	function nonpassiveTouchstart(node: HTMLElement, handler: (e: TouchEvent) => void) {
		node.addEventListener('touchstart', handler, { passive: false });
		return {
			destroy() {
				node.removeEventListener('touchstart', handler);
			}
		};
	}

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
		if (!audio || isLiveTrack) return;
		audio.currentTime += seconds;
		rememberPlaybackPosition();
		updateAudioTime();
		updateIndicator();
	};

	const seekBackward = (seconds: number = 5) => {
		if (!audio || isLiveTrack) return;
		audio.currentTime -= seconds;
		rememberPlaybackPosition();
		updateAudioTime();
		updateIndicator();
	};

	// Keyboard support for the custom progress-bar slider (role="slider").
	const handleProgressKeydown = (event: KeyboardEvent) => {
		if (event.key === 'ArrowRight') {
			event.preventDefault();
			seekForward(5);
		} else if (event.key === 'ArrowLeft') {
			event.preventDefault();
			seekBackward(5);
		}
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
			if (isLiveTrack) {
				// Forward progress — feeds the stall watchdog and confirms the
				// current connection is healthy (reset the reconnect backoff).
				lastLiveProgressMs = Date.now();
				liveReconnectAttempts = 0;
				// DVR window bounds for the live scrubber (HLS only — Icecast
				// exposes no meaningful seekable range).
				if (liveIsHls && audio.seekable.length > 0) {
					liveSeekStart = audio.seekable.start(0);
					liveSeekEnd = audio.seekable.end(audio.seekable.length - 1);
				}
			}
			rememberPlaybackPosition(currentTime, duration);
			progressBarWidth = (currentTime / duration) * 100;
			pushMediaSessionPosition();
			publishReplayPlayback();
		}
	};

	// Position bridge for the rediffusion-page transcript. Throttled — the
	// transcript only needs ~2 updates/s, while timeupdate fires 4-60×/s.
	let lastReplayPublishMs = 0;
	function publishReplayPlayback(force = false) {
		const now = Date.now();
		if (!force && now - lastReplayPublishMs < 500) return;
		lastReplayPublishMs = now;
		replayPlayback.set({
			trackId: ($selectAudio as { _id?: string } | null)?._id ?? null,
			timeSec: audio?.currentTime ?? 0,
			playing: $isPlaying
		});
	}
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

		// Live resume paths — never the generic load-and-restore dance:
		//  - HLS (MSE or native): the paused position stays valid inside the
		//    server-side DVR window, and load() would tear down hls.js's
		//    SourceBuffers — a plain play() resumes instantly in place.
		//  - Icecast short pause: resume from the browser buffer.
		//  - Icecast long pause: the buffer is stale/dead — reconnect straight
		//    at the live edge instead of a slow reload+restore.
		if (isLiveTrack) {
			if (hlsInstance || liveIsHls) {
				audio.play().catch(() => {
					/* hls.js error handling / gesture paths retry */
				});
				return;
			}
			const livePausedMs = audioPausedAt > 0 ? Date.now() - audioPausedAt : 0;
			if (reasonHint === 'long' || livePausedMs >= PAUSE_RELOAD_THRESHOLD_MS) {
				connectLiveStream();
				return;
			}
			audio.play().catch(() => {
				/* error handler schedules a live reconnect */
			});
			return;
		}

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

		const sessionHeld = resumeSessionHeld;
		resumeSessionHeld = false;
		const needsReload =
			reasonHint === 'long' ||
			hasOverrideSeek ||
			(reasonHint === 'auto' && pausedMs >= PAUSE_RELOAD_THRESHOLD_MS && !sessionHeld);

		if (!needsReload) {
			// Don't probe with play() while a reload is in flight — the
			// in-flight finish() will play() once the session is rebuilt.
			if (isReloadingSession) return;
			if (pendingSessionResumeTime !== null) {
				restorePlaybackPosition(pendingSessionResumeTime);
			} else if (audio.currentTime <= 0.25 && lastKnownPlaybackTime > 0.25) {
				restorePlaybackPosition(lastKnownPlaybackTime);
			}
			const t0 = audio.currentTime;
			stuckVerifierArmed = true;
			audio.play().catch((err) => {
				console.warn('[AudioPlayer] play() failed:', err);
			});
			// Stuck-playback verifier: if the element claims to be playing
			// but the clock hasn't advanced ~1.2s later, the session is in
			// the degraded state the reload exists for — escalate once.
			setTimeout(() => {
				if (!stuckVerifierArmed) return;
				stuckVerifierArmed = false;
				if (destroyed || !audio || !userWantsToPlay) return;
				if (audio.paused) return;
				if (audio.currentTime - t0 < 0.05) {
					console.warn('[AudioPlayer] Playback stuck after fast resume — reloading session');
					safePlay('long');
				}
			}, 1200);
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
			// The freeze means JS was fully suspended — the OS almost
			// certainly tore down the audio session with it. Resume with the
			// 'long' rebuild path so the listener doesn't have to tap play
			// after unlocking the phone.
			tryResumeAfterInterruption(PAUSE_RELOAD_THRESHOLD_MS);
		};
		const onBlur = () => console.log('[Lifecycle] blur', { ts: Date.now() });
		const onFocusLog = () => console.log('[Lifecycle] focus', { ts: Date.now() });

		// A dropped connection pauses playback with a media error; when the
		// network returns, rebuild and resume instead of waiting for a tap.
		const onOnline = () => {
			console.log('[Lifecycle] online');
			tryResumeAfterInterruption(PAUSE_RELOAD_THRESHOLD_MS);
		};

		document.addEventListener('visibilitychange', onVisibility);
		document.addEventListener('freeze', onFreeze);
		document.addEventListener('resume', onResume);
		window.addEventListener('online', onOnline);
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
			window.removeEventListener('online', onOnline);
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
	let silentAudio: HTMLAudioElement | null = $state(null);
	let silentLoopRunning = false;

	/** Detect iOS standalone PWA mode (installed-to-home-screen Safari).
	 *  The silent-loop AVAudioSession workaround only applies there. */
	function isIOSStandalonePWA(): boolean {
		if (!browser) return false;
		const nav = navigator as Navigator & {
			standalone?: boolean;
			maxTouchPoints?: number;
		};
		const ua = nav.userAgent || '';
		const isIOS =
			/iPad|iPhone|iPod/.test(ua) ||
			(ua.includes('Mac') && (nav.maxTouchPoints ?? 0) > 1);
		if (!isIOS) return false;
		return nav.standalone === true;
	}

	function startSilentLoop(): Promise<void> {
		if (!browser || !silentAudio) return Promise.resolve();
		// The silent loop is an iOS standalone-PWA workaround for the
		// AVAudioSession releasing its output route on audio.pause(). On
		// macOS / desktop / Android, a hidden audio element actively
		// playing in the background causes Chrome's hardware-media-key-
		// handling layer to treat the page as "playing" — auto-flipping
		// playbackState back to 'playing' even after we set 'paused'. The
		// next press of the play/pause media key then dispatches 'pause'
		// (a no-op since main is paused) instead of 'play', and resume
		// feels broken. Skip the loop on those platforms.
		if (!isIOSStandalonePWA()) return Promise.resolve();
		if (silentLoopRunning) return Promise.resolve();
		// `playsinline` + `muted=false` (a fully-silent file is enough —
		// muting would tell iOS to skip decoding and we'd be back at the
		// original suspension bug).
		silentAudio.loop = true;
		silentAudio.volume = 1;
		const p = silentAudio.play();
		if (!p || typeof p.then !== 'function') {
			silentLoopRunning = true;
			console.log('[SilentLoop] started (sync)');
			return Promise.resolve();
		}
		return p
			.then(() => {
				silentLoopRunning = true;
				console.log('[SilentLoop] started');
			})
			.catch((err) => {
				console.warn('[SilentLoop] failed to start', err);
			});
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
				// Idempotent: iOS dispatches duplicate `play` commands
				// (we see this consistently in real-device logs). If
				// main is already playing, the only thing left to do is
				// re-stamp the lock-screen state — calling play() on a
				// playing element is a no-op but the visual confirmation
				// matters so the listener doesn't double-tap.
				if (!audio.paused) {
					navigator.mediaSession.playbackState = 'playing';
					return;
				}
				setUserWantsToPlay(true);
				consecutiveFailedResumes = 0;
				audioElementRebuilt = false;
				// INSTANT VISUAL FEEDBACK: stamp playbackState BEFORE
				// awaiting audio.play(). The play promise takes
				// ~100-500ms to resolve; without this the lock-screen
				// UI shows "paused" the whole time, and listeners
				// (rationally) tap play again. We'll revert to 'paused'
				// in the catch block if play() actually fails.
				navigator.mediaSession.playbackState = 'playing';

				// ZERO-GAP TRANSITION: don't stop silent loop until
				// main is decoding. iOS releases AVAudioSession in any
				// microtask gap between silent.pause() and main play
				// promise resolution. Keep silent alive across the
				// await; stop it once main has confirmed play.

				if (audio.duration && audio.currentTime >= audio.duration) {
					audio.currentTime = 0;
				}
				if (audio.readyState === 0) {
					try { audio.load(); } catch {}
				}

				try {
					await audio.play();
					// Main is decoding. Release the silent loop.
					stopSilentLoop();
					// Re-stamp metadata so iOS rebinds the Now-Playing
					// widget cleanly to main. After the silent→main
					// handoff, iOS sometimes keeps the widget bound to
					// the now-stopped silent element (which has no
					// metadata) and unmounts it. Force-bypass the
					// fingerprint memo by clearing it first.
					lastMetadataKey = '';
					applyMediaSessionMetadata();
					navigator.mediaSession.playbackState = 'playing';
				} catch (err) {
					console.error('[MediaSession] play failed', err);
					try {
						audio.muted = true;
						await audio.play();
						audio.muted = false;
						stopSilentLoop();
					} catch (err2) {
						audio.muted = false;
						console.error('[MediaSession] muted fallback failed', err2);
						// Play genuinely failed. Revert the optimistic
						// UI stamp so the lock screen reflects reality.
						navigator.mediaSession.playbackState = 'paused';
					}
				}
			});
			navigator.mediaSession.setActionHandler('pause', async () => {
				console.log('[REMOTE COMMAND RECEIVED] pause', {
					boundInstanceId: audio?.dataset.instanceId ?? null,
					currentSeq: audioInstanceSeq,
					hidden: document.hidden,
					silentLoopRunning,
					ts: Date.now()
				});
				if (!audio) return;
				// Idempotent guard: iOS sometimes dispatches the pause
				// command multiple times for the same locked session.
				if (audio.paused) {
					navigator.mediaSession.playbackState = 'paused';
					return;
				}
				setUserWantsToPlay(false);
				setPendingPlaybackIntent('pause');
				navigator.mediaSession.playbackState = 'paused';
				rememberPlaybackPosition();
				// ZERO-GAP TRANSITION (see comment in 'play' handler).
				await startSilentLoop();
				audio.pause();
				// Re-stamp metadata so iOS doesn't attribute the
				// Now-Playing widget to the silent loop (which has no
				// metadata) and unmount it. Force-bypass the fingerprint
				// memo by clearing it first.
				lastMetadataKey = '';
				applyMediaSessionMetadata();
				navigator.mediaSession.playbackState = 'paused';
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
				if (!audio || details.seekTime == null || isLiveTrack) return;
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
			album: isLiveStreamTrack(current)
				? 'En direct'
				: isMusic
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
		if (event.key === 'Escape' && isShareMenuOpen) {
			isShareMenuOpen = false;
			return;
		}
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
			isShareMenuOpen = false;
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
		window.addEventListener('missionnaire-audio-close', closeAudioPlayer);
		window.addEventListener('missionnaire-audio-seek', handleExternalSeek as EventListener);

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
			window.removeEventListener('missionnaire-audio-close', closeAudioPlayer);
			window.removeEventListener('missionnaire-audio-seek', handleExternalSeek as EventListener);
			playerResizeObserver?.disconnect();
			playerResizeObserver = null;
			lastPlayerInset = 0;
			document.documentElement.style.setProperty('--audio-player-height', '0px');
		};
	});


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
		stopLiveStallWatch();
		stopLiveTicker();
		clearLiveReconnectTimer();
		destroyHls();
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
		cancelAnimationFrame(titleMeasureRaf);
		titleResizeObserver?.disconnect();
		titleResizeObserver = null;
	});
	let sleepTimerRemainingLabel =
		$derived(sleepTimerEndsAt !== null ? formatSleepTimerRemaining(sleepTimerRemainingMs) : '');
	let sleepTimerEndLabel =
		$derived(sleepTimerEndsAt !== null ? formatSleepTimerEndTime(sleepTimerEndsAt) : '');
	$effect(() => {
		if (browser && isSleepTimerOpen && !customSleepTime) {
			setDefaultSleepTimerClockTime();
		}
	});
	$effect(() => {
		if (!hasPlaylistNavigation && $isShuffle) {
			isShuffle.set(false);
		}
	});
	$effect(() => {
		if (browser && titleViewportEl && titleProbeEl) attachTitleObservers();
	});
	$effect(() => {
		if (browser) {
			// Re-measure whenever the displayed title changes.
			const _trackTitleRefresh = $selectAudio
				? getDisplayTitle($selectAudio)
				: '';
			void _trackTitleRefresh;
			measureTitleOverflow();
		}
	});
	$effect(() => {
		if (browser) {
			hasNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
		}
	});
	let currentFavId = $derived(getAudioFavId($selectAudio));
	let isCurrentFavorite = $derived(isFavorite(currentFavId, $favorites));
	let canShareCurrent = $derived(!!($selectAudio && ($selectAudio as any)?._id));
	// A live stream has a URL but nothing downloadable behind it.
	let canDownloadCurrent = $derived(
		!isLiveTrack && !!getPlayableAudioUrl($selectAudio as PlayableAudio)
	);
	$effect(() => {
		if (browser) {
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
	});
	// Re-check the cache flag whenever the selected track changes OR
	// whenever it starts playing (so a freshly fetched-and-cached track
	// flips its badge from "not cached" to "cached" without a refresh).
	$effect(() => {
		if (browser && $selectAudio) {
			isCurrentTrackCached = null;
			cacheCheckToken++;
			// Live streams are never SW-cached — leave the badge state null.
			if (!isLiveTrack) {
				const url = getPlayableAudioUrl($selectAudio as PlayableAudio);
				void refreshCachedFlag(url, cacheCheckToken);
			}
		}
	});
	$effect(() => {
		if (browser && $isPlaying && $selectAudio && !isLiveTrack) {
			const url = getPlayableAudioUrl($selectAudio as PlayableAudio);
			const token = ++cacheCheckToken;
			// Small delay: let the SW finish writing the response to cache
			// before we re-check, otherwise the first poll always misses.
			setTimeout(() => void refreshCachedFlag(url, token), 1500);
		}
	});
	let showOfflineUnavailable = $derived(browser && !$isOnline && isCurrentTrackCached === false);
	$effect(() => {
		if (browser && $selectAudio && $playlist.length > 1) {
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
	});
	$effect(() => {
		if ($selectAudio && browser) {
			const newSelected = $selectAudio;
			const rawUrl = getPlayableAudioUrl(newSelected as PlayableAudio);
			console.log('[AudioPlayer] Selected audio change, raw URL:', rawUrl);

			if (rawUrl && rawUrl !== audioSrc) {
				audioSrc = rawUrl;
				updateAudioSource(rawUrl);
			}
		}
	});
	// Auto-bind listeners whenever `audio` resolves to a new element — covers
	// both the initial mount and every rebuild triggered by audioElementKey++.
	// Without this, the {#key} rebuild path would leave a fresh DOM element
	// without any event wiring. Also catches up any pending `audioSrc` that
	// the $selectAudio reactive block queued before bind:this had fired.
	$effect(() => {
		if (browser && audio && audio !== listenersBoundTo) {
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
				if (isLiveTrack) {
					connectLiveStream();
				} else {
					audio.crossOrigin = 'anonymous';
					audio.src = encodeUrlPath(audioSrc);
					audio.load();
				}
			}
		}
	});
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
	$effect(() => {
		if (browser && audio && !destroyed && $isPlaying !== undefined) {
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
	});
	// Publish play/pause flips immediately (not throttled) so the transcript
	// freezes/resumes without a half-second lag.
	$effect(() => {
		if (browser && audio) {
			void $isPlaying;
			void $selectAudio;
			publishReplayPlayback(true);
		}
	});
	$effect(() => {
		if (browser) {
			syncMediaSessionPlaylistHandlers(hasPlaylistNavigation);
		}
	});
	$effect(() => {
		if (browser && $selectAudio) applyMediaSessionMetadata();
	});
	$effect(() => {
		if (browser && playerShell) {
			lyricsPanelOpen;
			lyricsLines.length;
			void tick().then(syncPlayerInset);
		}
	});

	// ── Live mode wiring ───────────────────────────────────────────
	// Stall watchdog runs only while the live track is selected; leaving live
	// mode (track change, close) also clears reconnect state so the next live
	// session starts clean.
	let wasLiveTrack = false;
	$effect(() => {
		if (!browser) return;
		if (isLiveTrack) {
			wasLiveTrack = true;
			startLiveStallWatch();
			startLiveTicker();
		} else {
			stopLiveTicker();
			stopLiveStallWatch();
			clearLiveReconnectTimer();
			liveReconnectAttempts = 0;
			liveConnectEpochMs = null;
			destroyHls();
			liveIsHls = false;
			liveHlsFailed = false;
			liveSeekStart = 0;
			liveSeekEnd = 0;
			if (wasLiveTrack) {
				wasLiveTrack = false;
				livePlayback.set({ playing: false, positionEpochMs: null });
			}
		}
	});
	// Position bridge for the live transcript: wall-clock moment of the audio
	// the listener is hearing right now.
	//  - HLS: EXT-X-PROGRAM-DATE-TIME gives the exact broadcast wall-clock of
	//    the playing frame (hls.js playingDate / Safari getStartDate) — stays
	//    correct across pauses of any length and DVR seeks.
	//  - Icecast fallback: connection epoch + playback position (position 0 of
	//    a fresh connection is "live at that instant").
	$effect(() => {
		if (!browser || !isLiveTrack) return;
		let positionEpochMs: number | null = null;
		if (liveIsHls) {
			// currentTime (reactive) retriggers this on every timeupdate; the
			// date values themselves come from the media engine.
			void currentTime;
			const playingDate = hlsInstance?.playingDate;
			if (playingDate) {
				positionEpochMs = playingDate.getTime();
			} else if (audio) {
				const startDate = (
					audio as HTMLAudioElement & { getStartDate?: () => Date }
				).getStartDate?.();
				if (startDate && !Number.isNaN(startDate.getTime())) {
					positionEpochMs = startDate.getTime() + currentTime * 1000;
				}
			}
		} else if (liveConnectEpochMs !== null) {
			positionEpochMs = liveConnectEpochMs + currentTime * 1000;
		}
		livePlayback.set({ playing: $isPlaying, positionEpochMs });
	});
</script>

<svelte:window
	onkeydown={handleKeydown}
	onmousemove={handleDrag}
	ontouchmove={handleDrag}
	onmouseup={endDrag}
	ontouchend={endDrag}
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
	<!-- crossorigin: S3 tracks are fetched in CORS mode (the bucket sends
	     Access-Control-Allow-Origin). The live Icecast stream does NOT send
	     CORS headers, and an element in CORS mode hard-rejects such media —
	     the controls toggle but no audio ever arrives. Live therefore loads
	     with no crossorigin attribute. -->
	<audio
		bind:this={audio}
		crossorigin={isLiveTrack ? null : 'anonymous'}
		playsinline
		preload="auto"
		hidden
	></audio>
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
		class="audio-player-shell fixed z-[100] bottom-0 left-0 right-0 w-full bg-white/95 backdrop-blur-md border-t border-stone-200 shadow-[0_-4px_20px_rgb(0,0,0,0.06)] pt-2 lg:pt-4"
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
								{$t('player.lyricsAvailable')}
							</div>
							<div class="mt-0.5 truncate text-sm font-semibold text-stone-500">
								{getDisplayTitle($selectAudio)}
							</div>
						</div>
						<button
							type="button"
							class="lyrics-close-btn"
							onclick={() => (lyricsPanelOpen = false)}
						>
							{$t('misc.close')}
						</button>
					</div>
					<SyncedLyrics
						lines={lyricsLines}
						{currentTime}
						fullscreenMobile={true}
						onseek={(detail) => handleLyricsSeek(new CustomEvent('seek', { detail }))}
					/>
				</div>
			</div>
		{/if}

		<!-- Desktop close: flush to the viewport's far-right corner.
		     Hidden on mobile where the close button lives in the title
		     row alongside the other compact-mode actions. -->
		<button
			class="absolute right-3 top-3 z-[110] hidden h-9 w-9 items-center justify-center rounded-full bg-gray-900 text-white shadow-lg transition-colors hover:bg-black lg:flex"
			onclick={closeAudioPlayer}
			aria-label={$t('player.close')}
			title={$t('misc.close')}
		>
			<Icon src={BsX} size="20" />
		</button>

		<!-- Top Progress Bar (hidden for the live stream — a continuous
		     Icecast broadcast has no finite timeline to scrub) -->
		{#if !isLiveTrack}
			<div
				bind:this={progressBarElement}
				class="absolute top-0 left-0 w-full h-8 [@media(pointer:coarse)]:h-11 -translate-y-1/2 cursor-pointer group/progress flex items-center justify-start z-50 touch-none select-none"
				onmousedown={startDrag}
				use:nonpassiveTouchstart={startDrag}
				onclick={seekTo}
				onkeydown={handleProgressKeydown}
				role="slider"
				tabindex="0"
				aria-label={$t('player.progressLabel')}
				aria-valuemin={0}
				aria-valuemax={duration}
				aria-valuenow={currentTime}
				aria-valuetext={$t('player.timeOf', {
					current: formatTime(currentTime),
					total: formatTime(duration)
				})}
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
		{/if}

		<div
			class="player-main px-5 lg:px-10 max-w-7xl mx-auto flex flex-col lg:flex-row lg:items-center lg:gap-8"
		>
			<!-- Info Row -->
			<div class="flex items-center justify-between gap-1 mb-3 lg:mb-0 lg:gap-0 lg:flex-1 lg:min-w-0">
				<div class="flex-1 min-w-0 min-h-[2.75rem] lg:min-h-[3rem]">
					<div
						class="text-[10px] uppercase tracking-[0.2em] font-bold text-missionnaire mb-0.5 opacity-80 flex flex-wrap items-center gap-x-2 gap-y-0.5 whitespace-nowrap"
					>
						{#if isLiveTrack}
							<span class="inline-flex items-center gap-1.5 text-red-600">
								<span class="relative inline-flex h-2 w-2">
									<span
										class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"
									></span>
									<span class="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
								</span>
								{$t('live.atLive')}
							</span>
						{:else}
							<span>{$t('player.nowPlaying')}</span>
						{/if}
						<!-- ── BEGIN: cache indicator badge (added) ──────────── -->
						{#if isCurrentTrackCached === true}
							<span
								class="inline-flex items-center gap-1 text-[9px] font-semibold tracking-normal normal-case text-emerald-600"
								title={$t('player.availableOffline')}
								aria-label={$t('player.trackCached')}
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
								<span>{$t('player.cached')}</span>
							</span>
						{/if}
						{#if showOfflineUnavailable}
							<span
								class="inline-flex items-center gap-1 text-[9px] font-semibold tracking-normal normal-case text-amber-600"
								title={$t('player.offlineNotCached')}
								aria-label={$t('player.trackUnavailableOffline')}
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
								<span>{$t('player.offline')}</span>
							</span>
						{/if}
						<!-- ── END: cache indicator badge ────────────────────── -->
					</div>
					<div class="track-title-row pr-4 font-black text-sm lg:text-lg text-stone-900">
						<span class="track-title-probe" aria-hidden="true" bind:this={titleProbeEl}>
							{getDisplayTitle($selectAudio)}
						</span>
						<div
							class="track-title-viewport"
							class:is-marquee={titleOverflows}
							bind:this={titleViewportEl}
							title={getDisplayTitle($selectAudio)}
							style="--marquee-duration: {titleMarqueeDuration}"
						>
							<div class="track-title-track">
								<span class="track-title-copy">{getDisplayTitle($selectAudio)}</span>
								<span class="track-title-copy track-title-copy--clone" aria-hidden="true">
									{getDisplayTitle($selectAudio)}
								</span>
							</div>
						</div>
					</div>
					{#if !isAudioReady}
						<div class="text-[10px] font-medium uppercase tracking-[0.15em] text-stone-400 mt-1">
							{$t('list.loading')}
						</div>
					{/if}
					{#if !isLiveTrack}
						<div class="flex items-center gap-2 mt-0.5 lg:hidden">
							<span class="text-[10px] font-medium text-stone-400">{formatTime(currentTime)}</span>
							<div class="w-1 h-1 rounded-full bg-stone-200"></div>
							<span class="text-[10px] font-medium text-stone-400">{formatTime(duration)}</span>
						</div>
					{:else}
						<!-- Mobile: behind-live counter + tap to jump back to live -->
						<div class="mt-0.5 lg:hidden">
							<button
								type="button"
								onclick={goToLiveEdge}
								aria-label={liveIsBehind ? $t('live.backToLive') : $t('live.atLive')}
								class="inline-flex items-center gap-1.5 uppercase text-[10px] font-bold tracking-[0.15em] px-2 py-0.5 rounded-full border transition-colors {liveIsBehind
									? 'border-missionnaire bg-missionnaire text-white'
									: 'border-transparent text-red-600 -ml-2'}"
							>
								<span class="relative inline-flex h-1.5 w-1.5">
									{#if !liveIsBehind}
										<span
											class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"
										></span>
									{/if}
									<span
										class="relative inline-flex h-1.5 w-1.5 rounded-full {liveIsBehind
											? 'bg-white'
											: 'bg-red-500'}"
									></span>
								</span>
								{$t('live.atLive')}{#if liveIsBehind}&nbsp;· -{formatTime(liveBehindDisplaySec)}{/if}
							</button>
						</div>
					{/if}
				</div>

				<!-- Action cluster: favorite anchors next to the title, then the
				     two pill actions (Paroles, Share) read as one matched set,
				     then the options ⋮ tails out. Order chosen to match the
				     audio-app convention: emotional toggle → content → social
				     → utility. -->
				{#if !isLiveTrack}
					<button
						class="player-action-icon flex-shrink-0 {isCurrentFavorite
							? 'text-red-500 hover:text-red-600'
							: 'text-stone-300 hover:text-red-400'}"
						onclick={handleToggleFavorite}
						aria-label={isCurrentFavorite ? $t('player.unfavorite') : $t('player.favorite')}
						title={isCurrentFavorite ? $t('player.unfavorite') : $t('player.favorite')}
					>
						<Icon src={isCurrentFavorite ? BsHeartFill : BsHeart} size="18" />
					</button>
				{/if}

				{#if hasLyrics}
					<button
						type="button"
						class="player-action-pill flex-shrink-0 {lyricsPanelOpen
							? 'is-active'
							: ''}"
						onclick={toggleLyricsPanel}
						aria-expanded={lyricsPanelOpen}
						aria-label={lyricsPanelOpen ? $t('player.closeLyrics') : $t('player.openLyrics')}
						title={lyricsPanelOpen ? $t('player.closeLyrics') : $t('player.lyrics')}
						data-player-action="lyrics"
					>
						<Icon src={BsMusicNoteList} size="17" />
						<span class="hidden sm:inline">{$t('player.lyrics')}</span>
					</button>
				{/if}

				{#if canShareCurrent}
					<div class="relative flex-shrink-0">
						<button
							type="button"
							class="player-action-pill {isShareMenuOpen ? 'is-active' : ''}"
							onclick={(e) => { e.stopPropagation(); toggleShareMenu(); }}
							aria-haspopup="menu"
							aria-expanded={isShareMenuOpen}
							aria-label={$t('player.shareSong')}
							title={$t('player.shareSong')}
						>
							<Icon src={RiSystemShareForwardLine} size="17" />
							<span class="hidden sm:inline">Share</span>
						</button>
						{#if isShareMenuOpen}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="share-menu z-[130] w-52 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-2xl"
								role="menu"
								tabindex="-1"
								use:focusTrap={{ onEscape: closeShareMenu }}
								onclick={(e) => e.stopPropagation()}
							>
								{#if hasNativeShare}
									<button
										type="button"
										role="menuitem"
										class="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50 hover:text-missionnaire"
										onclick={nativeShare}
									>
										<Icon src={RiSystemShareForwardLine} size="17" />
										<span>Share…</span>
									</button>
								{/if}
								<button
									type="button"
									role="menuitem"
									class="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50 hover:text-missionnaire"
									onclick={copyShareLink}
								>
									<Icon src={BsLink45deg} size="18" />
									<span>Copy link</span>
								</button>
							</div>
						{/if}
						{#if shareFeedback}
							<span
								class="absolute right-0 bottom-full z-[140] mb-2 whitespace-nowrap rounded-md bg-stone-900 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow-lg pointer-events-none"
								role="status"
							>
								{shareFeedback === 'copied' ? $t('player.linkCopied') : $t('player.copyFailed')}
							</span>
						{/if}
					</div>
				{/if}

				{#if canDownloadCurrent}
					<div class="relative flex-shrink-0">
						<button
							type="button"
							class="player-action-pill {isDownloading ? 'is-active' : ''}"
							onclick={(e) => { e.stopPropagation(); downloadCurrentAudio(); }}
							aria-label={isDownloading
								? $t('player.cancelDownload')
								: $t('player.downloadSong')}
							title={isDownloading
								? $t('player.downloadingClickCancel')
								: $t('player.download')}
						>
							<Icon src={AiOutlineDownload} size="17" />
							{#if isDownloading}
								<span>{downloadPercent === null ? '…' : `${downloadPercent}%`}</span>
							{:else}
								<span class="hidden sm:inline">Download</span>
							{/if}
						</button>
						{#if downloadFeedback}
							<span
								class="absolute right-0 bottom-full z-[140] mb-2 whitespace-nowrap rounded-md bg-stone-900 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white shadow-lg pointer-events-none"
								role="status"
							>
								{$t('player.downloadFailed')}
							</span>
						{/if}
					</div>
				{/if}

				<div class="relative flex-shrink-0">
					<button
						type="button"
						class="player-action-pill player-action-pill--options {isSleepTimerOpen
							? 'is-active'
							: ''} {sleepTimerEndsAt !== null && !isSleepTimerOpen ? 'is-armed' : ''}"
						onclick={(e) => { e.stopPropagation(); isSleepTimerOpen = !isSleepTimerOpen; }}
						aria-label={sleepTimerEndsAt !== null
							? $t('player.optionsTimerActive', { remaining: sleepTimerRemainingLabel })
							: $t('player.options')}
						aria-haspopup="menu"
						aria-expanded={isSleepTimerOpen}
						title={sleepTimerEndsAt !== null
							? $t('player.optionsStopIn', { remaining: sleepTimerRemainingLabel })
							: $t('misc.options')}
						data-player-action="options"
					>
						<!-- Lucide "settings-2" inlined (svelte-icons-pack has no `lu/`
						     pack and we don't want a whole icon package for one glyph) -->
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
						>
							<path d="M20 7h-9" />
							<path d="M14 17H5" />
							<circle cx="17" cy="17" r="3" />
							<circle cx="7" cy="7" r="3" />
						</svg>
						<span class="hidden sm:inline">{$t('misc.more')}</span>
						<Icon
							src={BsChevronDown}
							size="11"
							className="player-action-pill__caret {isSleepTimerOpen ? 'is-flipped' : ''}"
						/>
						{#if sleepTimerEndsAt !== null}
							<span
								class="player-action-pill__dot"
								aria-hidden="true"
							></span>
						{/if}
					</button>

					{#if isSleepTimerOpen}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="absolute right-0 bottom-full z-[120] mb-3 w-72 max-w-[calc(100vw-2rem)] border border-stone-200 bg-white p-3 shadow-2xl rounded-lg"
							use:focusTrap={{ onEscape: () => (isSleepTimerOpen = false) }}
							onclick={(e) => e.stopPropagation()}
						>
							<div class="mb-3 flex items-center justify-between gap-3">
								<div class="min-w-0">
									<div class="text-[10px] font-bold uppercase tracking-[0.22em] text-missionnaire">
										{$t('misc.options')}
									</div>
									<div class="mt-0.5 text-xs font-semibold text-stone-500">
										{#if sleepTimerEndsAt !== null}
											{$t('player.timerStopsAt', {
												end: sleepTimerEndLabel,
												remaining: sleepTimerRemainingLabel
											})}
										{:else}
											{$t('player.timerOff')}
										{/if}
									</div>
								</div>
								{#if sleepTimerEndsAt !== null}
									<button
										type="button"
										class="shrink-0 rounded-full border border-stone-200 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500 transition-colors hover:border-missionnaire hover:text-missionnaire"
										onclick={() => clearSleepTimer({ closeMenu: true })}
									>
										{$t('misc.cancel')}
									</button>
								{/if}
							</div>

							{#if !isLiveTrack}
							<button
								type="button"
								class="mb-3 flex w-full items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-left transition-colors hover:border-missionnaire hover:bg-missionnaire/5"
								onclick={toggleRepeatOne}
								aria-pressed={$repeatOne}
							>
								<span class="inline-flex min-w-0 items-center gap-2">
									<Icon
										src={RiMediaRepeatOneLine}
										size="17"
										color={$repeatOne ? '#FF880C' : '#a8a29e'}
									/>
									<span class="truncate text-xs font-bold text-stone-700">{$t('player.repeatOne')}</span>
								</span>
								<span
									class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] {$repeatOne
										? 'bg-missionnaire text-white'
										: 'bg-white text-stone-400'}"
								>
									{$repeatOne ? 'On' : 'Off'}
								</span>
							</button>
							{/if}

							<div class="mb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
								{$t('player.sleepTimerHeading')}
							</div>
							<div class="grid grid-cols-3 gap-2">
								{#each sleepTimerOptions as minutes}
									<button
										type="button"
										class="rounded-lg border border-stone-200 bg-stone-50 px-2 py-2 text-xs font-bold text-stone-700 transition-colors hover:border-missionnaire hover:bg-missionnaire/5 hover:text-missionnaire"
										onclick={() => setSleepTimerForMinutes(minutes)}
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
									{$t('player.stopAt')}
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
										onclick={() => setSleepTimerForClockTime(customSleepTime)}
									>
										OK
									</button>
								</div>
							</div>
						</div>
					{/if}
				</div>

				<span
					class="ml-1.5 mr-0.5 h-6 w-px shrink-0 self-center bg-stone-200 lg:hidden"
					aria-hidden="true"
				></span>

				<button
					class="bg-gray-900 hover:bg-black text-white p-2 rounded-full transition-colors lg:hidden"
					onclick={closeAudioPlayer}
					aria-label={$t('player.close')}
				>
					<Icon src={BsX} size="20" />
				</button>
			</div>

			<!-- Controls & Time Row -->
			<div
				class="flex -translate-y-[5px] flex-col items-center lg:translate-y-0 lg:flex-row lg:gap-6 w-full lg:w-auto"
			>
				<!-- Main Playback Controls -->
				<div class="flex items-center justify-center gap-4 lg:gap-6">
					<!-- Shuffle on mobile side -->
					{#if hasPlaylistNavigation}
						<div class="flex lg:hidden items-center gap-1">
							<button
								onclick={toggleShuffle}
								class="p-2.5 rounded-full transition-all flex items-center gap-2 {$isShuffle
									? 'bg-missionnaire text-white shadow-md shadow-missionnaire/20'
									: 'bg-stone-50 text-stone-400 hover:bg-stone-100 hover:text-stone-600'}"
								title={$isShuffle ? $t('player.shuffleOn') : $t('player.shuffleOff')}
							>
								<Icon src={BsShuffle} size="16" />
							</button>
						</div>
					{/if}

					<div class="flex items-center gap-1 lg:gap-3">
						{#if hasPlaylistNavigation}
							<button
								onclick={playPrevious}
								class="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition-colors hover:bg-missionnaire hover:text-white"
								aria-label={$t('player.previous')}
								title={$t('pagination.previous')}
							>
								<Icon src={BsSkipStartFill} size="20" />
							</button>
						{:else if !isLiveTrack}
							<button
								onclick={() => seekBackward()}
								class="flex h-11 w-11 items-center justify-center rounded-full bg-stone-50 text-stone-400 transition-colors hover:bg-stone-100 hover:text-missionnaire lg:hidden"
								title="-5s"
							>
								<Icon src={BsSkipBackwardFill} size="18" />
							</button>
						{/if}

						{#if !isLiveTrack}
							<button
								onclick={() => seekBackward()}
								class="hidden lg:block p-2 text-stone-300 hover:text-missionnaire transition-colors"
								title="-5s"
							>
								<Icon src={BsSkipBackwardFill} size="16" />
							</button>
						{/if}

						<button
							onclick={togglePlay}
							class="relative flex items-center justify-center w-14 h-14 lg:w-12 lg:h-12 bg-missionnaire text-white rounded-full hover:scale-105 transition-transform shadow-lg shadow-missionnaire/20"
						>
							{#if $isPlaying}
								<Icon src={BsPauseCircleFill} size="32" />
							{:else}
								<Icon src={BsPlayCircleFill} size="32" />
							{/if}
						</button>

						{#if !isLiveTrack}
							<button
								onclick={() => seekForward()}
								class="hidden lg:block p-2 text-stone-300 hover:text-missionnaire transition-colors"
								title="+5s"
							>
								<Icon src={BsSkipForwardFill} size="16" />
							</button>
						{/if}

						{#if hasPlaylistNavigation}
							<button
								onclick={playNext}
								class="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition-colors hover:bg-missionnaire hover:text-white"
								aria-label={$t('player.next')}
								title={$t('pagination.next')}
							>
								<Icon src={BsSkipEndFill} size="20" />
							</button>
						{:else if !isLiveTrack}
							<button
								onclick={() => seekForward()}
								class="flex h-11 w-11 items-center justify-center rounded-full bg-stone-50 text-stone-400 transition-colors hover:bg-stone-100 hover:text-missionnaire lg:hidden"
								title="+5s"
							>
								<Icon src={BsSkipForwardFill} size="18" />
							</button>
						{/if}
					</div>

					<!-- Repeat on mobile side -->
					{#if hasPlaylistNavigation}
						<div class="flex lg:hidden items-center gap-1">
							<button
								onclick={toggleRepeatOne}
								class="p-2.5 rounded-full transition-all flex items-center gap-2 {$repeatOne
									? 'bg-missionnaire text-white shadow-md shadow-missionnaire/20'
									: 'bg-stone-50 text-stone-400 hover:bg-stone-100 hover:text-stone-600'}"
								title={$repeatOne ? $t('player.repeatOn') : $t('player.repeatOff')}
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
				<div class="hidden lg:flex items-center gap-6">
					<div class="flex items-center gap-1.5 font-bold text-[13px] text-stone-500 min-w-[90px]">
						{#if isLiveTrack}
							<button
								type="button"
								onclick={goToLiveEdge}
								title={$t('live.backToLive')}
								aria-label={liveIsBehind ? $t('live.backToLive') : $t('live.atLive')}
								class="inline-flex items-center gap-1.5 uppercase text-[11px] tracking-[0.15em] px-2.5 py-1 rounded-full border transition-colors {liveIsBehind
									? 'border-missionnaire bg-missionnaire text-white hover:bg-orange-600'
									: 'border-transparent text-red-600 hover:border-red-200'}"
							>
								<span class="relative inline-flex h-2 w-2">
									{#if !liveIsBehind}
										<span
											class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"
										></span>
									{/if}
									<span
										class="relative inline-flex h-2 w-2 rounded-full {liveIsBehind
											? 'bg-white'
											: 'bg-red-500'}"
									></span>
								</span>
								{$t('live.atLive')}{#if liveIsBehind}&nbsp;· -{formatTime(liveBehindDisplaySec)}{/if}
							</button>
						{:else}
							<span class="text-stone-500">{formatTime(currentTime)}</span>
							<span class="text-stone-300">/</span>
							<span>{formatTime(duration)}</span>
						{/if}
					</div>

					<div class="flex items-center gap-2 border-l border-stone-100 pl-6">
						{#if hasPlaylistNavigation}
							<button
								onclick={toggleShuffle}
								class="p-2.5 rounded-full transition-all flex items-center gap-2 {$isShuffle
									? 'bg-missionnaire text-white'
									: 'bg-stone-50 text-stone-400 hover:bg-stone-100 hover:text-stone-600'}"
								title={$isShuffle ? $t('player.shuffleOn') : $t('player.shuffleOff')}
							>
								<Icon src={BsShuffle} size="16" />
							</button>
						{/if}

						{#if !isLiveTrack}
							<button
								onclick={toggleRepeatOne}
								class="p-2.5 rounded-full transition-all flex items-center gap-2 {$repeatOne
									? 'bg-missionnaire text-white shadow-md shadow-missionnaire/20'
									: 'bg-stone-50 text-stone-400 hover:bg-stone-100'}"
								title={$repeatOne ? $t('player.repeatOn') : $t('player.repeatOff')}
							>
								<Icon
									src={RiMediaRepeatOneLine}
									size="20"
									color={$repeatOne ? '#ffffff' : '#a8a29e'}
								/>
							</button>
						{/if}

						<div class="flex items-center gap-2 ml-2">
							<button
								onclick={toggleMute}
								class="p-2 text-stone-400 hover:text-missionnaire transition-colors"
							>
								{#if !isMuted}
									<Icon src={BsVolumeUpFill} size="20" />
								{:else}
									<Icon src={BsVolumeMuteFill} size="20" />
								{/if}
							</button>
						</div>

						<!-- Desktop close button lives in the absolutely-positioned
						     corner anchor below (just inside audio-player-shell) so
						     it sits flush against the viewport edge rather than
						     inside the centered max-w-7xl content row. -->
						<!-- /removed-from-here -->

					</div>
				</div>
			</div>
		</div>

		<!-- Live DVR scrubber (HLS only): seek back through the server-side
		     window, see how far behind live you are, and jump back to the
		     edge — YouTube-style. Hidden for the Icecast fallback, which has
		     no server-side window. -->
		{#if hasLiveDvr}
			<div class="px-5 lg:px-10 max-w-7xl mx-auto pb-2 pt-1 lg:pb-3">
				<div class="flex items-center gap-3">
					<input
						type="range"
						class="live-dvr-scrubber flex-1 min-w-0"
						min={liveSeekStart}
						max={liveSeekEnd}
						step="1"
						value={liveDvrSeeking ? liveDvrValue : Math.min(currentTime, liveSeekEnd)}
						oninput={onLiveDvrInput}
						onchange={onLiveDvrCommit}
						aria-label={$t('live.scrubberLabel')}
						aria-valuetext={liveAtEdge
							? $t('live.atLive')
							: $t('live.behindLive', { label: formatTime(liveBehindSec) })}
					/>
					{#if !liveAtEdge}
						<span class="text-[11px] font-mono text-stone-500 tabular-nums shrink-0">
							-{formatTime(liveBehindSec)}
						</span>
					{/if}
					<button
						type="button"
						onclick={seekToLiveEdge}
						aria-label={liveAtEdge ? $t('live.atLive') : $t('live.backToLive')}
						title={liveAtEdge ? $t('live.atLive') : $t('live.backToLive')}
						class="inline-flex items-center gap-1.5 px-3 py-1.5 border text-[10px] font-bold uppercase tracking-[0.15em] font-body transition-all duration-200 shrink-0 {liveAtEdge
							? 'border-red-500 text-red-600 bg-red-50/60'
							: 'border-missionnaire text-missionnaire hover:bg-missionnaire hover:text-white'}"
					>
						<span class="relative inline-flex h-2 w-2">
							{#if liveAtEdge}
								<span
									class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"
								></span>
							{/if}
							<span
								class="relative inline-flex h-2 w-2 rounded-full {liveAtEdge
									? 'bg-red-500'
									: 'bg-missionnaire'}"
							></span>
						</span>
						{liveAtEdge ? $t('live.atLive') : $t('live.backToLive')}
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Live DVR scrubber — same visual language as the old live page slider. */
	.live-dvr-scrubber {
		-webkit-appearance: none;
		appearance: none;
		height: 3px;
		background: rgb(229 225 220);
		border-radius: 9999px;
		outline: none;
		cursor: pointer;
	}
	.live-dvr-scrubber::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 11px;
		height: 11px;
		border-radius: 9999px;
		background: #ff880c;
		border: 2px solid white;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
		cursor: pointer;
	}
	.live-dvr-scrubber::-moz-range-thumb {
		width: 11px;
		height: 11px;
		border-radius: 9999px;
		background: #ff880c;
		border: 2px solid white;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
		cursor: pointer;
	}
	@media (pointer: coarse) {
		.live-dvr-scrubber::-webkit-slider-thumb {
			width: 22px;
			height: 22px;
		}
		.live-dvr-scrubber::-moz-range-thumb {
			width: 22px;
			height: 22px;
		}
	}

	/* ── Action cluster (favorite, Paroles, Share, ⋮) ─────────────────
	   One small button family with two shapes: round icon and rounded
	   pill. Both share the same hover language so they read as a set
	   rather than four independent controls. Active state (Paroles open
	   / Share menu open) flips to the brand colour. */
	.player-action-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		border-radius: 9999px;
		transition: color 150ms ease, background-color 150ms ease, transform 150ms ease;
	}
	.player-action-icon:hover {
		background-color: rgb(245 245 244 / 0.7);
	}
	.player-action-icon:active {
		transform: scale(0.94);
	}

	.player-action-pill {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 0.625rem;
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 700;
		line-height: 1;
		background-color: rgb(245 245 244 / 0.85);
		color: rgb(120 113 108);
		transition: background-color 160ms ease, color 160ms ease, transform 160ms ease,
			box-shadow 160ms ease;
	}
	@media (min-width: 640px) {
		.player-action-pill {
			padding: 0.5rem 0.75rem;
		}
	}
	.player-action-pill:hover {
		background-color: rgb(231 229 228);
		color: rgb(255 136 12);
	}
	.player-action-pill:active {
		transform: scale(0.96);
	}
	.player-action-pill.is-active {
		background-color: rgb(255 136 12);
		color: white;
		box-shadow: 0 6px 18px -8px rgb(255 136 12 / 0.55);
	}
	.player-action-pill.is-active:hover {
		background-color: rgb(234 116 0);
		color: white;
	}

	/* Options pill: same family as Paroles/Share, with a chevron that
	   telegraphs "menu inside" — the bare three-dots variant left users
	   unsure whether it was clickable. The caret rotates when the menu
	   opens for an extra confirmation cue. */
	.player-action-pill--options {
		position: relative;
		padding-right: 0.5rem;
	}
	@media (min-width: 640px) {
		.player-action-pill--options {
			padding-right: 0.625rem;
		}
	}
	:global(.player-action-pill__caret) {
		margin-left: 0.0625rem;
		opacity: 0.7;
		transition: transform 180ms ease, opacity 180ms ease;
	}
	.player-action-pill--options:hover :global(.player-action-pill__caret) {
		opacity: 1;
	}
	:global(.player-action-pill__caret.is-flipped) {
		transform: rotate(180deg);
		opacity: 1;
	}
	.player-action-pill--options.is-armed {
		background-color: rgb(28 25 23);
		color: white;
	}
	.player-action-pill--options.is-armed:hover {
		background-color: rgb(0 0 0);
		color: white;
	}
	.player-action-pill__dot {
		position: absolute;
		top: -2px;
		right: -2px;
		height: 10px;
		width: 10px;
		border-radius: 9999px;
		background-color: rgb(52 211 153);
		box-shadow: 0 0 0 2px white, 0 0 0 3px rgb(255 255 255 / 0.6);
	}
	.player-action-pill--options.is-armed .player-action-pill__dot {
		box-shadow: 0 0 0 2px rgb(28 25 23);
	}

	/* Share dropdown placement — anchored directly above the share
	   button on every screen. We tried fixed-positioning the menu to
	   the player's bottom inset on mobile (to dodge an earlier clipping
	   issue), but that anchored against the *whole* player height and
	   left a 200-ish-px gap between the button and the menu. Absolute
	   positioning sits the menu right on top of the button; clipping
	   isn't a real concern because the shell sets `isolation: isolate`
	   at z-100 and the menu lifts to z-130 inside that context. */
	.share-menu {
		position: absolute;
		right: 0;
		bottom: 100%;
		margin-bottom: 0.5rem;
	}
	/* Lyrics open on mobile pins the player-main row to the TOP of the
	   viewport (the lyrics drawer fills the rest of the 100dvh shell).
	   Opening the menu "above" the share button would push it off the
	   top of the screen — flip the direction so it drops INTO the
	   lyrics drawer area where there is plenty of room. */
	@media (max-width: 767px) {
		.audio-player-shell.lyrics-open .share-menu {
			top: 100%;
			bottom: auto;
			margin-top: 0.5rem;
			margin-bottom: 0;
		}
	}

	/* ── Scrolling track title ─────────────────────────────────────────
	   The title sits inside a fixed-width viewport. A hidden probe at the
	   same font sizing reports the natural text width; a Svelte action
	   compares that to the viewport and toggles `.is-marquee`. In the
	   default state we render a single clean ellipsis. When marquee is
	   active, a duplicated copy slides across at a length-aware pace and
	   a `mask-image` fade hints at hidden text on the right.
	   --------------------------------------------------------------- */
	.track-title-row {
		position: relative;
		min-width: 0;
	}

	.track-title-probe {
		position: absolute;
		top: 0;
		left: 0;
		visibility: hidden;
		pointer-events: none;
		white-space: nowrap;
		font: inherit;
		letter-spacing: inherit;
	}

	.track-title-viewport {
		position: relative;
		overflow: hidden;
		min-width: 0;
		/* Bottom padding catches any descender clipping under the mask. */
		padding-bottom: 0.05rem;
	}

	.track-title-viewport.is-marquee {
		-webkit-mask-image: linear-gradient(
			to right,
			black 0,
			black calc(100% - 1.75rem),
			transparent 100%
		);
		mask-image: linear-gradient(
			to right,
			black 0,
			black calc(100% - 1.75rem),
			transparent 100%
		);
	}

	.track-title-track {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.track-title-copy {
		/* In static (ellipsis) mode the parent handles overflow. */
		display: inline;
	}

	.track-title-copy--clone {
		display: none;
	}

	.track-title-viewport.is-marquee .track-title-track {
		display: flex;
		width: max-content;
		overflow: visible;
		text-overflow: clip;
		animation: track-title-scroll var(--marquee-duration, 18s) linear infinite;
		will-change: transform;
	}

	.track-title-viewport.is-marquee .track-title-copy {
		flex-shrink: 0;
		padding-right: 3.25rem;
		display: inline-block;
	}

	.track-title-viewport.is-marquee .track-title-copy--clone {
		display: inline-block;
	}

	.track-title-viewport.is-marquee:hover .track-title-track,
	.track-title-viewport.is-marquee:focus-within .track-title-track {
		animation-play-state: paused;
	}

	@keyframes track-title-scroll {
		0%,
		7% {
			transform: translate3d(0, 0, 0);
		}
		95%,
		100% {
			transform: translate3d(-50%, 0, 0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.track-title-viewport.is-marquee .track-title-track {
			animation: none;
		}
		.track-title-viewport.is-marquee {
			-webkit-mask-image: linear-gradient(
				to right,
				black 0,
				black calc(100% - 1.25rem),
				transparent 100%
			);
			mask-image: linear-gradient(
				to right,
				black 0,
				black calc(100% - 1.25rem),
				transparent 100%
			);
		}
	}

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

	/* On mobile the bottom navigation bar occupies the very bottom of the
	   viewport, so the player sits stacked directly above it. The nav
	   already clears the safe-area inset, so the player only needs its
	   own breathing room here. */
	@media (max-width: 1023px) {
		.audio-player-shell {
			bottom: var(--bottom-nav-height, 0px);
			padding-bottom: 0.75rem;
		}
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
		/* Light full-screen reading surface — near-white with a faint warm tint
		   so it matches the site without forcing a dark theme on the reader
		   (mirrors the live-transcript fullscreen). The z-index sits above the
		   site header (z-110) and navbar (z-120) so the full-screen view isn't
		   clipped by them. */
		.audio-player-shell.lyrics-open {
			top: 0;
			height: 100dvh;
			display: flex;
			flex-direction: column;
			overflow: hidden;
			padding-top: 0;
			background: #faf6f1;
			color: rgb(28 25 23);
			z-index: 130;
		}

		.audio-player-shell.lyrics-open::before {
			content: '';
			position: absolute;
			inset: -2rem;
			z-index: -2;
			background-image:
				linear-gradient(180deg, rgba(255, 251, 245, 0.88), rgba(250, 248, 243, 0.97)),
				var(--lyrics-artwork);
			background-position: center;
			background-size: cover;
			filter: blur(36px) saturate(1.05);
			opacity: 0.55;
			transform: scale(1.08);
		}

		.audio-player-shell.lyrics-open::after {
			content: '';
			position: absolute;
			inset: 0;
			z-index: -1;
			background:
				radial-gradient(circle at 50% 6%, rgba(255, 136, 12, 0.06), transparent 30%),
				linear-gradient(180deg, rgba(255, 255, 255, 0.12), rgba(250, 248, 243, 0.45) 62%);
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
			/* Hairline warm-grey rule */
			border: 1px solid rgba(120, 113, 108, 0.12);
			border-bottom: 0;
			border-radius: 2rem 2rem 0 0;
			/* Light surface, slightly translucent so the artwork atmosphere reads
			   through subtly without dominating */
			background: rgba(255, 251, 245, 0.86);
			box-shadow: 0 -22px 70px rgba(41, 37, 36, 0.12);
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
			color: #c2640c;
			letter-spacing: 0;
			text-transform: none;
			font-size: 0.95rem;
		}

		.audio-player-shell.lyrics-open .lyrics-drawer-header .text-stone-500 {
			color: rgba(120, 113, 108, 0.9);
		}

		.audio-player-shell.lyrics-open .lyrics-sheet-handle {
			width: 3.35rem;
			height: 0.24rem;
			margin-bottom: 1rem;
			background: rgba(120, 113, 108, 0.3);
		}

		.audio-player-shell.lyrics-open .lyrics-close-btn {
			border-color: rgba(214, 211, 209, 0.9);
			background: rgba(255, 255, 255, 0.74);
			color: rgb(87 83 78);
		}

		.audio-player-shell.lyrics-open .lyrics-close-btn:hover {
			border-color: rgba(255, 136, 12, 0.55);
			background: white;
			color: rgb(194 100 12);
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
		   actively reading lyrics. Heart + close X stay visible. Matched via
		   stable data attributes (aria-labels are translated and can't be
		   used as selectors). */
		.audio-player-shell.lyrics-open .player-main button[data-player-action='lyrics'],
		.audio-player-shell.lyrics-open .player-main button[data-player-action='options'] {
			display: none;
		}

		/* Player controls keep their default light-theme colours on the light
		   reading surface — no cream overrides needed. */
	}
</style>
