<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import { livePlayback, replayPlayback } from '$lib/stores/global';
	import { parseSrt, type SrtCue } from '$lib/utils/srt';
	import { dispatchAudioPlayerSeek } from '$lib/utils/audioPlayerControls';
	import {
		subtitlePrefs,
		type SubtitleTheme,
		type SubtitleSize
	} from '$lib/stores/subtitlePrefs';
	import { t, type TranslationKey } from '../../i18n';
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

	// ── Reader appearance (theme + text size) ──────────────────
	// Persisted per-listener; lets people pick a palette that's easy on their
	// eyes and a comfortable text size for long reads.
	let settingsOpen = $state(false);
	const THEME_OPTIONS: { key: SubtitleTheme; swatch: string; ink: string; titleKey: TranslationKey }[] = [
		{ key: 'cream', swatch: '#fbf8f3', ink: '#2a2521', titleKey: 'liveTranscript.theme.cream' },
		{ key: 'sepia', swatch: '#f4ecd9', ink: '#43361f', titleKey: 'liveTranscript.theme.sepia' },
		{ key: 'dark', swatch: '#1c1a17', ink: '#f2ece3', titleKey: 'liveTranscript.theme.dark' },
		{ key: 'contrast', swatch: '#ffffff', ink: '#111111', titleKey: 'liveTranscript.theme.contrast' }
	];
	const SIZE_OPTIONS: { key: SubtitleSize; label: string; titleKey: TranslationKey }[] = [
		{ key: 'sm', label: 'A', titleKey: 'liveTranscript.size.sm' },
		{ key: 'md', label: 'A', titleKey: 'liveTranscript.size.md' },
		{ key: 'lg', label: 'A', titleKey: 'liveTranscript.size.lg' },
		{ key: 'xl', label: 'A', titleKey: 'liveTranscript.size.xl' }
	];

	function onWindowPointerDown(e: PointerEvent) {
		if (!settingsOpen) return;
		const target = e.target as HTMLElement | null;
		if (target && !target.closest('[data-subtitle-settings]')) settingsOpen = false;
	}

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
		subtitlePrefs.init();
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

	function handleSeek(detail: { time: number }) {
		// Tapping a cue: meaningless on a live stream (can't seek the source),
		// but on the replay it jumps the global player to that sentence.
		if (mode !== 'replay') return;
		dispatchAudioPlayerSeek(detail.time + offsetIntoRecordingMs / 1000);
	}


	// Lock body scroll while the overlay is open.
	$effect(() => {
		if (browser) {
			document.body.style.overflow = isFullscreen ? 'hidden' : '';
		}
	});
	let srtUrl = $derived(mode === 'live' ? liveUrl : url);
	// (Re)load whenever the effective URL changes — covers the admin replacing
	// the SRT mid-broadcast (new S3 key → new URL in the next poll).
	$effect(() => {
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

<svelte:window onkeydown={handleFullscreenKeydown} onpointerdown={onWindowPointerDown} />

{#snippet appearanceControl(onDark: boolean)}
	<div class="relative" data-subtitle-settings>
		<button
			type="button"
			onclick={() => (settingsOpen = !settingsOpen)}
			aria-label={$t('liveTranscript.appearance')}
			title={$t('liveTranscript.appearance')}
			aria-expanded={settingsOpen}
			class="inline-flex items-center gap-1.5 border px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] font-body transition-colors {onDark
				? 'border-white/20 bg-white/10 text-stone-200 hover:border-white/50 hover:text-white'
				: 'border-stone-200/60 bg-white/60 text-stone-500 hover:border-missionnaire hover:text-missionnaire'}"
		>
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<circle cx="12" cy="12" r="3" />
				<path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
			</svg>
			<span>{$t('liveTranscript.appearance')}</span>
		</button>
		{#if settingsOpen}
			<div
				class="absolute right-0 z-30 mt-2 w-60 border border-stone-200 bg-white p-3.5 shadow-2xl"
				role="dialog"
				aria-label={$t('liveTranscript.appearance')}
			>
				<p class="mb-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400 font-body">
					{$t('liveTranscript.theme')}
				</p>
				<div class="grid grid-cols-4 gap-2">
					{#each THEME_OPTIONS as opt (opt.key)}
						<button
							type="button"
							onclick={() => subtitlePrefs.setTheme(opt.key)}
							aria-pressed={$subtitlePrefs.theme === opt.key}
							title={$t(opt.titleKey)}
							class="flex h-10 items-center justify-center rounded-md border font-display text-lg transition-all {$subtitlePrefs.theme === opt.key
								? 'border-missionnaire ring-2 ring-missionnaire/40'
								: 'border-stone-200 hover:border-stone-400'}"
							style="background:{opt.swatch};color:{opt.ink}"
						>
							A
						</button>
					{/each}
				</div>
				<p class="mb-1.5 mt-3.5 text-[9px] font-bold uppercase tracking-[0.2em] text-stone-400 font-body">
					{$t('liveTranscript.textSize')}
				</p>
				<div class="grid grid-cols-4 gap-2">
					{#each SIZE_OPTIONS as opt, i (opt.key)}
						<button
							type="button"
							onclick={() => subtitlePrefs.setSize(opt.key)}
							aria-pressed={$subtitlePrefs.size === opt.key}
							aria-label={$t(opt.titleKey)}
							class="flex h-10 items-center justify-center rounded-md border font-display leading-none transition-all {$subtitlePrefs.size === opt.key
								? 'border-missionnaire bg-missionnaire/10 text-missionnaire ring-2 ring-missionnaire/30'
								: 'border-stone-200 text-stone-600 hover:border-stone-400'}"
							style="font-size:{[13, 16, 19, 23][i]}px"
						>
							{opt.label}
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/snippet}

{#if visible}
	<div class="border border-stone-200/60 bg-white/40 p-5 md:p-6">
		<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
			<p class="text-[10px] font-bold uppercase tracking-[0.25em] text-missionnaire/80 font-body">
				{$t('liveTranscript.title')}
			</p>
			<div class="flex items-center gap-3">
				{#if waitingForSync}
					<span class="inline-flex items-center gap-1.5 text-[10px] font-semibold text-stone-400 font-body">
						<span class="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-stone-300"></span>
						{$t('liveTranscript.waitingSync')}
					</span>
				{/if}
				{@render appearanceControl(false)}
				<button
					type="button"
					onclick={openFullscreen}
					aria-label={$t('liveTranscript.fullscreenAria')}
					title={$t('liveTranscript.fullscreen')}
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
					<span class="hidden sm:inline">{$t('liveTranscript.fullscreen')}</span>
				</button>
			</div>
		</div>
		{#if !isFullscreen}
			<SyncedLyrics
				{lines}
				currentTime={displayTime}
				pauseOnUserScroll
				themeKey={$subtitlePrefs.theme}
				sizeKey={$subtitlePrefs.size}
				onseek={handleSeek}
			/>
		{:else}
			<p class="py-8 text-center text-xs text-stone-400 font-body">
				{$t('liveTranscript.shownFullscreen')}
			</p>
		{/if}
		{#if mode === 'live'}
			<p class="mt-2 text-[10px] text-stone-400 font-body">
				{$t('liveTranscript.followHint')}
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
		class:overlay-dark={$subtitlePrefs.theme === 'dark'}
		role="dialog"
		aria-modal="true"
		aria-label={$t('liveTranscript.fullscreenDialogAria')}
	>
		<div
			class="transcript-fullscreen-header flex items-center justify-between gap-3 border-b border-stone-200/70 px-4 py-3 md:px-8"
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
				<span class="transcript-fs-label truncate text-[11px] font-bold uppercase tracking-[0.25em] font-body text-stone-500">
					{$t('liveTranscript.title')}{mode === 'live' ? ` · ${$t('live.atLive')}` : ''}
				</span>
			</div>
			<div class="flex items-center gap-2">
				{@render appearanceControl($subtitlePrefs.theme === 'dark')}
			<button
				type="button"
				onclick={closeFullscreen}
				aria-label={$t('liveTranscript.exitFullscreen')}
				class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600 transition-colors hover:bg-stone-200 active:bg-stone-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
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
		</div>
		<SyncedLyrics
			{lines}
			currentTime={displayTime}
			pauseOnUserScroll
			fullscreenLarge
			themeKey={$subtitlePrefs.theme}
			sizeKey={$subtitlePrefs.size}
			onseek={handleSeek}
		/>
		<!-- Thumb-zone close bar: always visible at the bottom so closing never
		     requires reaching the top corner (the main complaint on mobile). -->
		<div class="transcript-fullscreen-footer pointer-events-none flex justify-center px-4">
			<button
				type="button"
				onclick={closeFullscreen}
				class="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-full border border-stone-200 bg-white/95 px-6 py-2.5 text-[12px] font-bold uppercase tracking-[0.18em] font-body text-stone-700 shadow-lg backdrop-blur transition-colors hover:bg-stone-50 active:bg-stone-100"
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
				{$t('misc.close')}
			</button>
		</div>
	</div>
{/if}

<style>
	/* Light reading surface — near-white with a faint warm tint so it matches
	   the site without forcing a dark theme on the reader. Dark text from the
	   default lyric palette stays comfortably legible. */
	.transcript-fullscreen {
		background:
			radial-gradient(circle at 50% -10%, rgba(255, 136, 12, 0.05), transparent 55%),
			linear-gradient(180deg, #ffffff 0%, #faf6f1 100%);
	}

	/* Soft-dark reading surface for the dark theme — restful in low light. */
	.transcript-fullscreen.overlay-dark {
		background:
			radial-gradient(circle at 50% -10%, rgba(255, 176, 80, 0.06), transparent 55%),
			linear-gradient(180deg, #16140f 0%, #201c16 100%);
	}
	.transcript-fullscreen.overlay-dark .transcript-fullscreen-header {
		border-bottom-color: rgba(255, 255, 255, 0.08);
	}
	.transcript-fullscreen.overlay-dark .transcript-fs-label {
		color: #b8afa4;
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
