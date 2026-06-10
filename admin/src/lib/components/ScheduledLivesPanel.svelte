<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { ScheduledLive } from '../../db/collections';
	import { confirmDialog } from '$lib/stores/confirm-dialog';
	import { toast } from '$lib/stores/toast';

	// Embedded in /recordings, right under the broadcast control card —
	// scheduling lives next to the Go Live controls keeps the whole broadcast
	// workflow on one page. Each entry owns a stable public watch URL
	// (/live/<slug>) shareable before, during and after the live.
	let {
		upcoming,
		past,
		broadcast,
		subscriberCount,
		publicBaseUrl
	}: {
		upcoming: ScheduledLive[];
		past: ScheduledLive[];
		broadcast: { is_live: boolean };
		subscriberCount: number;
		publicBaseUrl: string;
	} = $props();

	function watchUrl(slug: string): string {
		return `${publicBaseUrl}/live/${slug}`;
	}

	function fmtDate(iso: string): string {
		try {
			return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' });
		} catch {
			return iso;
		}
	}

	/** Coarse "Dans 3 jours / Dans 2 h / Dans 45 min" chip, YouTube-style.
	 *  Computed once per render — minute-level drift doesn't matter here. */
	function relativeUntil(iso: string): string {
		const diffMs = Date.parse(iso) - Date.now();
		if (Number.isNaN(diffMs)) return '';
		if (diffMs <= 60_000) return 'Imminent';
		const minutes = Math.round(diffMs / 60_000);
		if (minutes < 60) return `Dans ${minutes} min`;
		const hours = Math.round(minutes / 60);
		if (hours < 24) return `Dans ${hours} h`;
		const days = Math.round(hours / 24);
		return `Dans ${days} jour${days > 1 ? 's' : ''}`;
	}

	function pad(n: number): string {
		return String(n).padStart(2, '0');
	}

	/** ISO → value for <input type="datetime-local"> (admin's local timezone). */
	function isoToLocalInput(iso: string): string {
		const d = new Date(iso);
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	async function copyLink(slug: string) {
		try {
			await navigator.clipboard.writeText(watchUrl(slug));
			toast.success('Lien copié');
		} catch {
			toast.error('Impossible de copier le lien');
		}
	}

	// History hidden by default — the page already carries a lot; expand on demand.
	let showPast = $state(false);

	// ── Create / edit modal ────────────────────────────────────────
	let modalOpen = $state(false);
	let editingId = $state<string | null>(null);
	let saving = $state(false);
	let formError = $state<string | null>(null);
	let titleDraft = $state('');
	let descriptionDraft = $state('');
	let scheduledAtDraft = $state(''); // datetime-local value, admin-local time
	let announceDraft = $state(true);
	let reminderDraft = $state(false);
	// Thumbnail staging — uploaded on save so cancel doesn't leave S3 orphans.
	let thumbnailFile = $state<File | null>(null);
	let thumbnailPreviewUrl = $state<string | null>(null);
	let thumbnailAction = $state<'keep' | 'replace' | 'remove'>('keep');
	let existingThumbnailUrl = $state<string | null>(null);

	const previewSrc = $derived.by(() => {
		if (thumbnailPreviewUrl) return thumbnailPreviewUrl;
		if (thumbnailAction === 'remove') return null;
		return existingThumbnailUrl;
	});

	function resetForm() {
		titleDraft = '';
		descriptionDraft = '';
		scheduledAtDraft = '';
		announceDraft = true;
		reminderDraft = false;
		if (thumbnailPreviewUrl) URL.revokeObjectURL(thumbnailPreviewUrl);
		thumbnailPreviewUrl = null;
		thumbnailFile = null;
		thumbnailAction = 'keep';
		existingThumbnailUrl = null;
		formError = null;
	}

	function openCreate() {
		resetForm();
		editingId = null;
		// Suggest the next round hour as a starting point.
		const next = new Date(Date.now() + 60 * 60 * 1000);
		next.setMinutes(0, 0, 0);
		scheduledAtDraft = isoToLocalInput(next.toISOString());
		modalOpen = true;
	}

	function openEdit(entry: ScheduledLive) {
		resetForm();
		editingId = entry._id;
		titleDraft = entry.title;
		descriptionDraft = entry.description ?? '';
		scheduledAtDraft = isoToLocalInput(entry.scheduled_at);
		announceDraft = false; // already created — re-announce only if explicitly re-checked
		reminderDraft = entry.reminder_enabled;
		existingThumbnailUrl = entry.thumbnail_url;
		modalOpen = true;
	}

	function closeModal() {
		modalOpen = false;
		resetForm();
	}

	function onThumbnailFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			formError = 'Sélectionnez un fichier image';
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			formError = 'Image trop volumineuse (max 5 Mo)';
			return;
		}
		formError = null;
		if (thumbnailPreviewUrl) URL.revokeObjectURL(thumbnailPreviewUrl);
		thumbnailFile = file;
		thumbnailPreviewUrl = URL.createObjectURL(file);
		thumbnailAction = 'replace';
	}

	function markThumbnailForRemoval() {
		if (thumbnailPreviewUrl) URL.revokeObjectURL(thumbnailPreviewUrl);
		thumbnailPreviewUrl = null;
		thumbnailFile = null;
		thumbnailAction = 'remove';
	}

	/** Uploads the staged file (or signals removal). Only called when
	 *  thumbnailAction !== 'keep'. Returns null on failure (formError is set). */
	async function uploadThumbnailIfNeeded(): Promise<{
		thumbnail_url: string | null;
		thumbnail_s3_key: string | null;
	} | null> {
		if (thumbnailAction === 'remove') {
			return { thumbnail_url: null, thumbnail_s3_key: null };
		}
		if (!thumbnailFile) return null;
		const presignRes = await fetch('/api/broadcast/thumbnail/presign', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ contentType: thumbnailFile.type, size: thumbnailFile.size })
		});
		if (!presignRes.ok) {
			formError = (await presignRes.text()) || `Erreur ${presignRes.status}`;
			return null;
		}
		const { uploadUrl, key, publicUrl } = (await presignRes.json()) as {
			uploadUrl: string;
			key: string;
			publicUrl: string;
		};
		const uploadRes = await fetch(uploadUrl, {
			method: 'PUT',
			headers: { 'Content-Type': thumbnailFile.type },
			body: thumbnailFile
		});
		if (!uploadRes.ok) {
			formError = 'Échec du téléversement vers S3';
			return null;
		}
		return { thumbnail_url: publicUrl, thumbnail_s3_key: key };
	}

	async function saveEntry() {
		if (saving) return;
		if (!titleDraft.trim()) {
			formError = 'Titre requis';
			return;
		}
		if (!scheduledAtDraft) {
			formError = 'Date et heure requises';
			return;
		}
		const scheduledIso = new Date(scheduledAtDraft).toISOString();
		saving = true;
		formError = null;
		try {
			const body: Record<string, unknown> = {
				title: titleDraft.trim(),
				description: descriptionDraft.trim() || null,
				scheduled_at: scheduledIso,
				reminder_enabled: reminderDraft
			};

			if (thumbnailAction !== 'keep') {
				const thumb = await uploadThumbnailIfNeeded();
				if (!thumb) return;
				body.thumbnail_url = thumb.thumbnail_url;
				body.thumbnail_s3_key = thumb.thumbnail_s3_key;
			}

			if (announceDraft) body.announce = true;

			const res = editingId
				? await fetch(`/api/scheduled-lives/${editingId}`, {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(body)
					})
				: await fetch('/api/scheduled-lives', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(body)
					});

			if (!res.ok) {
				formError = (await res.text()) || `Erreur ${res.status}`;
				return;
			}

			if (!editingId) {
				const payload = (await res.json()) as { shareUrl?: string };
				if (payload.shareUrl) {
					try {
						await navigator.clipboard.writeText(payload.shareUrl);
						toast.success('Direct programmé — lien de partage copié');
					} catch {
						toast.success('Direct programmé');
					}
				}
			} else {
				toast.success('Direct mis à jour');
			}
			closeModal();
			await invalidateAll();
		} finally {
			saving = false;
		}
	}

	// ── Row actions ────────────────────────────────────────────────
	let busyId = $state<string | null>(null);

	async function startLive(entry: ScheduledLive) {
		if (busyId) return;
		if (broadcast.is_live) {
			toast.error('Un direct est déjà en cours — terminez-le avant d’en démarrer un autre');
			return;
		}
		const willNotify = subscriberCount > 0;
		const ok = await confirmDialog.ask({
			title: 'Démarrer le direct',
			message: willNotify
				? `« ${entry.title} » passera en direct et ${subscriberCount} abonné${subscriberCount > 1 ? 's seront notifiés' : ' sera notifié'}.`
				: `« ${entry.title} » passera en direct.`,
			confirmLabel: willNotify ? 'Diffuser et notifier' : 'Démarrer le direct',
			cancelLabel: 'Annuler'
		});
		if (!ok) return;
		busyId = entry._id;
		try {
			const res = await fetch('/api/broadcast/go-live', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notify: true, scheduledLiveId: entry._id })
			});
			if (!res.ok) {
				toast.error((await res.text()) || `Erreur ${res.status}`);
				return;
			}
			toast.success('Le direct a commencé');
			await invalidateAll();
		} finally {
			busyId = null;
		}
	}

	async function cancelEntry(entry: ScheduledLive) {
		if (busyId) return;
		const ok = await confirmDialog.ask({
			title: 'Annuler ce direct',
			message: `« ${entry.title} » sera marqué comme annulé. Le lien de partage affichera « direct annulé ».`,
			confirmLabel: 'Annuler le direct',
			cancelLabel: 'Retour',
			tone: 'warning'
		});
		if (!ok) return;
		busyId = entry._id;
		try {
			const res = await fetch(`/api/scheduled-lives/${entry._id}/cancel`, { method: 'POST' });
			if (!res.ok) {
				toast.error((await res.text()) || `Erreur ${res.status}`);
				return;
			}
			toast.success('Direct annulé');
			await invalidateAll();
		} finally {
			busyId = null;
		}
	}

	async function deleteEntry(entry: ScheduledLive) {
		if (busyId) return;
		const ok = await confirmDialog.ask({
			title: 'Supprimer cette entrée',
			message: `« ${entry.title} » sera supprimé définitivement. Son lien de partage cessera de fonctionner.`,
			confirmLabel: 'Supprimer',
			cancelLabel: 'Annuler',
			tone: 'danger'
		});
		if (!ok) return;
		busyId = entry._id;
		try {
			const res = await fetch(`/api/scheduled-lives/${entry._id}`, { method: 'DELETE' });
			if (!res.ok) {
				toast.error((await res.text()) || `Erreur ${res.status}`);
				return;
			}
			toast.success('Entrée supprimée');
			await invalidateAll();
		} finally {
			busyId = null;
		}
	}

	function statusBadge(entry: ScheduledLive): { label: string; cls: string } {
		switch (entry.status) {
			case 'live':
				return { label: 'En direct', cls: 'bg-red-50 text-red-700 border-red-200' };
			case 'scheduled':
				return { label: 'Programmé', cls: 'bg-orange-50 text-primary border-orange-200' };
			case 'ended':
				return { label: 'Terminé', cls: 'bg-stone-100 text-stone-600 border-stone-200' };
			default:
				return { label: 'Annulé', cls: 'bg-stone-50 text-stone-400 border-stone-200' };
		}
	}
