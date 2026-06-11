<script lang="ts">
	import { run } from 'svelte/legacy';

	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import { livePlayback, replayPlayback } from '$lib/stores/global';
	import { parseSrt, type SrtCue } from '$lib/utils/srt';
	import { dispatchAudioPlayerSeek } from '$lib/utils/audioPlayerControls';
	import SyncedLyrics from './SyncedLyrics.svelte';

	// Synced sermon transcript, two modes sharing the same renderer:
	//
	// live   — self-polls /api/live/radio-state for the SRT + sync anchor set
	//          by the admin ("Démarrer les sous-titres"), then computes the
	//          listener's SRT position locally from the player's
	//          positionEpochMs (wall-clock moment of the audio currently
	//          being heard):
	//            srtMs = (positionEpochMs + clockSkew − anchor) + offset
	//          Pause freezes the position, DVR rewind shifts it back, and a
	//          buffer-expiry reconnect after a long pause snaps it back to
	//          live together with the audio — text and sound never diverge.
	// replay — props carry the SRT url + the offset between the recording's
	//          start and SRT 00:00 (computed server-side); position follows
	

	
	
	
	interface Props {
		//          the global audio player via the replayPlayback store.
		mode?: 'live' | 'replay';
		/** Replay mode only — proxy URL of the SRT file. */
		url?: string | null;
		/** Replay mode only — ms into the recording at which SRT 00:00 occurs. */
		offsetIntoRecordingMs?: number;
		/** Replay mode only — recording id; the transcript only follows the global
	 *  player while this track is the one playing. */
		trackId?: string | null;
	}

	let {
		mode = 'live',
		url = null,
		offsetIntoRecordingMs = 0,
		trackId = null
	}: Props = $props();

	const LIVE_POLL_MS = 8_000; // bounds how fast admin nudges reach listeners
	const TICK_MS = 400;

	let cues: SrtCue[] = $state([]);
	let loadedUrl: string | null = $state(null);
	let srtSec: number | null = $state(null); // null → no highlight yet

	// ── Live state (from radio-state polls) ────────────────────────
	let liveUrl: string | null = $state(null);
	let anchorEpochMs: number | null = $state(null);
	let offsetMs = 0;
	let clockSkewMs = 0;
	let liveActive = $state(false); // gate open + SRT attached

	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let tickTimer: ReturnType<typeof setInterval> | null = null;

	// ── Fullscreen reading view ─────────────────────────────────
	// Big dark overlay for comfortable reading (or projecting the text in a
	// hall while the live audio plays). Esc or the ✕ button closes it.
	let isFullscreen = $state(false);

	/** Re-parent the overlay to <body>: the transcript sits inside cards with
	 *  backdrop-blur/transform, which create stacking contexts that would trap
	 *  the overlay's z-index below the site's fixed header/bottom nav. */
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	function openFullscreen() {
		isFullscreen = true;
	}

	function closeFullscreen() {
		isFullscreen = false;
	}

	function handleFullscreenKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && isFullscreen) closeFullscreen();
	}

	// Swipe down on the header bar closes the overlay — the natural mobile
	// gesture for dismissing a sheet. Only the header arms it, so scrolling
	// the text itself never closes by accident.
	let swipeStartY: number | null = null;

	function onHeaderTouchStart(e: TouchEvent) {
		swipeStartY = e.touches[0]?.clientY ?? null;
	}

	function onHeaderTouchMove(e: TouchEvent) {
		if (swipeStartY === null) return;
		const y = e.touches[0]?.clientY ?? swipeStartY;
		if (y - swipeStartY > 70) {
			swipeStartY = null;
			closeFullscreen();
		}
	}

	function onHeaderTouchEnd() {
		swipeStartY = null;
	}




	async function loadSrt(target: string) {
		try {
			const res = await fetch(target);
			if (!res.ok) return;
			const parsed = parseSrt(await res.text());
			// The URL may have changed again while we were fetching.
			if (loadedUrl === target) cues = parsed;
		} catch {
			// Network error — keep whatever we had; next poll retries via URL change.
		}
	}

	type RadioSubtitles = {
		url: string;
		anchorEpochMs: number | null;
		offsetMs: number;
	} | null;

	async function pollLiveState() {
		if (document.hidden) return;
		try {
			const res = await fetch('/api/live/radio-state');
			if (!res.ok) return;
			const data = (await res.json()) as {
				isLive: boolean;
				subtitles?: RadioSubtitles;
				serverNowMs?: number;
			};
			if (typeof data.serverNowMs === 'number') {
				clockSkewMs = data.serverNowMs - Date.now();
			}
			const subs = data.subtitles ?? null;
			liveActive = Boolean(data.isLive && subs);
			if (subs) {
				liveUrl = subs.url;
				anchorEpochMs = subs.anchorEpochMs;
				offsetMs = subs.offsetMs ?? 0;
			} else {
				// Broadcast ended or subtitles cleared — freeze the transcript as-is
				// (the watch page redirects to the replay shortly after).
				anchorEpochMs = null;
			}
		} catch {
			// Keep current state on network errors.
		}
	}

	function tick() {
		if (mode === 'live') {
			if (anchorEpochMs === null) {
				srtSec = null;
				return;
			}
			const { positionEpochMs } = $livePlayback;
			if (positionEpochMs === null) {
				// No stream connected yet — nothing is being heard, no highlight.
				srtSec = null;
				return;
			}
			// positionEpochMs is frozen while paused and shifts with DVR
			// scrubbing, so the text always tracks the audio actually heard.
			srtSec = (positionEpochMs + clockSkewMs - anchorEpochMs + offsetMs) / 1000;
		} else {
			const { trackId: playingId, timeSec } = $replayPlayback;
			if (!trackId || playingId !== trackId) {
				// Not this recording (or nothing played yet) — show the text
				// unhighlighted from the top.
				srtSec = null;
				return;
			}
			srtSec = (timeSec * 1000 - offsetIntoRecordingMs) / 1000;
		}
	}

	onMount(() => {
		if (!browser) return;
		tickTimer = setInterval(tick, TICK_MS);
		if (mode === 'live') {
			void pollLiveState();
			pollTimer = setInterval(() => void pollLiveState(), LIVE_POLL_MS);
		}
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
		if (tickTimer) clearInterval(tickTimer);
		if (browser) document.body.style.overflow = '';
	});

	function handleSeek(event: CustomEvent<{ time: number }>) {
		// Tapping a cue: meaningless on a live stream (can't seek the source),
		// but on the replay it jumps the global player to that sentence.
		if (mode !== 'replay') return;
		dispatchAudioPlayerSeek(event.detail.time + offsetIntoRecordingMs / 1000);
	}


	// Lock body scroll while the overlay is open.
	run(() => {
		if (browser) {
			document.body.style.overflow = isFullscreen ? 'hidden' : '';
		}
	});
	let srtUrl = $derived(mode === 'live' ? liveUrl : url);
	// (Re)load whenever the effective URL changes — covers the admin replacing
	// the SRT mid-broadcast (new S3 key → new URL in the next poll).
	run(() => {
		if (browser && srtUrl && srtUrl !== loadedUrl) {
			loadedUrl = srtUrl;
			void loadSrt(srtUrl);
		}
	});
	// SyncedLyrics highlights the line whose start ≤ currentTime; -1 keeps
	// everything unhighlighted until a position is known.
	let displayTime = $derived(srtSec ?? -1);
	let lines = $derived(cues.map((cue) => ({
		text: cue.text,
		start: cue.startMs / 1000,
		end: cue.endMs / 1000
	})));
	let visible = $derived(mode === 'live' ? liveActive && cues.length > 0 : cues.length > 0);
	let waitingForSync = $derived(mode === 'live' && liveActive && cues.length > 0 && anchorEpochMs === null);
