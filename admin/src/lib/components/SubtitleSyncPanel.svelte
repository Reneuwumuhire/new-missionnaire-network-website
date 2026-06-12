<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { confirmDialog } from '$lib/stores/confirm-dialog';
	import { toast } from '$lib/stores/toast';
	import { t } from '$lib/i18n';
	import { parseSrt, findCueIndex, type SrtCue } from '$lib/utils/srt';

	// Live subtitle sync control — shown under the broadcast card while a live
	// is on air. The operator clicks "Démarrer" (or a cue in the list) at the
	// exact moment they HEAR the words in the « Écoute du direct » monitor of
	// the broadcast card above — that monitor is pause-proof and always at the
	// live edge, so the stream latency is baked into the anchor. The ±1/5/30s
	// nudges fine-tune afterwards.
	let {
		broadcast
	}: {
		broadcast: {
			subtitle_srt_url: string | null;
			subtitle_anchor_epoch_ms: number | null;
			subtitle_offset_ms: number;
		};
	} = $props();

	let anchorEpochMs = $state<number | null>(null);
	let offsetMs = $state(0);
	let hasSrt = $state(false);
	$effect(() => {
		// Server state wins whenever the page data refreshes (another admin may
		// have synced from a different device).
		anchorEpochMs = broadcast.subtitle_anchor_epoch_ms;
		offsetMs = broadcast.subtitle_offset_ms ?? 0;
		hasSrt = Boolean(broadcast.subtitle_srt_url);
	});

	let cues = $state<SrtCue[]>([]);
	let loadError = $state<string | null>(null);
	let busy = $state(false);
	let nowMs = $state(Date.now());
	let showCueList = $state(false);
	let attachBusy = $state(false);
	let attachError = $state<string | null>(null);

	async function loadCues() {
		try {
			loadError = null;
			// Cache-bust: the GET proxy serves whatever SRT the gate currently
			// points to, which changes after an attach/replace.
			const res = await fetch(`/api/broadcast/subtitles?t=${Date.now()}`);
			if (!res.ok) throw new Error($t('recordings.error.http', { status: res.status }));
			cues = parseSrt(await res.text());
			if (cues.length === 0) loadError = $t('recordings.subtitles.error.emptySrt');
		} catch (err) {
			loadError = err instanceof Error ? err.message : $t('recordings.subtitles.error.unreachable');
		}
	}

	/** Attach (or replace) an SRT while the broadcast is already running:
	 *  presign → direct S3 upload → 'attach' action wires it to the gate and
	 *  the scheduled entry. Listeners see the transcript on their next poll. */
	async function onAttachFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || attachBusy) return;
		if (!file.name.toLowerCase().endsWith('.srt')) {
			attachError = $t('recordings.error.selectSrt');
			return;
		}
		if (file.size > 2 * 1024 * 1024) {
			attachError = $t('recordings.error.srtTooLarge');
			return;
		}
		const parsed = parseSrt(await file.text());
		if (parsed.length === 0) {
			attachError = $t('recordings.error.srtUnreadable');
			return;
		}
		if (hasSrt) {
			const ok = await confirmDialog.ask({
				title: $t('recordings.subtitles.confirm.replaceTitle'),
				message: $t('recordings.subtitles.confirm.replaceMessage', {
					filename: file.name,
					count: parsed.length
				}),
				confirmLabel: $t('recordings.common.replace'),
				cancelLabel: $t('recordings.common.cancel'),
				tone: 'warning'
			});
			if (!ok) return;
		}
		attachBusy = true;
		attachError = null;
		try {
			const presignRes = await fetch('/api/broadcast/subtitles/presign', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ filename: file.name, size: file.size })
			});
			if (!presignRes.ok) {
				attachError = (await presignRes.text()) || $t('recordings.error.http', { status: presignRes.status });
				return;
			}
			const { uploadUrl, key, publicUrl, contentType } = (await presignRes.json()) as {
				uploadUrl: string;
				key: string;
				publicUrl: string;
				contentType: string;
			};
			const uploadRes = await fetch(uploadUrl, {
				method: 'PUT',
				headers: { 'Content-Type': contentType },
				body: file
			});
			if (!uploadRes.ok) {
				attachError = $t('recordings.error.srtUploadFailed');
				return;
			}
			const attachRes = await fetch('/api/broadcast/subtitles', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'attach',
					subtitle_srt_url: publicUrl,
					subtitle_srt_s3_key: key,
					subtitle_filename: file.name
				})
			});
			if (!attachRes.ok) {
				attachError = (await attachRes.text()) || $t('recordings.error.http', { status: attachRes.status });
				return;
			}
			hasSrt = true;
			anchorEpochMs = null;
			offsetMs = 0;
			cues = parsed;
			toast.success($t('recordings.subtitles.toast.attached'));
			await invalidateAll();
		} finally {
			attachBusy = false;
		}
	}

	// (No monitor here — the « Écoute du direct » player in the broadcast card
	// above is the single audio reference: always live, mute-only.)

	onMount(() => {
		const tick = setInterval(() => (nowMs = Date.now()), 300);
		if (broadcast.subtitle_srt_url) void loadCues();
		return () => clearInterval(tick);
	});

	// Broadcast-side SRT position — ahead of what listeners hear by the
	// encoder→Icecast→player latency (a few seconds).
	const srtMs = $derived(anchorEpochMs === null ? null : nowMs - anchorEpochMs + offsetMs);
	const currentIndex = $derived(srtMs === null ? -1 : findCueIndex(cues, srtMs));
	const currentCue = $derived(currentIndex >= 0 ? cues[currentIndex] : null);
	const nextCue = $derived(
		currentIndex + 1 < cues.length ? cues[currentIndex + 1] : null
	);

	function fmtClock(ms: number): string {
		const total = Math.max(0, Math.floor(ms / 1000));
		const h = Math.floor(total / 3600);
		const m = Math.floor((total % 3600) / 60);
		const s = total % 60;
		const mm = String(m).padStart(2, '0');
		const ss = String(s).padStart(2, '0');
		return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
	}

	function fmtOffset(ms: number): string {
		const sign = ms > 0 ? '+' : ms < 0 ? '−' : '±';
		return `${sign}${Math.abs(ms / 1000)}s`;
	}

	async function post(body: Record<string, unknown>): Promise<boolean> {
		if (busy) return false;
		busy = true;
		try {
			const res = await fetch('/api/broadcast/subtitles', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				toast.error((await res.text()) || $t('recordings.error.http', { status: res.status }));
				return false;
			}
			const data = (await res.json()) as { anchorEpochMs: number | null; offsetMs: number };
			anchorEpochMs = data.anchorEpochMs;
			offsetMs = data.offsetMs;
			return true;
		} finally {
			busy = false;
		}
	}

	async function start() {
		if (await post({ action: 'start', atEpochMs: Date.now() })) {
			toast.success($t('recordings.subtitles.toast.started'));
		}
	}

	async function resync() {
		const ok = await confirmDialog.ask({
			title: $t('recordings.subtitles.resync'),
			message: $t('recordings.subtitles.confirm.resyncMessage'),
			confirmLabel: $t('recordings.subtitles.resync'),
			cancelLabel: $t('recordings.common.cancel'),
			tone: 'warning'
		});
		if (ok) await start();
	}

	async function nudge(deltaMs: number) {
		await post({ action: 'nudge', deltaMs });
	}

	async function jumpToCue(cue: SrtCue) {
		// No confirmation — syncing is a timing action, a dialog would make the
		// operator miss the moment. The click instant rides along so network
		// latency doesn't shift the anchor; a wrong click is fixed by simply
		// clicking the right cue (or nudging).
		if (await post({ action: 'jump-to-cue', cueStartMs: cue.startMs, atEpochMs: Date.now() })) {
			toast.success($t('recordings.subtitles.toast.jumped'));
		}
	}

	async function clear() {
		const ok = await confirmDialog.ask({
			title: $t('recordings.subtitles.confirm.disableTitle'),
			message: $t('recordings.subtitles.confirm.disableMessage'),
			confirmLabel: $t('recordings.subtitles.disable'),
			cancelLabel: $t('recordings.common.cancel'),
			tone: 'danger'
		});
		if (!ok) return;
		if (await post({ action: 'clear' })) {
			toast.success($t('recordings.subtitles.toast.disabled'));
			await invalidateAll();
		}
	}
