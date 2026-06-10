<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { confirmDialog } from '$lib/stores/confirm-dialog';
	import { toast } from '$lib/stores/toast';
	import { parseSrt, findCueIndex, type SrtCue } from '$lib/utils/srt';

	// Live subtitle sync control — shown under the broadcast card while a live
	// with an attached SRT is on air. The operator clicks "Démarrer" at the
	// exact moment the subtitled audio starts (ideally while listening to the
	// Icecast output below, so encoder latency is baked into the anchor), then
	// nudges ±1/5/30s if the text runs early or late.
	let {
		broadcast,
		liveStreamUrl
	}: {
		broadcast: {
			subtitle_srt_url: string | null;
			subtitle_anchor_epoch_ms: number | null;
			subtitle_offset_ms: number;
		};
		liveStreamUrl: string;
	} = $props();

	let anchorEpochMs = $state<number | null>(null);
	let offsetMs = $state(0);
	$effect(() => {
		// Server state wins whenever the page data refreshes (another admin may
		// have synced from a different device).
		anchorEpochMs = broadcast.subtitle_anchor_epoch_ms;
		offsetMs = broadcast.subtitle_offset_ms ?? 0;
	});

	let cues = $state<SrtCue[]>([]);
	let loadError = $state<string | null>(null);
	let busy = $state(false);
	let nowMs = $state(Date.now());
	let showCueList = $state(false);
	let showMonitor = $state(false);

	// ── Live-only stream monitor (no pause, no seek) ─────────────
	// The operator anchors and nudges against what they HEAR here, so this
	// player must never drift behind the true live edge: a paused/buffered
	// monitor would make them sync everyone to stale audio. Stop tears the
	// connection down; play always opens a fresh one at the live edge.
	let monitorAudio = $state<HTMLAudioElement | null>(null);
	let monitorPlaying = $state(false);

	function startMonitor() {
		if (!monitorAudio) return;
		const sep = liveStreamUrl.includes('?') ? '&' : '?';
		monitorAudio.src = `${liveStreamUrl}${sep}t=${Date.now()}`;
		monitorAudio.load();
		monitorAudio
			.play()
			.then(() => (monitorPlaying = true))
			.catch(() => stopMonitor());
	}

	function stopMonitor() {
		monitorPlaying = false;
		if (!monitorAudio) return;
		monitorAudio.pause();
		monitorAudio.removeAttribute('src');
		monitorAudio.load();
	}

	// Any pause — ours, the OS's, a stall the browser gave up on — tears the
	// stream down so the next listen is guaranteed to be the live edge.
	function onMonitorPause() {
		if (monitorPlaying) stopMonitor();
	}

	onMount(() => {
		const tick = setInterval(() => (nowMs = Date.now()), 300);
		(async () => {
			try {
				const res = await fetch('/api/broadcast/subtitles');
				if (!res.ok) throw new Error(`Erreur ${res.status}`);
				cues = parseSrt(await res.text());
				if (cues.length === 0) loadError = 'Fichier .srt vide ou illisible';
			} catch (err) {
				loadError = err instanceof Error ? err.message : 'Transcription inaccessible';
			}
		})();
		return () => {
			clearInterval(tick);
			stopMonitor();
		};
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
				toast.error((await res.text()) || `Erreur ${res.status}`);
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
			toast.success('Sous-titres démarrés — les auditeurs voient maintenant le texte');
		}
	}

	async function resync() {
		const ok = await confirmDialog.ask({
			title: 'Re-synchroniser',
			message:
				'Le texte repartira de 00:00 maintenant. À utiliser uniquement si l\'audio sous-titré vient de recommencer.',
			confirmLabel: 'Re-synchroniser',
			cancelLabel: 'Annuler',
			tone: 'warning'
		});
		if (ok) await start();
	}

	async function nudge(deltaMs: number) {
		await post({ action: 'nudge', deltaMs });
	}

	async function jumpToCue(cue: SrtCue) {
		const ok = await confirmDialog.ask({
			title: 'Caler sur cette réplique',
			message: `« ${cue.text.slice(0, 120)}${cue.text.length > 120 ? '…' : ''} » sera affichée comme la réplique en cours.`,
			confirmLabel: 'Caler maintenant',
			cancelLabel: 'Annuler'
		});
		if (!ok) return;
		if (await post({ action: 'jump-to-cue', cueStartMs: cue.startMs })) {
			showCueList = false;
			toast.success('Texte calé sur la réplique choisie');
		}
	}

	async function clear() {
		const ok = await confirmDialog.ask({
			title: 'Désactiver les sous-titres',
			message: 'Le texte disparaîtra chez tous les auditeurs. Vous pourrez redémarrer ensuite.',
			confirmLabel: 'Désactiver',
			cancelLabel: 'Annuler',
			tone: 'danger'
		});
		if (!ok) return;
		if (await post({ action: 'clear' })) {
			toast.success('Sous-titres désactivés');
			await invalidateAll();
		}
	}
