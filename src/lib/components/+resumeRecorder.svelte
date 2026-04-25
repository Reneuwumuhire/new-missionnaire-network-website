<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import {
		activeAudioElement,
		clearResumeState,
		END_THRESHOLD_SECONDS,
		ensureAudioMonitorInstalled,
		MIN_RESUME_SECONDS,
		writeResumeState
	} from '$lib/utils/audioResume';
	import { selectAudio } from '$lib/stores/global';
	import { getPlayableAudioUrl } from '../../utils/audioPlayback';

	const SAVE_INTERVAL_MS = 5000;

	let currentAudio: HTMLAudioElement | null = null;
	let attachedAudio: HTMLAudioElement | null = null;
	let trackedUrl: string | null = null;
	let trackedSermon: Record<string, unknown> | null = null;
	let isPredication = false;
	let lastSavedAt = 0;

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

	function handleTimeUpdate() {
		const el = currentAudio;
		if (!el || el.paused) return;
		saveProgress(false);
	}

	function handlePause() {
		// Flush immediately so a fast tab close after pause keeps the position
		// even if the next 5-second tick never fires.
		saveProgress(true);
	}

	function handleEnded() {
		clearResumeState();
	}

	function attachListeners(el: HTMLAudioElement | null) {
		if (attachedAudio === el) return;
		if (attachedAudio) {
			attachedAudio.removeEventListener('timeupdate', handleTimeUpdate);
			attachedAudio.removeEventListener('pause', handlePause);
			attachedAudio.removeEventListener('ended', handleEnded);
		}
		attachedAudio = el;
		if (el) {
			el.addEventListener('timeupdate', handleTimeUpdate);
			el.addEventListener('pause', handlePause);
			el.addEventListener('ended', handleEnded);
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
	});

	function handlePageHide() {
		saveProgress(true);
	}

	function handleVisibilityChange() {
		if (document.visibilityState === 'hidden') {
			saveProgress(true);
		}
	}

	onMount(() => {
		window.addEventListener('pagehide', handlePageHide);
		window.addEventListener('beforeunload', handlePageHide);
		document.addEventListener('visibilitychange', handleVisibilityChange);
	});

	onDestroy(() => {
		if (browser) {
			saveProgress(true);
			window.removeEventListener('pagehide', handlePageHide);
			window.removeEventListener('beforeunload', handlePageHide);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		}
		attachListeners(null);
		audioUnsub();
		selectAudioUnsub();
	});
</script>
