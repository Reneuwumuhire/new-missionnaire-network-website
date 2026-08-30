<script lang="ts">
	import { onMount } from 'svelte';
	import { lyrics, onAirLines, step, timedPositionMs } from '../lib/lyrics.svelte';
	import { findCueIndex } from '../lib/srt';
	import { t } from '../lib/i18n.svelte';
	import { broadcast } from '../lib/broadcast.svelte';
	import { liveSession } from '../lib/live-session.svelte';
	import { recording } from '../lib/recording.svelte';

	// Sits directly above the Program canvas and shows what is on air, the way a
	// lyrics app does it: the line being sung is large and lit, its neighbours
	// are smaller and dimmed, and the column slides rather than jumps. The
	// operator reads one thing — the bright line — and glances down to see the
	// same words in the picture going out.

	let now = $state(Date.now());
	onMount(() => {
		// 100 ms: fast enough that a line lands on the beat, cheap enough to
		// leave the compositor alone.
		const timer = setInterval(() => (now = Date.now()), 100);
		return () => clearInterval(timer);
	});

	const linesSource = $derived(
		lyrics.mode === 'timed' ? lyrics.cues.map((cue) => cue.text) : lyrics.lines
	);
	const index = $derived.by(() => {
		if (lyrics.mode === 'manual') return lyrics.index;
		const position = timedPositionMs(now);
		return position === null ? -1 : findCueIndex(lyrics.cues, position);
	});
	const live = $derived(onAirLines(now));
	const elapsed = (startedAt: number | null) =>
		startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0;
	const duration = (seconds: number) => new Date(seconds * 1000).toISOString().slice(11, 19);
	const programmeStartedAt = $derived(liveSession.activeStartedAt ?? broadcast.startedAt);
	const programmeLabel = $derived(
		liveSession.activeStartedAt ? 'LIVE' : broadcast.startedAt ? 'PREVIEW' : 'OFF AIR'
	);

	/** Two lines either side of the current one. Blank entries keep the current
	 *  line pinned to the middle instead of letting it slide about at the ends. */
	const window_ = $derived(
		[-2, -1, 0, 1, 2].map((offset) => ({
			offset,
			text: index + offset >= 0 ? (linesSource[index + offset] ?? '') : ''
		}))
	);

	const ROW = 22; // px per neighbouring line
	const styleFor = (offset: number) =>
		offset === 0
			? 'text-[19px] font-semibold leading-tight text-fg'
			: Math.abs(offset) === 1
				? 'text-[13px] leading-tight text-fg/35'
				: 'text-[12px] leading-tight text-fg/15';
</script>

<div
	class="flex h-[104px] shrink-0 items-center gap-3 overflow-hidden border-b border-ink-700 bg-ink-900 px-4"
>
	<div class="flex w-16 shrink-0 flex-col gap-1">
		<span class="text-[9px] font-semibold uppercase tracking-[0.18em] text-fg/35">
			{t('dock.lyrics')}
		</span>
		<button
			class="w-fit px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider transition-colors {lyrics.onAir
				? 'bg-emerald-500/20 text-emerald-400'
				: 'bg-red-500/20 text-red-400'}"
			title={t('lyrics.toggleHint')}
			onclick={() => (lyrics.onAir = !lyrics.onAir)}
		>
			{lyrics.onAir ? t('lyrics.shown') : t('lyrics.hidden')}
		</button>
	</div>

	<!-- The scroller. Translating the whole column by one row per step is what
	     makes it glide; a keyed {#each} would re-mount the rows and jump. -->
	<div class="relative min-w-0 flex-1 self-stretch">
		{#if linesSource.length === 0}
			<p class="flex h-full items-center text-[13px] text-fg/25">{t('lyrics.emptyList')}</p>
		{:else}
			<div class="absolute inset-0 flex flex-col items-start justify-center">
				{#each window_ as row (row.offset)}
					<p
						class="w-full truncate transition-all duration-300 ease-out {styleFor(row.offset)}"
						style="height: {row.offset === 0 ? 26 : ROW}px"
					>
						{row.text}
					</p>
				{/each}
			</div>
			<!-- Fade the edges so the neighbouring lines read as context, not as
			     competing text. -->
			<div
				class="pointer-events-none absolute inset-0"
				style="background: linear-gradient(to bottom, rgb(var(--ink-900)) 0%, transparent 22%, transparent 78%, rgb(var(--ink-900)) 100%)"
			></div>
		{/if}
	</div>

	{#if lyrics.mode === 'manual' && linesSource.length > 0}
		<div class="flex shrink-0 items-center gap-1">
			<button class="studio-chip" onclick={() => step(-1)} aria-label={t('lyrics.previous')}>←</button>
			<button class="studio-btn-primary h-8 px-3 text-[11px]" onclick={() => step(1)}>
				{t('lyrics.next')}
			</button>
		</div>
	{:else if lyrics.mode === 'timed' && lyrics.anchorEpochMs !== null}
		<span class="shrink-0 font-mono text-[11px] text-fg/30">
			{index + 1}/{linesSource.length}
		</span>
	{/if}

	{#if !live.current && lyrics.onAir && linesSource.length > 0}
		<span class="shrink-0 text-[10px] text-fg/25">—</span>
	{/if}

	<div class="ml-2 flex h-[76px] w-[420px] shrink-0 overflow-hidden border border-ink-600 bg-ink-950/70">
		<div class="flex min-w-0 flex-1 flex-col justify-center border-r border-ink-600 px-5">
			<span class="flex items-center gap-2 text-[9px] font-semibold tracking-[0.18em] {liveSession.activeStartedAt
				? 'text-red-400'
				: broadcast.startedAt
					? 'text-amber-300'
					: 'text-fg/30'}">
				<span class="h-1.5 w-1.5 rounded-full {liveSession.activeStartedAt
					? 'animate-pulse bg-red-500'
					: broadcast.startedAt
						? 'bg-amber-400'
						: 'bg-fg/20'}"></span>
				{programmeLabel}
			</span>
			<span class="font-mono text-[28px] leading-none tracking-tight text-fg">
				{duration(elapsed(programmeStartedAt))}
			</span>
		</div>
		<div class="grid w-[190px] grid-cols-2 divide-x divide-ink-600">
			<div class="flex flex-col items-center justify-center">
				<span class="text-[9px] font-semibold tracking-[0.16em] text-fg/30">LOCAL</span>
				<span class="font-mono text-[14px] text-fg/75">
					{new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
				</span>
			</div>
			<div class="flex flex-col items-center justify-center bg-red-500/[0.03]">
				<span class="flex items-center gap-1.5 text-[9px] font-semibold tracking-[0.16em] {recording.startedAt ? 'text-red-400' : 'text-fg/30'}">
					{#if recording.startedAt}<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500"></span>{/if}
					REC
				</span>
				<span class="font-mono text-[14px] {recording.startedAt ? 'text-red-300' : 'text-fg/30'}">
					{recording.startedAt ? duration(elapsed(recording.startedAt)) : '--:--:--'}
				</span>
			</div>
		</div>
	</div>
</div>
