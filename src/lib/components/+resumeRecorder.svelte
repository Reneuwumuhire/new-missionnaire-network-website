<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import { get } from 'svelte/store';
	import {
		activeAudioElement,
		clearPlayerSnapshot,
		clearResumeState,
		END_THRESHOLD_SECONDS,
		ensureAudioMonitorInstalled,
		MIN_RESUME_SECONDS,
		pendingPlaybackSeek,
		readPlayerSnapshot,
		writePlayerSnapshot,
		writeResumeState,
		type PlayerSnapshot
	} from '$lib/utils/audioResume';
	import {
		autoNext,
		basePlaylist,
		currentIndex,
		isShuffle,
		playbackIntent,
		playlist,
		selectAudio
	} from '$lib/stores/global';
	import { getPlayableAudioUrl, type PlayableAudio } from '../../utils/audioPlayback';

	const SAVE_INTERVAL_MS = 5000;

	let currentAudio: HTMLAudioElement | null = null;
	let attachedAudio: HTMLAudioElement | null = null;
	let trackedUrl: string | null = null;
	let trackedSermon: Record<string, unknown> | null = null;
	let isPredication = false;
	let lastSavedAt = 0;
	let lastSnapshotAt = 0;

	// Cold-load rehydration state. When we restore the player from a saved
	// snapshot, the audio element doesn't exist yet — we set it up via the
	// stores, then seek to `rehydrationSeekTime` once the new <audio>'s
	// metadata loads. Without waiting for `loadedmetadata`, currentTime
	// assignments silently clamp to 0.
	let pendingRehydrationSeek = false;
	let rehydrationSeekTime = 0;

	ensureAudioMonitorInstalled();

	// `date_code` is unique to the Sermon model — MusicAudio / AudioAsset / live
	// streams don't carry it, so this is the cheapest reliable signal that the
	// active audio is a predication and worth recording resume state for.
	function looksLikePredication(item: unknown): boolean {
		if (!item || typeof item !== 'object') return false;
		const dc = (item as { date_code?: unknown }).date_code;
		return typeof dc === 'string' && dc.length > 0;
	}

	function saveProgress(force: boolean) {
		if (!browser || !isPredication || !trackedUrl || !trackedSermon) return;
		const el = currentAudio;
		if (!el) return;

		const time = el.currentTime;
		const duration = Number.isFinite(el.duration) ? el.duration : 0;

		if (duration > 0 && duration - time < END_THRESHOLD_SECONDS) {
			clearResumeState();
			return;
		}
		if (time < MIN_RESUME_SECONDS) return;

		const now = Date.now();
		if (!force && now - lastSavedAt < SAVE_INTERVAL_MS) return;
		lastSavedAt = now;

		writeResumeState({
			audioUrl: trackedUrl,
			time,
			duration,
			savedAt: now,
			sermon: trackedSermon
		});
	}

	function snapshotPlayer(force: boolean) {
		if (!browser) return;
		const sel = get(selectAudio);
		// Don't save when the player is empty — covers the explicit close (X
		// button) and pre-rehydration boot. The existing snapshot, if any, is
		// left alone; on cold load the `intendsToPlay` gate decides whether to
		// surface it.
		if (!sel) return;
		// No live audio element yet — rehydration just primed the stores but
		// the AudioPlayer hasn't created the <audio> element. Saving now would
		// clobber the previous snapshot's currentTime with 0 (and intendsToPlay
		// with the still-default false), which would break the next reload.
		const el = currentAudio;
		if (!el) return;

		const now = Date.now();
		if (!force && now - lastSnapshotAt < SAVE_INTERVAL_MS) return;
		lastSnapshotAt = now;

		const time = el.currentTime;
		const duration = Number.isFinite(el.duration) ? el.duration : 0;

		// Treat near-end as "done" — clearing avoids resurrecting a track at
		// 99% which would auto-advance to the next-or-stop the moment the
		// user taps play.
		if (duration > 0 && duration - time < END_THRESHOLD_SECONDS) {
			clearPlayerSnapshot();
			return;
		}

		try {
			const snapshot: PlayerSnapshot = {
				selectAudio: JSON.parse(JSON.stringify(sel)) as Record<string, unknown>,
				playlist: JSON.parse(JSON.stringify(get(playlist))) as Record<string, unknown>[],
				basePlaylist: JSON.parse(JSON.stringify(get(basePlaylist))) as Record<string, unknown>[],
				currentIndex: get(currentIndex),
				currentTime: time,
				duration,
				// Read the user's *intent*, not the live `isPlaying` flag — the
				// latter flips to false on every OS interruption (phone call,
				// Siri) which would otherwise convince us the user had paused.
				intendsToPlay: get(playbackIntent),
				autoNext: get(autoNext),
				isShuffle: get(isShuffle),
				savedAt: now
			};
			writePlayerSnapshot(snapshot);
		} catch {
			// Serialization failed (circular refs, exotic types) — skip.
		}
	}

	function handleTimeUpdate() {
		const el = currentAudio;
		if (!el || el.paused) return;
		saveProgress(false);
		snapshotPlayer(false);
	}

	function handlePause() {
		// Flush immediately so a fast tab close after pause keeps the position
		// even if the next 5-second tick never fires.
		saveProgress(true);
		snapshotPlayer(true);
	}

	function handleEnded() {
		clearResumeState();
		// Don't clear the player snapshot here — auto-advance immediately
		// loads the next track, and the next save cycle will overwrite the
		// snapshot with up-to-date state. If the playlist actually finished,
		// the surrounding `isPlaying` flips false and the next save will
		// capture `intendsToPlay: false`, gating off rehydration.
	}

	function applyRehydrationSeek() {
		if (!pendingRehydrationSeek) return;
		const el = currentAudio;
		if (!el) return;
		// User has already started playback (likely via the safePlay-driven
		// load+seek+play path). Don't yank them back to the saved position —
		// that landing has already happened, and overwriting currentTime now
		// would feel like a stutter.
		if (!el.paused) {
			pendingRehydrationSeek = false;
			return;
		}
		if (!Number.isFinite(el.duration) || el.duration <= 0) return;
		try {
			el.currentTime = rehydrationSeekTime;
		} catch {
			// out-of-range seeks throw on some browsers — ignore
		}
		pendingRehydrationSeek = false;
	}

	function handleLoadedMetadata() {
		applyRehydrationSeek();
	}

	function attachListeners(el: HTMLAudioElement | null) {
		if (attachedAudio === el) return;
		if (attachedAudio) {
			attachedAudio.removeEventListener('timeupdate', handleTimeUpdate);
			attachedAudio.removeEventListener('pause', handlePause);
			attachedAudio.removeEventListener('ended', handleEnded);
			attachedAudio.removeEventListener('loadedmetadata', handleLoadedMetadata);
		}
		attachedAudio = el;
		if (el) {
			el.addEventListener('timeupdate', handleTimeUpdate);
			el.addEventListener('pause', handlePause);
			el.addEventListener('ended', handleEnded);
			el.addEventListener('loadedmetadata', handleLoadedMetadata);
			// If metadata is already loaded by the time we attach (e.g. the
			// element was reused from a cached track), seek now rather than
			// waiting for an event that won't fire again.
			if (pendingRehydrationSeek && Number.isFinite(el.duration) && el.duration > 0) {
				applyRehydrationSeek();
			}
		}
	}

	const audioUnsub = activeAudioElement.subscribe((el) => {
		currentAudio = el;
		attachListeners(el);
	});

	const selectAudioUnsub = selectAudio.subscribe((value) => {
		isPredication = looksLikePredication(value);
		trackedUrl = isPredication ? getPlayableAudioUrl(value) || null : null;
		// Snapshot the sermon so the toast can re-prime $selectAudio after a
		// full reload. JSON round-trip strips any non-serializable bits and
		// detaches us from later in-place mutations of the live object.
		trackedSermon = isPredication && value
			? (JSON.parse(JSON.stringify(value)) as Record<string, unknown>)
			: null;
		// Reset the save throttle so the first save after a track switch
		// happens promptly rather than waiting out the previous track's tick.
		lastSavedAt = 0;
		lastSnapshotAt = 0;
		// Capture immediately on track change so a fast tab close right after
		// switching keeps the new track in the snapshot. Skip the empty case
		// — clearing on close is intentionally not done here so the X button
		// alone doesn't wipe state if the user changes their mind on reload.
		if (value) snapshotPlayer(true);
	});

	function handlePageHide() {
		saveProgress(true);
		snapshotPlayer(true);
	}

	function handleVisibilityChange() {
		if (document.visibilityState === 'hidden') {
			saveProgress(true);
			snapshotPlayer(true);
		}
	}

	function maybeRehydrateOnMount() {
		if (!browser) return;
		// Don't clobber state that's already loaded (e.g., the user clicked a
		// track between layout mount and our mount, or another component
		// pre-primed the player).
		if (get(selectAudio)) return;

		const snap = readPlayerSnapshot();
		if (!snap) return;

		// Only restore the player if the user was actively listening when the
		// snapshot was saved. If they had paused or closed it, leave the page
		// clean — they've signaled they're done.
		if (!snap.intendsToPlay) return;

		// Already at the end of the saved track — nothing meaningful to resume.
		if (
			snap.duration > 0 &&
			snap.duration - snap.currentTime < END_THRESHOLD_SECONDS
		) {
			clearPlayerSnapshot();
			return;
		}

		// Two seek paths cooperate:
		//
		// 1. `pendingRehydrationSeek` (in-memory, applied on loadedmetadata)
		//    keeps the progress-bar UI showing the saved position even before
		//    the user taps play. It's a UX nicety, not a correctness signal.
		// 2. `pendingPlaybackSeek` (global store, consumed by safePlay) makes
		//    the first user-tap-play actually land at the saved position. iOS
		//    silently clamps `currentTime` to 0 when metadata isn't fully
		//    loaded; the safePlay path issues `audio.load()` and seeks inside
		//    the resulting `canplay` handler, where the seek is reliable.
		//
		// Without (2), the loadedmetadata seek can race against the play
		// command and the user hears the track restart from 0.
		rehydrationSeekTime = Math.max(0, snap.currentTime);
		pendingRehydrationSeek = rehydrationSeekTime > 0;

		const seekUrl = getPlayableAudioUrl(snap.selectAudio as PlayableAudio) || '';
		if (rehydrationSeekTime > 0 && seekUrl) {
			pendingPlaybackSeek.set({ url: seekUrl, time: rehydrationSeekTime });
		}

		const list = Array.isArray(snap.playlist) ? snap.playlist : [];
		const baseList = Array.isArray(snap.basePlaylist) && snap.basePlaylist.length > 0
			? snap.basePlaylist
			: list;

		basePlaylist.set(baseList as PlayableAudio[]);
		playlist.set(list as PlayableAudio[]);
		currentIndex.set(typeof snap.currentIndex === 'number' ? snap.currentIndex : 0);
		autoNext.set(snap.autoNext !== false);
		isShuffle.set(!!snap.isShuffle);
		// Setting selectAudio LAST mounts the AudioPlayer and triggers the
		// audio-element creation. We deliberately do NOT set isPlaying or
		// playbackIntent — iOS blocks autoplay without a user gesture, and
		// surprise-playback after a phone call is bad UX. The user sees the
		// player ready at the saved time and taps play.
		selectAudio.set(snap.selectAudio as PlayableAudio);
	}

	onMount(() => {
		window.addEventListener('pagehide', handlePageHide);
		window.addEventListener('beforeunload', handlePageHide);
		document.addEventListener('visibilitychange', handleVisibilityChange);
		maybeRehydrateOnMount();
	});

	onDestroy(() => {
		if (browser) {
			saveProgress(true);
			snapshotPlayer(true);
			window.removeEventListener('pagehide', handlePageHide);
			window.removeEventListener('beforeunload', handlePageHide);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		}
		attachListeners(null);
		audioUnsub();
		selectAudioUnsub();
	});
</script>
