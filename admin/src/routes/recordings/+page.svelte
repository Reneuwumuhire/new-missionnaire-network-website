<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import type { Recording, RecordingStatus } from '$lib/models/recording';

	let { data }: { data: PageData } = $props();

	type RecorderSnapshot = PageData['recorder'];
	type IcecastSnapshot = PageData['icecast'];

	const recorder: RecorderSnapshot = $derived(data.recorder);
	const icecast: IcecastSnapshot = $derived(data.icecast);
	const broadcast = $derived(data.broadcast);
	const subscriberCount = $derived(data.subscriberCount);
	let elapsed = $state(0);
	let broadcastElapsed = $state(0);
	let busy = $state(false);
	let broadcastBusy = $state(false);
	let actionError = $state<string | null>(null);
	let editing = $state<Record<string, string>>({});
	let confirmDelete = $state<string | null>(null);

	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let tickTimer: ReturnType<typeof setInterval> | null = null;

	const isRecording = $derived(recorder.available && 'recording' in recorder && recorder.recording);
	const showLiveBanner = $derived(
		icecast.reachable && icecast.sourceActive && !isRecording
	);

	async function refreshStatus() {
		// Re-runs the page's load fn, which updates `data.recorder` and `data.icecast`.
		await invalidateAll();
		recomputeElapsed();
	}

	function recomputeElapsed() {
		if (recorder.available && 'recording' in recorder && recorder.recording && recorder.startedAt) {
			elapsed = Math.max(0, Math.floor((Date.now() - new Date(recorder.startedAt).getTime()) / 1000));
		} else {
			elapsed = 0;
		}
		if (broadcast.is_live && broadcast.started_at) {
			broadcastElapsed = Math.max(
				0,
				Math.floor((Date.now() - new Date(broadcast.started_at).getTime()) / 1000)
			);
		} else {
			broadcastElapsed = 0;
		}
	}

	onMount(() => {
		recomputeElapsed();
		pollTimer = setInterval(refreshStatus, 5000);
		tickTimer = setInterval(recomputeElapsed, 1000);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
		if (tickTimer) clearInterval(tickTimer);
	});

	function formatElapsed(sec: number): string {
		const h = Math.floor(sec / 3600);
		const m = Math.floor((sec % 3600) / 60);
		const s = sec % 60;
		const pad = (n: number) => n.toString().padStart(2, '0');
		return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
	}

	function formatDuration(sec: number | null | undefined): string {
		if (sec == null) return '—';
		return formatElapsed(sec);
	}

	function formatBytes(bytes: number | null | undefined): string {
		if (!bytes) return '—';
		const units = ['B', 'KB', 'MB', 'GB'];
		let n = bytes;
		let i = 0;
		while (n >= 1024 && i < units.length - 1) {
			n /= 1024;
			i++;
		}
		return `${n.toFixed(1)} ${units[i]}`;
	}

	function formatDateTime(d: string | Date): string {
		return new Date(d).toLocaleString('fr-FR', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	async function start() {
		if (busy) return;
		busy = true;
		actionError = null;
		try {
			const res = await fetch('/api/recordings/start', { method: 'POST' });
			if (!res.ok) {
				const text = await res.text();
				actionError = text || `Erreur ${res.status}`;
			}
			await refreshStatus();
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	async function stop() {
		if (busy) return;
		busy = true;
		actionError = null;
		try {
			const res = await fetch('/api/recordings/stop', { method: 'POST' });
			if (!res.ok) {
				const text = await res.text();
				actionError = text || `Erreur ${res.status}`;
			}
			await refreshStatus();
			await invalidateAll();
		} finally {
			busy = false;
		}
	}

	async function goLive() {
		if (broadcastBusy) return;
		const msg = subscriberCount > 0
			? `Cela enverra une notification à ${subscriberCount} abonné${subscriberCount > 1 ? 's' : ''}. Continuer ?`
			: 'Aucun abonné aux notifications pour l\'instant. Aller en direct quand même ?';
		if (!confirm(msg)) return;
		broadcastBusy = true;
		actionError = null;
		try {
			const res = await fetch('/api/broadcast/go-live', { method: 'POST' });
			if (!res.ok) {
				const text = await res.text();
				actionError = text || `Erreur ${res.status}`;
			}
			await invalidateAll();
		} finally {
			broadcastBusy = false;
		}
	}

	async function endLive() {
		if (broadcastBusy) return;
		if (!confirm('Terminer le direct ? Le site public ne montrera plus le lecteur en direct.')) return;
		broadcastBusy = true;
		actionError = null;
		try {
			const res = await fetch('/api/broadcast/end-live', { method: 'POST' });
			if (!res.ok) {
				const text = await res.text();
				actionError = text || `Erreur ${res.status}`;
			}
			await invalidateAll();
		} finally {
			broadcastBusy = false;
		}
	}

	// ── Broadcast metadata (title + thumbnail) ──────────────────────
	let titleDraft = $state<string>('');
	let titleEditing = $state(false);
	let titleSaving = $state(false);
	let thumbnailUploading = $state(false);
	let thumbnailError = $state<string | null>(null);
	let thumbnailExpanded = $state(false);

	function openThumbnail() {
		if (!broadcast.thumbnail_url) return;
		thumbnailExpanded = true;
	}
	function closeThumbnail() {
		thumbnailExpanded = false;
	}
	function onLightboxKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeThumbnail();
	}
	function onBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) closeThumbnail();
	}

	$effect(() => {
		if (!titleEditing) titleDraft = broadcast.title ?? '';
	});

	async function saveBroadcastTitle() {
		const value = titleDraft.trim();
		if (value === (broadcast.title ?? '')) {
			titleEditing = false;
			return;
		}
		titleSaving = true;
		try {
			const res = await fetch('/api/broadcast/metadata', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ title: value || null })
			});
			if (!res.ok) {
				thumbnailError = (await res.text()) || `Erreur ${res.status}`;
			} else {
				titleEditing = false;
				await invalidateAll();
			}
		} finally {
			titleSaving = false;
		}
	}

	async function uploadThumbnail(file: File) {
		thumbnailError = null;
		if (!file.type.startsWith('image/')) {
			thumbnailError = 'Sélectionnez un fichier image';
			return;
		}
		thumbnailUploading = true;
		try {
			const presignRes = await fetch('/api/broadcast/thumbnail/presign', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ contentType: file.type, size: file.size })
			});
			if (!presignRes.ok) {
				thumbnailError = (await presignRes.text()) || `Erreur ${presignRes.status}`;
				return;
			}
			const { uploadUrl, key, publicUrl } = (await presignRes.json()) as {
				uploadUrl: string;
				key: string;
				publicUrl: string;
			};
			const uploadRes = await fetch(uploadUrl, {
				method: 'PUT',
				headers: { 'Content-Type': file.type },
				body: file
			});
			if (!uploadRes.ok) {
				thumbnailError = 'Échec du téléversement vers S3';
				return;
			}
			const commitRes = await fetch('/api/broadcast/metadata', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ thumbnail_url: publicUrl, thumbnail_s3_key: key })
			});
			if (!commitRes.ok) {
				thumbnailError = (await commitRes.text()) || `Erreur ${commitRes.status}`;
				return;
			}
			await invalidateAll();
		} finally {
			thumbnailUploading = false;
		}
	}

	async function clearThumbnail() {
		if (!confirm('Retirer la vignette actuelle ?')) return;
		thumbnailError = null;
		thumbnailUploading = true;
		try {
			const res = await fetch('/api/broadcast/metadata', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ thumbnail_url: null, thumbnail_s3_key: null })
			});
			if (!res.ok) {
				thumbnailError = (await res.text()) || `Erreur ${res.status}`;
			} else {
				await invalidateAll();
			}
		} finally {
			thumbnailUploading = false;
		}
	}

	function onThumbnailFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) uploadThumbnail(file);
		input.value = '';
	}

	/** End the live broadcast AND stop the recording in one click. Order matters:
	 *  end-live first so the public site flips offline immediately, then stop
	 *  recording (which triggers the S3 upload). Single confirmation for both. */
	async function stopBoth() {
		if (broadcastBusy || busy) return;
		if (!confirm('Terminer le direct ET arrêter l\'enregistrement ?')) return;
		broadcastBusy = true;
		busy = true;
		actionError = null;
		try {
			const liveRes = await fetch('/api/broadcast/end-live', { method: 'POST' });
			if (!liveRes.ok) {
				actionError = (await liveRes.text()) || `Erreur fin direct: ${liveRes.status}`;
			}
			const recRes = await fetch('/api/recordings/stop', { method: 'POST' });
			if (!recRes.ok) {
				const recErr = (await recRes.text()) || `${recRes.status}`;
				actionError = actionError ? `${actionError} · arrêt enregistrement: ${recErr}` : `Arrêt enregistrement: ${recErr}`;
			}
			await invalidateAll();
		} finally {
			broadcastBusy = false;
			busy = false;
		}
	}

	/** Fire both actions in sequence. Confirmation happens once up-front; if
	 *  recording start fails after the push already went out, surface an error
	 *  but leave the broadcast running — admin can retry recording separately. */
	async function startBoth() {
		if (broadcastBusy || busy) return;
		const msg = subscriberCount > 0
			? `Aller en direct ET démarrer l'enregistrement ? Une notification sera envoyée à ${subscriberCount} abonné${subscriberCount > 1 ? 's' : ''}.`
			: 'Aller en direct ET démarrer l\'enregistrement ?';
		if (!confirm(msg)) return;
		broadcastBusy = true;
		busy = true;
		actionError = null;
		try {
			const liveRes = await fetch('/api/broadcast/go-live', { method: 'POST' });
			if (!liveRes.ok) {
				actionError = (await liveRes.text()) || `Erreur ${liveRes.status}`;
				return;
			}
			const recRes = await fetch('/api/recordings/start', { method: 'POST' });
			if (!recRes.ok) {
				actionError = `Direct démarré, mais échec de l'enregistrement: ${(await recRes.text()) || recRes.status}`;
			}
			await invalidateAll();
		} finally {
			broadcastBusy = false;
			busy = false;
		}
	}

	function formatTime(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
	}

	async function saveTitle(rec: Recording) {
		const id = rec._id!;
		const title = editing[id]?.trim();
		if (!title || title === rec.title) {
			delete editing[id];
			editing = { ...editing };
			return;
		}
		await fetch(`/api/recordings/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ title })
		});
		delete editing[id];
		editing = { ...editing };
		await invalidateAll();
	}

	async function togglePublish(rec: Recording) {
		await fetch(`/api/recordings/${rec._id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ published: !rec.published })
		});
		await invalidateAll();
	}

	async function retryUpload(id: string) {
		const res = await fetch(`/api/recordings/retry/${id}`, { method: 'POST' });
		if (!res.ok) actionError = await res.text();
		await invalidateAll();
	}

	async function remove(id: string) {
		const res = await fetch(`/api/recordings/${id}`, { method: 'DELETE' });
		if (!res.ok) actionError = await res.text();
		confirmDelete = null;
		await invalidateAll();
	}

	const statusLabel: Record<RecordingStatus, string> = {
		recording: 'En cours',
		uploading: 'Téléversement',
		ready: 'Prêt',
		failed: 'Échec'
	};

	function statusClass(status: RecordingStatus): string {
		switch (status) {
			case 'ready':
				return 'bg-green-100 text-green-700';
			case 'recording':
				return 'bg-red-100 text-red-700 animate-pulse';
			case 'uploading':
				return 'bg-blue-100 text-blue-700';
			case 'failed':
				return 'bg-amber-100 text-amber-700';
		}
	}