</script>

<div class="mb-8 border border-sky-200/70 bg-sky-50/30 p-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<p class="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">
				{$t('recordings.subtitles.title')}
			</p>
			<p class="mt-1 text-[10px] text-stone-400">
				{$t('recordings.subtitles.subtitle')}
			</p>
		</div>
		{#if anchorEpochMs !== null && srtMs !== null}
			<div class="text-right">
				<p class="font-mono text-lg font-semibold text-stone-800">{fmtClock(srtMs)}</p>
				<p class="text-[10px] text-stone-400">
					{$t('recordings.subtitles.position', { offset: fmtOffset(offsetMs) })}
				</p>
			</div>
		{/if}
	</div>

	{#if !hasSrt}
		<!-- Broadcast started without a transcript — attach one mid-stream. -->
		<div class="mt-4 flex flex-col items-start gap-3">
			<label
				class="inline-flex cursor-pointer items-center gap-2 border border-sky-600 bg-sky-600 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-white shadow-sm transition-all hover:bg-sky-700 {attachBusy ? 'pointer-events-none opacity-60' : ''}"
			>
				<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
				</svg>
				{attachBusy ? $t('recordings.common.uploading') : $t('recordings.subtitles.attach')}
				<input type="file" accept=".srt" class="hidden" disabled={attachBusy} onchange={onAttachFileChange} />
			</label>
			<p class="text-[11px] leading-relaxed text-stone-500">
				{$t('recordings.subtitles.attachHint')}
			</p>
			{#if attachError}
				<p class="border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{attachError}</p>
			{/if}
		</div>
	{:else if loadError}
		<p class="mt-4 border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{loadError}</p>
	{:else if anchorEpochMs === null}
		<!-- Not anchored yet -->
		<div class="mt-4 flex flex-col items-start gap-3">
			<button
				type="button"
				class="inline-flex items-center gap-2 border border-sky-600 bg-sky-600 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-white shadow-sm transition-all hover:bg-sky-700 disabled:opacity-50"
				disabled={busy || cues.length === 0}
				onclick={start}
			>
				<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
					<path d="M8 5v14l11-7z" />
				</svg>
				{$t('recordings.subtitles.start')}
			</button>
			<p class="text-[11px] leading-relaxed text-stone-500">
				{$t('recordings.subtitles.startHint')}
			</p>
		</div>
	{:else}
		<!-- Anchored: cue preview + nudge controls -->
		<div class="mt-4 space-y-3">
			<div class="border border-stone-200/60 bg-white/70 px-4 py-3">
				<p class="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">{$t('recordings.subtitles.current')}</p>
				<p class="mt-1 text-sm leading-relaxed text-stone-800">
					{currentCue ? currentCue.text : srtMs !== null && cues.length > 0 && srtMs < cues[0].startMs ? $t('recordings.subtitles.beforeFirstCue') : '—'}
				</p>
				{#if nextCue}
					<p class="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-300">{$t('recordings.subtitles.next')}</p>
					<p class="mt-0.5 truncate text-xs text-stone-400">{nextCue.text}</p>
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<span class="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
					{$t('recordings.subtitles.textBehind')}
				</span>
				{#each [-30000, -5000, -1000, 1000, 5000, 30000] as delta (delta)}
					{#if delta === 1000}
						<span class="mx-1 h-5 w-px bg-stone-200" aria-hidden="true"></span>
					{/if}
					<button
						type="button"
						class="border border-stone-200 bg-white px-3 py-1.5 font-mono text-[11px] font-semibold text-stone-600 transition-colors hover:border-sky-500 hover:bg-sky-500 hover:text-white disabled:opacity-50"
						disabled={busy}
						onclick={() => nudge(delta)}
					>
						{delta > 0 ? '+' : '−'}{Math.abs(delta) / 1000}s
					</button>
				{/each}
				<span class="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
					{$t('recordings.subtitles.textAhead')}
				</span>
			</div>

			<div class="flex flex-wrap items-center gap-2 border-t border-stone-200/60 pt-3">
				<button
					type="button"
					class="border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-stone-600 transition-colors hover:border-amber-500 hover:bg-amber-500 hover:text-white disabled:opacity-50"
					disabled={busy}
					onclick={resync}
				>
					{$t('recordings.subtitles.resyncFull')}
				</button>
				<button
					type="button"
					class="border border-transparent px-3 py-1.5 text-[11px] font-semibold text-stone-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
					disabled={busy}
					onclick={clear}
				>
					{$t('recordings.subtitles.disable')}
				</button>
			</div>
		</div>
	{/if}

	{#if !loadError && cues.length > 0}
		<!-- Jump-to-cue list -->
		<button
			type="button"
			class="mt-4 flex w-full items-center gap-2 text-left text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400 transition-colors hover:text-stone-600"
			onclick={() => (showCueList = !showCueList)}
		>
			<svg
				class="h-3 w-3 transition-transform {showCueList ? 'rotate-90' : ''}"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2.5"
				aria-hidden="true"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
			</svg>
			{$t('recordings.subtitles.jumpList', { count: cues.length })}
		</button>
		{#if showCueList}
			<div class="mt-2 max-h-64 divide-y divide-stone-100 overflow-y-auto border border-stone-200/60 bg-white/70">
				{#each cues as cue, index (cue.startMs)}
					<button
						type="button"
						class="flex w-full items-start gap-3 px-3 py-2 text-left transition-colors hover:bg-sky-50 {index === currentIndex ? 'bg-sky-50/80' : ''}"
						disabled={busy}
						onclick={() => jumpToCue(cue)}
					>
						<span class="shrink-0 font-mono text-[10px] text-stone-400">{fmtClock(cue.startMs)}</span>
						<span class="min-w-0 flex-1 truncate text-xs text-stone-600">{cue.text}</span>
					</button>
				{/each}
			</div>
		{/if}

		<!-- Single audio reference: the « Écoute du direct » monitor in the
		     broadcast card above (always live, mute-only). -->
		<p class="mt-3 border border-sky-100 bg-sky-50/60 px-3 py-2 text-[11px] leading-relaxed text-stone-500">
			<span class="font-semibold text-stone-600">{$t('recordings.subtitles.howToLabel')}</span>
			{$t('recordings.subtitles.howToBody')}
		</p>
	{/if}

	{#if hasSrt}
		<!-- Mid-stream replacement — e.g. the wrong file was attached, or a
		     corrected version arrived. Resets the sync anchor (confirmed). -->
		<div class="mt-4 border-t border-stone-200/60 pt-3">
			<label
				class="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-stone-400 transition-colors hover:text-stone-600 {attachBusy ? 'pointer-events-none opacity-60' : ''}"
			>
				<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h5M20 20v-5h-5M5.5 9a7.5 7.5 0 0113-2.5M18.5 15a7.5 7.5 0 01-13 2.5" />
				</svg>
				{attachBusy ? $t('recordings.common.uploading') : $t('recordings.subtitles.replaceSrt')}
				<input type="file" accept=".srt" class="hidden" disabled={attachBusy} onchange={onAttachFileChange} />
			</label>
			{#if attachError}
				<p class="mt-2 border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{attachError}</p>
			{/if}
		</div>
	{/if}
</div>