</script>

<svelte:window onkeydown={handleFullscreenKeydown} />

{#if visible}
	<div class="border border-stone-200/60 bg-white/40 p-5 md:p-6">
		<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
			<p class="text-[10px] font-bold uppercase tracking-[0.25em] text-missionnaire/80 font-body">
				Transcription
			</p>
			<div class="flex items-center gap-3">
				{#if waitingForSync}
					<span class="inline-flex items-center gap-1.5 text-[10px] font-semibold text-stone-400 font-body">
						<span class="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-stone-300"></span>
						En attente de la synchronisation…
					</span>
				{/if}
				<button
					type="button"
					onclick={openFullscreen}
					aria-label="Afficher la transcription en plein écran"
					title="Plein écran"
					class="inline-flex items-center gap-1.5 border border-stone-200/60 bg-white/60 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] font-body text-stone-500 transition-colors hover:border-missionnaire hover:text-missionnaire"
				>
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
					>
						<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
					</svg>
					<span class="hidden sm:inline">Plein écran</span>
				</button>
			</div>
		</div>
		{#if !isFullscreen}
			<SyncedLyrics {lines} currentTime={displayTime} pauseOnUserScroll on:seek={handleSeek} />
		{:else}
			<p class="py-8 text-center text-xs text-stone-400 font-body">
				Transcription affichée en plein écran
			</p>
		{/if}
		{#if mode === 'live'}
			<p class="mt-2 text-[10px] text-stone-400 font-body">
				Le texte suit l'audio que vous entendez — il recule avec vous si vous revenez en arrière.
			</p>
		{/if}
	</div>
{/if}

{#if isFullscreen}
	<!-- Fullscreen reading view: warm espresso backdrop, large serif text.
	     The single SyncedLyrics instance moves here so auto-follow state and
	     position carry over seamlessly. -->
	<div
		use:portal
		class="transcript-fullscreen fixed inset-0 z-[9990] flex flex-col"
		role="dialog"
		aria-modal="true"
		aria-label="Transcription en plein écran"
	>
		<div
			class="transcript-fullscreen-header flex items-center justify-between gap-3 px-4 py-3 md:px-8"
			role="presentation"
			ontouchstart={onHeaderTouchStart}
			ontouchmove={onHeaderTouchMove}
			ontouchend={onHeaderTouchEnd}
		>
			<div class="flex items-center gap-2.5 min-w-0">
				{#if mode === 'live'}
					<span class="relative inline-flex h-2 w-2 shrink-0">
						<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"></span>
						<span class="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
					</span>
				{/if}
				<span class="truncate text-[11px] font-bold uppercase tracking-[0.25em] font-body text-[#efe5d0]/80">
					Transcription {mode === 'live' ? '· En direct' : ''}
				</span>
			</div>
			<button
				type="button"
				onclick={closeFullscreen}
				aria-label="Quitter le plein écran"
				class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-[#efe5d0] transition-colors hover:bg-white/20 active:bg-white/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
			>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M6 6l12 12M6 18L18 6" />
				</svg>
			</button>
		</div>
		<SyncedLyrics
			{lines}
			currentTime={displayTime}
			pauseOnUserScroll
			fullscreenDark
			on:seek={handleSeek}
		/>
		<!-- Thumb-zone close bar: always visible at the bottom so closing never
		     requires reaching the top corner (the main complaint on mobile). -->
		<div class="transcript-fullscreen-footer pointer-events-none flex justify-center px-4">
			<button
				type="button"
				onclick={closeFullscreen}
				class="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-[#efe5d0]/25 bg-[#29201a]/90 px-6 py-2.5 text-[12px] font-bold uppercase tracking-[0.18em] font-body text-[#efe5d0] shadow-lg backdrop-blur transition-colors hover:bg-[#3a2d23] active:bg-[#3a2d23]"
			>
				<svg
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M6 6l12 12M6 18L18 6" />
				</svg>
				Fermer
			</button>
		</div>
	</div>
{/if}

<style>
	/* Warm espresso gradient — same family as the music drawer's dark theme,
	   chosen over flat black so the cream text keeps the site's character. */
	.transcript-fullscreen {
		background:
			radial-gradient(circle at 50% -10%, rgba(255, 136, 12, 0.08), transparent 55%),
			linear-gradient(180deg, #221a14 0%, #1a140f 100%);
	}

	/* Keep the header clear of notches/status bars on phones. */
	.transcript-fullscreen-header {
		padding-top: calc(0.75rem + env(safe-area-inset-top, 0px));
	}

	/* Floating over the text (not a layout row) so the transcript keeps the
	   full height; safe-area keeps it above iOS home-indicator. */
	.transcript-fullscreen-footer {
		position: absolute;
		left: 0;
		right: 0;
		bottom: calc(0.9rem + env(safe-area-inset-bottom, 0px));
	}
</style>