</script>

<svelte:head>
	<title>Enregistrements - Missionnaire Admin</title>
</svelte:head>

<div class="mb-8">
	<h1 class="font-display text-3xl font-bold text-stone-800">Enregistrements</h1>
	<p class="mt-1 text-sm text-stone-500">
		Capture le direct audio en temps réel. {data.total} enregistrement{data.total !== 1 ? 's' : ''}.
	</p>
</div>

{#if !recorder.available}
	<div class="mb-6 rounded-2xl border border-red-200 bg-red-50/80 p-5">
		<p class="text-sm font-semibold text-red-800">Service d'enregistrement injoignable</p>
		<p class="mt-1 text-xs text-red-600">{recorder.error}</p>
	</div>
{/if}

{#if showLiveBanner}
	<div class="mb-6 rounded-2xl border border-green-200 bg-green-50/80 p-5">
		<div class="flex items-start gap-3">
			<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green-100">
				<span class="relative inline-flex h-2.5 w-2.5">
					<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75"></span>
					<span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-600"></span>
				</span>
			</div>
			<div>
				<p class="text-sm font-semibold text-green-800">Direct détecté — prêt à enregistrer</p>
				<p class="mt-1 text-xs text-green-700">
					Icecast reçoit un flux audio. Cliquez sur <strong>Démarrer l'enregistrement</strong> pour le capturer.
				</p>
			</div>
		</div>
	</div>
{/if}

<!-- Unified broadcast + recording control card -->
{#snippet iconBroadcast()}
	<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" d="M5.636 5.636a9 9 0 010 12.728m12.728 0a9 9 0 010-12.728M8.464 8.464a5 5 0 000 7.072m7.072 0a5 5 0 000-7.072M12 12h.01" />
	</svg>
{/snippet}
{#snippet iconRecord()}
	<svg class="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
		<circle cx="12" cy="12" r="6" fill="currentColor" />
	</svg>
{/snippet}
{#snippet iconStop()}
	<svg class="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
		<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />
	</svg>
{/snippet}
{#snippet iconBoth()}
	<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
		<circle cx="9" cy="12" r="3" fill="currentColor" stroke="none" />
		<path stroke-linecap="round" stroke-linejoin="round" d="M15 9a4.5 4.5 0 010 6m2.5-8.5a8 8 0 010 11" />
	</svg>
{/snippet}

<div class="mb-8 rounded-2xl border bg-white p-6 {broadcast.is_live ? 'border-red-200' : 'border-stone-200/60'}">
	<!-- Header: status + timers -->
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div class="flex items-center gap-4">
			<div class="flex h-12 w-12 items-center justify-center rounded-xl {broadcast.is_live || isRecording ? 'bg-red-50' : 'bg-stone-100'}">
				{#if broadcast.is_live || isRecording}
					<span class="relative inline-flex h-2.5 w-2.5">
						<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"></span>
						<span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"></span>
					</span>
				{:else}
					<svg class="h-5 w-5 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
					</svg>
				{/if}
			</div>

			<div>
				{#if broadcast.is_live && isRecording}
					<p class="font-display text-lg font-semibold text-red-700">En direct + enregistrement</p>
					<p class="text-xs text-stone-500">
						Audience en direct · capture en cours vers S3
					</p>
				{:else if broadcast.is_live}
					<p class="font-display text-lg font-semibold text-red-700">En direct</p>
					<p class="text-xs text-stone-500">
						Démarré à {formatTime(broadcast.started_at)} · {icecast.listeners} auditeur{icecast.listeners !== 1 ? 's' : ''}
					</p>
				{:else if isRecording}
					<p class="font-display text-lg font-semibold text-stone-800">Enregistrement seul</p>
					<p class="text-xs text-stone-500">
						Capture silencieuse · audience hors ligne
					</p>
				{:else}
					<p class="font-display text-lg font-semibold text-stone-800">Prêt à diffuser</p>
					<p class="text-xs text-stone-500">
						{#if icecast.reachable}
							Flux Icecast {icecast.sourceActive ? 'actif' : 'inactif'} · {icecast.listeners} auditeur{icecast.listeners !== 1 ? 's' : ''}
						{:else}
							Icecast injoignable
						{/if}
						{#if subscriberCount > 0} · {subscriberCount} abonné{subscriberCount > 1 ? 's' : ''}{/if}
					</p>
				{/if}
			</div>
		</div>

		<!-- Live timers (shown only for active states) -->
		{#if broadcast.is_live || isRecording}
			<div class="flex items-center gap-5">
				{#if broadcast.is_live}
					<div class="flex flex-col items-end">
						<span class="text-[9px] font-bold uppercase tracking-[0.2em] text-red-600">Direct</span>
						<span class="font-mono text-2xl font-semibold text-red-700 tabular-nums leading-tight">
							{formatElapsed(broadcastElapsed)}
						</span>
					</div>
				{/if}
				{#if isRecording}
					<div class="flex flex-col items-end">
						<span class="text-[9px] font-bold uppercase tracking-[0.2em] text-stone-500">Enregistrement</span>
						<span class="font-mono text-2xl font-semibold text-stone-700 tabular-nums leading-tight">
							{formatElapsed(elapsed)}
						</span>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Actions -->
	<div class="mt-5 flex flex-wrap gap-2.5 border-t border-stone-100 pt-5">
		{#if !icecast.sourceActive && !broadcast.is_live && !isRecording}
			<span class="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-medium text-stone-400">
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				En attente d'un flux audio… (démarrez OBS)
			</span>
		{:else}
			<!-- Broadcast controls -->
			{#if broadcast.is_live}
				<button
					onclick={endLive}
					disabled={broadcastBusy}
					class="inline-flex items-center gap-2 rounded-xl bg-stone-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:opacity-50"
				>
					{@render iconStop()}
					{broadcastBusy ? '…' : 'Terminer le direct'}
				</button>
			{:else if icecast.sourceActive}
				<button
					onclick={goLive}
					disabled={broadcastBusy}
					class="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
				>
					{@render iconBroadcast()}
					{broadcastBusy ? '…' : isRecording ? 'Aller en direct aussi' : 'Aller en direct'}
				</button>
			{/if}

			<!-- Recording controls -->
			{#if isRecording}
				<button
					onclick={stop}
					disabled={busy}
					class="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
				>
					{@render iconStop()}
					{busy ? 'Arrêt…' : 'Arrêter l\'enregistrement'}
				</button>
			{:else if icecast.sourceActive}
				<button
					onclick={start}
					disabled={busy || !recorder.available || ('pendingOrphans' in recorder && recorder.pendingOrphans > 0)}
					class="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-missionnaire-600 disabled:opacity-50"
				>
					{@render iconRecord()}
					{busy ? 'Démarrage…' : broadcast.is_live ? 'Démarrer l\'enregistrement aussi' : 'Démarrer l\'enregistrement'}
				</button>
			{/if}

			<!-- Combined start (only when nothing is active) -->
			{#if !broadcast.is_live && !isRecording && icecast.sourceActive}
				<button
					onclick={startBoth}
					disabled={broadcastBusy || busy || !recorder.available || ('pendingOrphans' in recorder && recorder.pendingOrphans > 0)}
					class="inline-flex items-center gap-2 rounded-xl border-2 border-stone-800 bg-stone-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-stone-900 disabled:opacity-50"
				>
					{@render iconBoth()}
					Tout démarrer
				</button>
			{/if}

			<!-- Combined stop (only when both are active) — pushed to the far right -->
			{#if broadcast.is_live && isRecording}
				<button
					onclick={stopBoth}
					disabled={broadcastBusy || busy}
					class="ml-auto inline-flex items-center gap-2 rounded-xl border-2 border-stone-800 bg-stone-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-stone-900 disabled:opacity-50"
				>
					{@render iconStop()}
					Tout arrêter
				</button>
			{/if}
		{/if}
	</div>

	{#if recorder.available && 'pendingOrphans' in recorder && recorder.pendingOrphans > 0}
		<p class="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
			Récupération en cours : {recorder.pendingOrphans} enregistrement(s) en attente de téléversement.
		</p>
	{/if}

	{#if actionError}
		<p class="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</p>
	{/if}

	<!-- Live audio monitor -->
	<div class="mt-5 flex flex-wrap items-center gap-3 border-t border-stone-100 pt-4">
		<div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
			<svg class="h-4 w-4 text-missionnaire" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
			</svg>
			Écoute du direct
		</div>
		<audio controls preload="none" src={data.liveStreamUrl} class="h-8 flex-1 min-w-[280px]"></audio>
		<span class="text-[11px] text-stone-400">
			{icecast.sourceActive ? 'Flux actif' : 'Aucune source active'}
		</span>
	</div>

	<!-- Broadcast metadata: title + thumbnail shown on the public /live page -->
	<div class="mt-5 border-t border-stone-100 pt-5">
		<p class="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">
			Informations affichées pendant le direct
		</p>
		<div class="flex flex-col gap-4 sm:flex-row sm:items-start">
			<!-- Thumbnail upload -->
			<div class="flex flex-col gap-2">
				<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Vignette</span>
				{#if broadcast.thumbnail_url}
					<button
						type="button"
						onclick={openThumbnail}
						aria-label="Agrandir la vignette"
						class="relative h-28 w-44 overflow-hidden rounded-xl border border-stone-300 bg-cream/40 cursor-zoom-in transition-all hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 group"
					>
						<img
							src={broadcast.thumbnail_url}
							alt="Vignette du direct"
							class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
						/>
						<span class="pointer-events-none absolute inset-0 flex items-end justify-end p-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
							<span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow">
								<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-stone-700">
									<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
								</svg>
							</span>
						</span>
						{#if thumbnailUploading}
							<div class="absolute inset-0 flex items-center justify-center bg-white/80 text-xs font-medium text-stone-600">
								Téléversement…
							</div>
						{/if}
					</button>
				{:else}
					<!-- Default fallback preview — this is what the public site will show -->
					<div class="relative h-28 w-44 overflow-hidden rounded-xl border border-dashed border-stone-300 default-thumbnail-admin">
						<div class="flex h-full w-full flex-col items-center justify-center gap-1.5">
							<picture>
								<source srcset="/icons/logo.webp" type="image/webp" />
								<img src="/icons/logo.png" alt="" class="h-6 w-auto opacity-90" width="150" height="64" />
							</picture>
							<div class="flex items-center gap-1 text-[8px] font-bold uppercase tracking-[0.2em] text-red-600">
								<span class="relative inline-flex h-1 w-1">
									<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"></span>
									<span class="relative inline-flex h-1 w-1 rounded-full bg-red-500"></span>
								</span>
								En direct
							</div>
						</div>
						<span class="absolute bottom-1 left-1 rounded-sm bg-stone-900/70 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-white">
							Défaut
						</span>
						{#if thumbnailUploading}
							<div class="absolute inset-0 flex items-center justify-center bg-white/80 text-xs font-medium text-stone-600">
								Téléversement…
							</div>
						{/if}
					</div>
				{/if}
				<div class="flex gap-2">
					<label class="cursor-pointer rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:border-primary hover:text-primary">
						{broadcast.thumbnail_url ? 'Changer' : 'Téléverser'}
						<input
							type="file"
							accept="image/jpeg,image/png,image/webp,image/gif"
							class="hidden"
							onchange={onThumbnailFileChange}
							disabled={thumbnailUploading}
						/>
					</label>
					{#if broadcast.thumbnail_url}
						<button
							type="button"
							onclick={clearThumbnail}
							disabled={thumbnailUploading}
							class="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-500 transition-colors hover:border-red-200 hover:text-red-600 disabled:opacity-50"
						>
							Retirer
						</button>
					{/if}
				</div>
				<p class="text-[10px] text-stone-400">JPEG, PNG, WebP ou GIF · 5 Mo max</p>
			</div>

			<!-- Title -->
			<div class="flex flex-1 flex-col gap-2">
				<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Titre du direct</span>
				{#if titleEditing}
					<div class="flex gap-2">
						<input
							type="text"
							bind:value={titleDraft}
							placeholder="Ex. Prédication du mercredi"
							maxlength="120"
							class="admin-input flex-1 text-sm"
							onkeydown={(e) => {
								if (e.key === 'Enter') saveBroadcastTitle();
								if (e.key === 'Escape') titleEditing = false;
							}}
						/>
						<button
							type="button"
							onclick={saveBroadcastTitle}
							disabled={titleSaving}
							class="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-missionnaire-600 disabled:opacity-50"
						>
							{titleSaving ? '…' : 'Enregistrer'}
						</button>
						<button
							type="button"
							onclick={() => (titleEditing = false)}
							class="rounded-lg px-2 py-1.5 text-xs text-stone-400 hover:text-stone-600"
						>
							Annuler
						</button>
					</div>
				{:else}
					<div class="flex items-center gap-3">
						<span class="flex-1 text-sm {broadcast.title ? 'text-stone-700' : 'text-stone-400 italic'}">
							{broadcast.title || 'Aucun titre (le site affichera «\u00a0Audio en direct\u00a0»)'}
						</span>
						<button
							type="button"
							onclick={() => {
								titleDraft = broadcast.title ?? '';
								titleEditing = true;
							}}
							class="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:border-primary hover:text-primary"
						>
							Modifier
						</button>
					</div>
				{/if}
				<p class="text-[10px] text-stone-400">
					Persiste entre les directs — modifiable à tout moment.
				</p>
			</div>
		</div>
		{#if thumbnailError}
			<p class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{thumbnailError}</p>
		{/if}
	</div>
</div>

<!-- Recordings table -->
<div class="overflow-hidden rounded-2xl border border-stone-200/60 bg-white">
	<table class="w-full text-left text-sm">
		<thead>
			<tr class="border-b border-stone-100 bg-cream/50">
				<th class="px-5 py-3.5 font-medium text-stone-500">Titre</th>
				<th class="px-5 py-3.5 font-medium text-stone-500">Date</th>
				<th class="px-5 py-3.5 font-medium text-stone-500">Durée</th>
				<th class="px-5 py-3.5 font-medium text-stone-500">Taille</th>
				<th class="px-5 py-3.5 font-medium text-stone-500">Statut</th>
				<th class="px-5 py-3.5 font-medium text-stone-500">Publié</th>
				<th class="px-5 py-3.5 text-right font-medium text-stone-500">Actions</th>
			</tr>
		</thead>
		<tbody>
			{#each data.recordings as rec}
				<tr class="border-b border-stone-50">
					<td class="px-5 py-4">
						{#if editing[rec._id!] !== undefined}
							<input
								type="text"
								bind:value={editing[rec._id!]}
								onblur={() => saveTitle(rec)}
								onkeydown={(e) => {
									if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
									if (e.key === 'Escape') {
										delete editing[rec._id!];
										editing = { ...editing };
									}
								}}
								class="admin-input text-sm"
							/>
						{:else}
							<button
								onclick={() => {
									editing[rec._id!] = rec.title;
									editing = { ...editing };
								}}
								class="text-left font-medium text-stone-700 transition-colors hover:text-primary"
							>
								{rec.title}
							</button>
						{/if}
					</td>
					<td class="px-5 py-4 text-stone-500">{formatDateTime(rec.started_at)}</td>
					<td class="px-5 py-4 font-mono text-xs text-stone-500">{formatDuration(rec.duration_sec)}</td>
					<td class="px-5 py-4 text-stone-500">{formatBytes(rec.size_bytes)}</td>
					<td class="px-5 py-4">
						<span class="inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide {statusClass(rec.status)}">
							{statusLabel[rec.status]}
						</span>
					</td>
					<td class="px-5 py-4">
						<button
							onclick={() => togglePublish(rec)}
							disabled={rec.status !== 'ready'}
							aria-label={rec.published ? 'Dépublier' : 'Publier'}
							title={rec.published ? 'Dépublier' : 'Publier'}
							class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors {rec.published ? 'bg-primary' : 'bg-stone-200'} disabled:opacity-40"
						>
							<span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform {rec.published ? 'translate-x-4' : 'translate-x-0.5'}"></span>
						</button>
					</td>
					<td class="px-5 py-4">
						<div class="flex items-center justify-end gap-2">
							{#if rec.status === 'ready' && rec.s3_url}
								<audio src={rec.s3_url} controls preload="none" class="h-8 w-44"></audio>
							{/if}
							{#if rec.status === 'failed'}
								<button onclick={() => retryUpload(rec._id!)} class="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-200">
									Réessayer
								</button>
							{/if}
							{#if confirmDelete === rec._id}
								<button onclick={() => remove(rec._id!)} class="rounded-lg bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-200">
									Confirmer
								</button>
								<button onclick={() => (confirmDelete = null)} class="rounded-lg px-2 py-1 text-xs text-stone-400 hover:text-stone-600">
									Annuler
								</button>
							{:else}
								<button onclick={() => (confirmDelete = rec._id!)} class="rounded-lg px-2 py-1.5 text-xs text-stone-500 transition-colors hover:bg-red-50 hover:text-red-600" title="Supprimer">
									<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
									</svg>
								</button>
							{/if}
						</div>
					</td>
				</tr>
			{/each}
			{#if data.recordings.length === 0}
				<tr>
					<td colspan="7" class="px-5 py-12 text-center text-stone-400">
						Aucun enregistrement pour l'instant. Démarrez le premier ci-dessus.
					</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>

<svelte:window onkeydown={onLightboxKeydown} />

{#if thumbnailExpanded && broadcast.thumbnail_url}
	<!-- Lightbox: click backdrop or press Escape to close. -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-lightbox-in"
		onclick={onBackdropClick}
		onkeydown={onLightboxKeydown}
		role="dialog"
		aria-modal="true"
		aria-label="Vignette du direct"
		tabindex="-1"
	>
		<button
			type="button"
			onclick={closeThumbnail}
			aria-label="Fermer"
			class="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M6 6l12 12M6 18L18 6" />
			</svg>
		</button>
		<img
			src={broadcast.thumbnail_url}
			alt={broadcast.title || 'Vignette du direct'}
			class="max-h-[90vh] max-w-[90vw] object-contain shadow-2xl"
		/>
	</div>
{/if}

<style>
	.default-thumbnail-admin {
		background:
			radial-gradient(circle at 30% 20%, rgba(255, 136, 12, 0.08), transparent 60%),
			linear-gradient(135deg, #FAF6F1 0%, #F1EAE0 100%);
	}
	.animate-lightbox-in {
		animation: lightbox-fade 0.18s ease-out;
	}
	@keyframes lightbox-fade {
		from { opacity: 0; }
		to { opacity: 1; }
	}
</style>