</script>

<div class="mb-8 border border-stone-200/60 bg-white/40 p-6">
	<!-- Section header — same label/action pattern as the broadcast metadata section -->
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0 flex-1">
			<p class="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">
				Directs programmés
				{#if upcoming.length > 0}
					<span class="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/10 px-1 text-[9px] font-bold text-primary">
						{upcoming.length}
					</span>
				{/if}
			</p>
			<p class="mt-1 text-[10px] text-stone-400">
				Chaque direct programmé reçoit un lien de partage stable — utilisable avant, pendant et
				après la diffusion.
			</p>
		</div>
		<button
			type="button"
			onclick={openCreate}
			class="inline-flex shrink-0 items-center gap-1.5 border border-primary bg-primary px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white shadow-sm shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-md"
		>
			<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
			</svg>
			Programmer un direct
		</button>
	</div>

	<!-- Upcoming -->
	{#if upcoming.length === 0}
		<div class="mt-5 flex flex-col items-center border border-dashed border-stone-200 bg-stone-50/40 px-6 py-8 text-center">
			<svg class="mb-2.5 h-8 w-8 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
			</svg>
			<p class="text-sm font-medium text-stone-500">Aucun direct programmé</p>
			<p class="mt-1 max-w-sm text-xs leading-relaxed text-stone-400">
				Programmez un direct pour obtenir immédiatement un lien de partage et annoncer la
				diffusion aux abonnés.
			</p>
		</div>
	{:else}
		<div class="mt-5 space-y-4">
			{#each upcoming as entry (entry._id)}
				{@const badge = statusBadge(entry)}
				<div class="border bg-white/60 p-5 {entry.status === 'live' ? 'border-red-200' : 'border-stone-200/60'}">
					<div class="flex flex-col gap-4 sm:flex-row">
						<!-- Thumbnail -->
						<div class="h-24 w-full shrink-0 overflow-hidden border border-stone-200/60 bg-stone-100 sm:w-40">
							{#if entry.thumbnail_url}
								<img src={entry.thumbnail_url} alt={entry.title} class="h-full w-full object-cover" />
							{:else}
								<div class="flex h-full w-full items-center justify-center text-stone-300">
									<svg class="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M5.6 5.6a9 9 0 000 12.8M8.4 8.4a5 5 0 000 7.2m10-12.8a9 9 0 010 12.8m-2.8-9.2a5 5 0 010 7.2M12 12h.01" />
									</svg>
								</div>
							{/if}
						</div>

						<!-- Infos -->
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<span class="border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] {badge.cls}">
									{badge.label}
								</span>
								{#if entry.status === 'scheduled'}
									<span class="border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-semibold text-stone-500">
										{relativeUntil(entry.scheduled_at)}
									</span>
								{/if}
								{#if entry.announced_at}
									<span class="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-600">
										<svg class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3" aria-hidden="true">
											<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
										</svg>
										Annoncé
									</span>
								{/if}
								{#if entry.reminder_enabled}
									<span class="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-400">
										Rappel activé
									</span>
								{/if}
							</div>
							<h3 class="mt-1.5 truncate font-display text-lg font-semibold text-stone-800">
								{entry.title}
							</h3>
							<p class="inline-flex items-center gap-1.5 text-[13px] text-stone-500">
								<svg class="h-3.5 w-3.5 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
									<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
								</svg>
								{fmtDate(entry.scheduled_at)}
							</p>

							<!-- Share link -->
							<div class="mt-3 flex items-center gap-2">
								<code class="min-w-0 flex-1 truncate border border-stone-200/60 bg-stone-50 px-3 py-1.5 text-[11px] text-stone-500">
									{watchUrl(entry.slug)}
								</code>
								<button
									type="button"
									class="shrink-0 border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-stone-600 transition-colors hover:border-primary hover:bg-primary hover:text-white"
									onclick={() => copyLink(entry.slug)}
								>
									Copier
								</button>
								<a
									href={watchUrl(entry.slug)}
									target="_blank"
									rel="noopener noreferrer"
									class="shrink-0 border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-stone-600 transition-colors hover:border-stone-900 hover:bg-stone-900 hover:text-white"
								>
									Ouvrir
								</a>
							</div>
						</div>
					</div>

					<!-- Actions -->
					{#if entry.status === 'scheduled'}
						<div class="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-4">
							<button
								type="button"
								class="inline-flex items-center gap-2 border border-orange-200 bg-orange-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-primary transition-all hover:border-primary hover:bg-primary hover:text-white disabled:opacity-50"
								disabled={busyId === entry._id || broadcast.is_live}
								onclick={() => startLive(entry)}
							>
								<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
									<path stroke-linecap="round" stroke-linejoin="round" d="M5.6 5.6a9 9 0 000 12.8M8.4 8.4a5 5 0 000 7.2m10-12.8a9 9 0 010 12.8m-2.8-9.2a5 5 0 010 7.2M12 12h.01" />
								</svg>
								Démarrer le direct
							</button>
							<button
								type="button"
								class="border border-stone-200 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-stone-600 transition-colors hover:border-stone-900 hover:bg-stone-900 hover:text-white disabled:opacity-50"
								disabled={busyId === entry._id}
								onclick={() => openEdit(entry)}
							>
								Modifier
							</button>
							<button
								type="button"
								class="border border-rose-200 bg-rose-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-700 transition-colors hover:border-rose-600 hover:bg-rose-600 hover:text-white disabled:opacity-50"
								disabled={busyId === entry._id}
								onclick={() => cancelEntry(entry)}
							>
								Annuler
							</button>
							{#if broadcast.is_live}
								<span class="text-[11px] text-stone-400">
									Un direct est déjà en cours
								</span>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<!-- Past (collapsed by default) -->
	{#if past.length > 0}
		<button
			type="button"
			class="mt-5 flex w-full items-center gap-2 text-left text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400 transition-colors hover:text-stone-600"
			onclick={() => (showPast = !showPast)}
		>
			<svg
				class="h-3 w-3 transition-transform {showPast ? 'rotate-90' : ''}"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2.5"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
			</svg>
			Historique ({past.length})
		</button>
		{#if showPast}
			<div class="mt-3 divide-y divide-stone-100 border border-stone-200/60 bg-white/60">
				{#each past as entry (entry._id)}
					{@const badge = statusBadge(entry)}
					<div class="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-stone-50/60">
						<span class="border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] {badge.cls}">
							{badge.label}
						</span>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-stone-700">{entry.title}</p>
							<p class="text-[11px] text-stone-400">{fmtDate(entry.scheduled_at)}</p>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							{#if entry.status === 'ended' && entry.recording_id}
								<a
									href={`${publicBaseUrl}/live/rediffusions/${entry.recording_id}`}
									target="_blank"
									rel="noopener noreferrer"
									class="text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
								>
									Rediffusion
								</a>
							{/if}
							<button
								type="button"
								class="border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-500 transition-colors hover:border-primary hover:bg-primary hover:text-white"
								onclick={() => copyLink(entry.slug)}
							>
								Copier le lien
							</button>
							<button
								type="button"
								class="border border-transparent px-2 py-1 text-[11px] font-semibold text-stone-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
								disabled={busyId === entry._id}
								onclick={() => deleteEntry(entry)}
							>
								Supprimer
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<!-- Create / edit modal -->
{#if modalOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button
			type="button"
			class="absolute inset-0 bg-stone-900/40 backdrop-blur-[2px]"
			onclick={closeModal}
			aria-label="Fermer"
		></button>
		<div class="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl">
			<h2 class="font-display text-xl font-semibold text-stone-800">
				{editingId ? 'Modifier le direct' : 'Programmer un direct'}
			</h2>
			<p class="mt-1 text-xs text-stone-400">
				{editingId
					? 'Le lien de partage reste inchangé.'
					: 'Un lien de partage stable est créé immédiatement — partageable avant le direct.'}
			</p>

			<div class="mt-5 space-y-4">
				<div>
					<label for="direct-title" class="mb-1 block text-xs font-semibold text-stone-600">
						Titre <span class="text-rose-500">*</span>
					</label>
					<input
						id="direct-title"
						type="text"
						maxlength="120"
						bind:value={titleDraft}
						placeholder="ex. Réunion du mercredi soir"
						class="w-full border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-primary focus:outline-none"
					/>
				</div>

				<div>
					<label for="direct-datetime" class="mb-1 block text-xs font-semibold text-stone-600">
						Date et heure <span class="text-rose-500">*</span>
						<span class="ml-1 font-normal text-stone-400">(heure locale)</span>
					</label>
					<input
						id="direct-datetime"
						type="datetime-local"
						bind:value={scheduledAtDraft}
						class="w-full border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-primary focus:outline-none"
					/>
				</div>

				<div>
					<label for="direct-description" class="mb-1 block text-xs font-semibold text-stone-600">
						Description
					</label>
					<textarea
						id="direct-description"
						rows="3"
						maxlength="2000"
						bind:value={descriptionDraft}
						placeholder="Visible sur la page publique du direct"
						class="w-full border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-primary focus:outline-none"
					></textarea>
				</div>

				<!-- Thumbnail -->
				<div>
					<span class="mb-1 block text-xs font-semibold text-stone-600">Vignette</span>
					<div class="flex items-center gap-3">
						<div class="h-16 w-28 shrink-0 overflow-hidden border border-stone-200 bg-stone-50">
							{#if previewSrc}
								<img src={previewSrc} alt="Vignette" class="h-full w-full object-cover" />
							{:else}
								<div class="flex h-full w-full items-center justify-center text-[10px] text-stone-300">
									Aucune
								</div>
							{/if}
						</div>
						<div class="flex flex-col gap-1.5">
							<label
								class="cursor-pointer border border-stone-200 bg-white px-3 py-1.5 text-center text-[11px] font-semibold text-stone-600 transition-colors hover:border-primary hover:text-primary"
							>
								{previewSrc ? 'Remplacer' : 'Choisir une image'}
								<input type="file" accept="image/*" class="hidden" onchange={onThumbnailFileChange} />
							</label>
							{#if previewSrc}
								<button
									type="button"
									class="border border-transparent px-3 py-1 text-[11px] font-semibold text-stone-400 hover:text-rose-600"
									onclick={markThumbnailForRemoval}
								>
									Retirer
								</button>
							{/if}
						</div>
					</div>
				</div>

				<!-- Notifications -->
				<div class="space-y-2 border border-stone-100 bg-stone-50/60 p-3">
					<label class="flex items-start gap-2.5">
						<input type="checkbox" bind:checked={announceDraft} class="mt-0.5 accent-[#FF880C]" />
						<span class="text-xs text-stone-600">
							<span class="font-semibold">Annoncer aux abonnés</span>
							({subscriberCount} abonné{subscriberCount > 1 ? 's' : ''}) — notification « Live à venir »
							envoyée {editingId ? 'après modification' : 'à la création'}
						</span>
					</label>
					<label class="flex items-start gap-2.5">
						<input type="checkbox" bind:checked={reminderDraft} class="mt-0.5 accent-[#FF880C]" />
						<span class="text-xs text-stone-600">
							<span class="font-semibold">Rappel automatique</span> — notification « commence bientôt »
							environ 30 minutes avant le début
						</span>
					</label>
				</div>

				{#if formError}
					<p class="border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{formError}</p>
				{/if}
			</div>

			<div class="mt-6 flex justify-end gap-2">
				<button type="button" class="admin-btn-secondary" onclick={closeModal} disabled={saving}>
					Annuler
				</button>
				<button type="button" class="admin-btn-primary disabled:opacity-50" onclick={saveEntry} disabled={saving}>
					{saving ? 'Enregistrement…' : editingId ? 'Enregistrer' : 'Programmer'}
				</button>
			</div>
		</div>
	</div>
{/if}
