<script lang="ts">
	import { onMount } from 'svelte';
	import {
		anchorAt,
		clearSync,
		exportManualSrt,
		goTo,
		loadLines,
		loadSrt,
		lyrics,
		nudge,
		onAirLines,
		timedPositionMs
	} from '../lib/lyrics.svelte';
	import { findCueIndex } from '../lib/srt';
	import { t } from '../lib/i18n.svelte';

	let fileInput = $state<HTMLInputElement | null>(null);
	let pasteOpen = $state(false);
	let pasteText = $state('');
	let notice = $state<string | null>(null);
	let now = $state(Date.now());
	let listEl = $state<HTMLDivElement | null>(null);

	onMount(() => {
		const timer = setInterval(() => (now = Date.now()), 200);
		return () => clearInterval(timer);
	});

	const live = $derived(onAirLines(now));
	const positionMs = $derived(timedPositionMs(now));
	const activeIndex = $derived(
		lyrics.mode === 'timed'
			? positionMs === null
				? -1
				: findCueIndex(lyrics.cues, positionMs)
			: lyrics.index
	);

	// Keep the line being sung in view without stealing focus from the operator.
	$effect(() => {
		const index = activeIndex;
		if (index < 0 || !listEl) return;
		listEl.querySelector<HTMLElement>(`[data-index="${index}"]`)?.scrollIntoView({
			block: 'nearest',
			behavior: 'smooth'
		});
	});

	async function onFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const text = await file.text();
		if (file.name.toLowerCase().endsWith('.srt')) {
			const count = loadSrt(text, file.name);
			notice = count ? t('lyrics.loadedCues', { count }) : t('lyrics.unreadableSrt');
		} else {
			const count = loadLines(text, file.name);
			notice = count ? t('lyrics.loadedLines', { count }) : t('lyrics.emptyFile');
		}
	}

	function applyPaste() {
		const count = loadLines(pasteText, t('lyrics.pastedName'));
		notice = count ? t('lyrics.loadedLines', { count }) : t('lyrics.nothingToLoad');
		pasteOpen = false;
		pasteText = '';
	}

	function downloadSrt() {
		const srt = exportManualSrt();
		if (!srt.trim()) {
			notice = t('lyrics.noTimings');
			return;
		}
		const url = URL.createObjectURL(new Blob([srt], { type: 'text/plain;charset=utf-8' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = `${(lyrics.fileName || 'lyrics').replace(/\.[^.]+$/, '')}.srt`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function fmt(ms: number): string {
		const total = Math.max(0, Math.floor(ms / 1000));
		const m = String(Math.floor(total / 60)).padStart(2, '0');
		const s = String(total % 60).padStart(2, '0');
		const h = Math.floor(total / 3600);
		return h > 0 ? `${h}:${String(Math.floor((total % 3600) / 60)).padStart(2, '0')}:${s}` : `${m}:${s}`;
	}

	const rows = $derived(
		lyrics.mode === 'timed'
			? lyrics.cues.map((cue, index) => ({ index, time: fmt(cue.startMs), text: cue.text }))
			: lyrics.lines.map((text, index) => ({
					index,
					time: lyrics.taps[index] === null ? '—' : fmt(lyrics.taps[index]!),
					text
				}))
	);
</script>

<input bind:this={fileInput} type="file" accept=".srt,.txt" class="hidden" onchange={onFile} />

<div class="flex h-full min-h-0 flex-col">
	<!-- ── On-air readout ─────────────────────────────────── -->
	<div class="border-b border-ink-700 bg-ink-850 px-4 py-3">
		<div class="flex items-center justify-between">
			<span class="text-[11px] font-semibold text-fg/60">{t('lyrics.onAir')}</span>
			<button
				class="studio-chip {lyrics.onAir ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/20 text-red-300'}"
				onclick={() => (lyrics.onAir = !lyrics.onAir)}
				title={t('lyrics.toggleHint')}
			>
				{lyrics.onAir ? t('lyrics.shown') : t('lyrics.hidden')}
			</button>
		</div>
		<p class="mt-2 min-h-[2.5rem] text-lg leading-snug text-fg">{live.current || '—'}</p>
		{#if live.next}
			<p class="truncate text-sm text-fg/35">{live.next}</p>
		{/if}
	</div>

	<!-- ── Load ───────────────────────────────────────────── -->
	<div class="flex flex-wrap items-center gap-2 border-b border-ink-700 px-3 py-2">
		<button class="studio-chip" onclick={() => fileInput?.click()}>{t('lyrics.open')}</button>
		<button class="studio-chip" onclick={() => (pasteOpen = !pasteOpen)}>{t('lyrics.paste')}</button>
		{#if lyrics.mode === 'manual' && lyrics.lines.length > 0}
			<button class="studio-chip" onclick={downloadSrt} title={t('lyrics.exportHint')}>
				{t('lyrics.exportSrt')}
			</button>
		{/if}
		{#if lyrics.fileName}
			<span class="ml-auto truncate text-[11px] text-fg/35">{lyrics.fileName}</span>
		{/if}
	</div>

	{#if pasteOpen}
		<div class="border-b border-ink-700 p-3">
			<textarea
				class="studio-input h-32 w-full resize-none font-mono text-xs"
				placeholder={t('lyrics.pastePlaceholder')}
				bind:value={pasteText}
			></textarea>
			<div class="mt-2 flex gap-2">
				<button class="studio-btn-primary" onclick={applyPaste}>{t('lyrics.load')}</button>
				<button class="studio-chip" onclick={() => (pasteOpen = false)}>{t('common.cancel')}</button>
			</div>
		</div>
	{/if}

	{#if notice}
		<p class="border-b border-ink-700 px-3 py-1.5 text-[11px] text-fg/45">{notice}</p>
	{/if}

	<!-- ── Transport ──────────────────────────────────────── -->
	{#if lyrics.mode === 'timed'}
		<div class="border-b border-ink-700 px-3 py-2.5">
			{#if lyrics.cues.length === 0}
				<p class="text-[11px] leading-relaxed text-fg/40">{t('lyrics.hintTimed')}</p>
			{:else if lyrics.anchorEpochMs === null}
				<button class="studio-btn-primary w-full" onclick={() => anchorAt(0)}>
					{t('lyrics.start')}
				</button>
				<p class="mt-2 text-[11px] leading-relaxed text-fg/40">{t('lyrics.startHint')}</p>
			{:else}
				<div class="flex items-center justify-between">
					<span class="font-mono text-sm text-fg/80">{fmt(positionMs ?? 0)}</span>
					<span class="text-[11px] text-fg/35">
						{t('lyrics.offset', {
							value: `${lyrics.offsetMs > 0 ? '+' : ''}${(lyrics.offsetMs / 1000).toFixed(1)}`
						})}
					</span>
				</div>
				<div class="mt-2 flex flex-wrap items-center gap-1">
					<span class="text-[10px] text-fg/30">{t('lyrics.behind')}</span>
					{#each [-30000, -5000, -1000, 1000, 5000, 30000] as delta (delta)}
						<button class="studio-chip font-mono" onclick={() => nudge(delta)}>
							{delta > 0 ? '+' : '−'}{Math.abs(delta) / 1000}s
						</button>
					{/each}
					<span class="text-[10px] text-fg/30">{t('lyrics.ahead')}</span>
					<button class="studio-chip ml-auto" onclick={clearSync}>{t('lyrics.stop')}</button>
				</div>
			{/if}
		</div>
	{:else}
		<div class="flex items-center gap-2 border-b border-ink-700 px-3 py-2.5">
			<button class="studio-chip" onclick={() => goTo(-1)} title={t('lyrics.clearHint')}>
				{t('lyrics.clear')}
			</button>
			<button class="studio-chip" onclick={() => goTo(Math.max(0, lyrics.index - 1))}>
				{t('lyrics.previous')}
			</button>
			<button class="studio-btn-primary flex-1" onclick={() => goTo(lyrics.index + 1)}>
				{t('lyrics.next')}
				<span class="ml-2 font-mono text-[10px] opacity-60">{t('lyrics.spaceKey')}</span>
			</button>
			<span class="font-mono text-[11px] text-fg/35">
				{lyrics.index + 1}/{lyrics.lines.length}
			</span>
		</div>
	{/if}

	<!-- ── Line list ──────────────────────────────────────── -->
	<div bind:this={listEl} class="min-h-0 flex-1 overflow-y-auto">
		{#each rows as row (row.index)}
			<button
				data-index={row.index}
				class="flex w-full items-start gap-3 border-b border-ink-800 px-3 py-2 text-left transition-colors hover:bg-primary/10 {row.index ===
				activeIndex
					? 'bg-primary/15'
					: ''}"
				onclick={() =>
					lyrics.mode === 'timed' ? anchorAt(lyrics.cues[row.index].startMs) : goTo(row.index)}
				title={lyrics.mode === 'timed' ? t('lyrics.cueHintTimed') : t('lyrics.cueHintManual')}
			>
				<span class="w-12 shrink-0 pt-0.5 font-mono text-[10px] text-fg/30">{row.time}</span>
				<span class="min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-snug text-fg/75"
					>{row.text}</span
				>
			</button>
		{:else}
			<p class="px-3 py-6 text-center text-[11px] text-fg/30">{t('lyrics.emptyList')}</p>
		{/each}
	</div>
</div>