</script>

<div class="mb-8 border border-sky-200/70 bg-sky-50/30 p-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<p class="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">
				Sous-titres du direct
			</p>
			<p class="mt-1 text-[10px] text-stone-400">
				Texte synchronisé affiché aux auditeurs pendant la diffusion.
			</p>
		</div>
		{#if anchorEpochMs !== null && srtMs !== null}
			<div class="text-right">
				<p class="font-mono text-lg font-semibold text-stone-800">{fmtClock(srtMs)}</p>
				<p class="text-[10px] text-stone-400">
					Position du texte · décalage {fmtOffset(offsetMs)}
				</p>
			</div>
		{/if}
	</div>

	{#if loadError}
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
				Démarrer les sous-titres
			</button>
			<p class="text-[11px] leading-relaxed text-stone-500">
				Cliquez à l'instant exact où la prédication sous-titrée commence —
				idéalement en écoutant le direct ci-dessous, pour que la latence du flux soit prise en
				compte. Moment manqué ? Utilisez « Caler sur une réplique ».
			</p>
		</div>
	{:else}
		<!-- Anchored: cue preview + nudge controls -->
		<div class="mt-4 space-y-3">
			<div class="border border-stone-200/60 bg-white/70 px-4 py-3">
				<p class="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">En cours</p>
				<p class="mt-1 text-sm leading-relaxed text-stone-800">
					{currentCue ? currentCue.text : srtMs !== null && cues.length > 0 && srtMs < cues[0].startMs ? '(avant la première réplique)' : '—'}
				</p>
				{#if nextCue}
					<p class="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-300">Suivant</p>
					<p class="mt-0.5 truncate text-xs text-stone-400">{nextCue.text}</p>
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<span class="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-400">
					Texte en retard →
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
					← texte en avance
				</span>
			</div>

			<div class="flex flex-wrap items-center gap-2 border-t border-stone-200/60 pt-3">
				<button
					type="button"
					class="border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-stone-600 transition-colors hover:border-amber-500 hover:bg-amber-500 hover:text-white disabled:opacity-50"
					disabled={busy}
					onclick={resync}
				>
					Re-synchroniser (repartir de 00:00)
				</button>
				<button
					type="button"
					class="border border-transparent px-3 py-1.5 text-[11px] font-semibold text-stone-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
					disabled={busy}
					onclick={clear}
				>
					Désactiver
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
			Caler sur une réplique ({cues.length})
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

		<!-- Stream monitor — anchor against what listeners actually hear -->
		<button
			type="button"
			class="mt-3 flex w-full items-center gap-2 text-left text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400 transition-colors hover:text-stone-600"
			onclick={() => (showMonitor = !showMonitor)}
		>
			<svg
				class="h-3 w-3 transition-transform {showMonitor ? 'rotate-90' : ''}"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2.5"
				aria-hidden="true"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
			</svg>
			Écouter le direct pour vérifier la synchro
		</button>
		{#if showMonitor}
			<div class="mt-2 flex flex-wrap items-center gap-3 border border-stone-200/60 bg-white/70 px-4 py-3">
				<button
					type="button"
					onclick={() => (monitorPlaying ? stopMonitor() : startMonitor())}
					class="inline-flex items-center gap-2 border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.15em] transition-colors {monitorPlaying
						? 'border-red-300 bg-red-50 text-red-700 hover:border-red-600 hover:bg-red-600 hover:text-white'
						: 'border-stone-200 bg-white text-stone-600 hover:border-sky-500 hover:bg-sky-500 hover:text-white'}"
				>
					{#if monitorPlaying}
						<svg class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<rect x="6" y="6" width="12" height="12" rx="1" />
						</svg>
						Arrêter l'écoute
					{:else}
						<svg class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
							<path d="M8 5v14l11-7z" />
						</svg>
						Écouter le direct
					{/if}
				</button>
				{#if monitorPlaying}
					<span class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-red-600">
						<span class="relative inline-flex h-1.5 w-1.5">
							<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"></span>
							<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500"></span>
						</span>
						Au direct
					</span>
				{/if}
				<p class="min-w-0 flex-1 text-[10px] leading-relaxed text-stone-400">
					Toujours au direct — pas de pause ni de retour en arrière, pour que la synchro soit
					calée sur ce que les auditeurs entendent réellement.
				</p>
				<audio bind:this={monitorAudio} preload="none" onpause={onMonitorPause}></audio>
			</div>
		{/if}
	{/if}
</div>
