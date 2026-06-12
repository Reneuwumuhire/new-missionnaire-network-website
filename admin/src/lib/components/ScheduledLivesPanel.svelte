<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { ScheduledLive } from '../../db/collections';
	import { confirmDialog } from '$lib/stores/confirm-dialog';
	import { toast } from '$lib/stores/toast';
	import { t, type TranslationKey } from '$lib/i18n';
	import { parseSrt } from '$lib/utils/srt';

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
		if (diffMs <= 60_000) return $t('recordings.scheduled.imminent');
		const minutes = Math.round(diffMs / 60_000);
		if (minutes < 60) return $t('recordings.scheduled.inMinutes', { count: minutes });
		const hours = Math.round(minutes / 60);
		if (hours < 24) return $t('recordings.scheduled.inHours', { count: hours });
		const days = Math.round(hours / 24);
		return days > 1
			? $t('recordings.scheduled.inDaysMany', { count: days })
			: $t('recordings.scheduled.inDaysOne', { count: days });
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
			toast.success($t('recordings.toast.linkCopied'));
		} catch {
			toast.error($t('recordings.toast.linkCopyFailed'));
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
	// Subtitle (SRT) staging — same upload-on-save pattern as the thumbnail.
	let subtitleFile = $state<File | null>(null);
	let subtitleAction = $state<'keep' | 'replace' | 'remove'>('keep');
	let existingSubtitleFilename = $state<string | null>(null);
	let subtitleCueCount = $state<number | null>(null);
	let subtitleDurationLabel = $state<string | null>(null);

	const subtitleDisplayName = $derived.by(() => {
		if (subtitleFile) return subtitleFile.name;
		if (subtitleAction === 'remove') return null;
		return existingSubtitleFilename;
	});

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
		subtitleFile = null;
		subtitleAction = 'keep';
		existingSubtitleFilename = null;
		subtitleCueCount = null;
		subtitleDurationLabel = null;
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
		existingSubtitleFilename = entry.subtitle_filename;
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
			formError = $t('recordings.error.selectImage');
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			formError = $t('recordings.error.imageTooLarge');
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

	async function onSubtitleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (!file.name.toLowerCase().endsWith('.srt')) {
			formError = $t('recordings.error.selectSrt');
			return;
		}
		if (file.size > 2 * 1024 * 1024) {
			formError = $t('recordings.error.srtTooLarge');
			return;
		}
		// Sanity-parse before staging: a 0-cue file would silently show nothing
		// to listeners, better to reject it at upload time.
		const cues = parseSrt(await file.text());
		if (cues.length === 0) {
			formError = $t('recordings.error.srtUnreadable');
			return;
		}
		formError = null;
		subtitleFile = file;
		subtitleAction = 'replace';
		subtitleCueCount = cues.length;
		const totalMin = Math.round(cues[cues.length - 1].endMs / 60_000);
		subtitleDurationLabel =
			totalMin >= 60 ? `${Math.floor(totalMin / 60)}h${String(totalMin % 60).padStart(2, '0')}` : $t('recordings.scheduled.durationMin', { count: totalMin });
	}

	function markSubtitleForRemoval() {
		subtitleFile = null;
		subtitleAction = 'remove';
		subtitleCueCount = null;
		subtitleDurationLabel = null;
	}

	/** Uploads the staged SRT (or signals removal). Only called when
	 *  subtitleAction !== 'keep'. Returns null on failure (formError is set). */
	async function uploadSubtitleIfNeeded(): Promise<{
		subtitle_srt_url: string | null;
		subtitle_srt_s3_key: string | null;
		subtitle_filename: string | null;
	} | null> {
		if (subtitleAction === 'remove') {
			return { subtitle_srt_url: null, subtitle_srt_s3_key: null, subtitle_filename: null };
		}
		if (!subtitleFile) return null;
		const presignRes = await fetch('/api/broadcast/subtitles/presign', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ filename: subtitleFile.name, size: subtitleFile.size })
		});
		if (!presignRes.ok) {
			formError = (await presignRes.text()) || $t('recordings.error.http', { status: presignRes.status });
			return null;
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
			body: subtitleFile
		});
		if (!uploadRes.ok) {
			formError = $t('recordings.error.srtUploadFailed');
			return null;
		}
		return {
			subtitle_srt_url: publicUrl,
			subtitle_srt_s3_key: key,
			subtitle_filename: subtitleFile.name
		};
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
			formError = (await presignRes.text()) || $t('recordings.error.http', { status: presignRes.status });
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
			formError = $t('recordings.error.s3UploadFailed');
			return null;
		}
		return { thumbnail_url: publicUrl, thumbnail_s3_key: key };
	}

	async function saveEntry() {
		if (saving) return;
		if (!titleDraft.trim()) {
			formError = $t('recordings.error.titleRequired');
			return;
		}
		if (!scheduledAtDraft) {
			formError = $t('recordings.error.dateTimeRequired');
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

			if (subtitleAction !== 'keep') {
				const subtitle = await uploadSubtitleIfNeeded();
				if (!subtitle) return;
				body.subtitle_srt_url = subtitle.subtitle_srt_url;
				body.subtitle_srt_s3_key = subtitle.subtitle_srt_s3_key;
				body.subtitle_filename = subtitle.subtitle_filename;
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
				formError = (await res.text()) || $t('recordings.error.http', { status: res.status });
				return;
			}

			if (!editingId) {
				const payload = (await res.json()) as { shareUrl?: string };
				if (payload.shareUrl) {
					try {
						await navigator.clipboard.writeText(payload.shareUrl);
						toast.success($t('recordings.scheduled.toast.createdLinkCopied'));
					} catch {
						toast.success($t('recordings.scheduled.toast.created'));
					}
				}
			} else {
				toast.success($t('recordings.scheduled.toast.updated'));
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
			toast.error($t('recordings.scheduled.error.alreadyLive'));
			return;
		}
		const willNotify = subscriberCount > 0;
		const ok = await confirmDialog.ask({
			title: $t('recordings.scheduled.startLive'),
			message: willNotify
				? subscriberCount > 1
					? $t('recordings.scheduled.confirm.startNotifyMany', { title: entry.title, count: subscriberCount })
					: $t('recordings.scheduled.confirm.startNotifyOne', { title: entry.title, count: subscriberCount })
				: $t('recordings.scheduled.confirm.start', { title: entry.title }),
			confirmLabel: willNotify ? $t('recordings.confirm.goLive.confirmNotify') : $t('recordings.scheduled.startLive'),
			cancelLabel: $t('recordings.common.cancel')
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
				toast.error((await res.text()) || $t('recordings.error.http', { status: res.status }));
				return;
			}
			toast.success($t('recordings.scheduled.toast.started'));
			await invalidateAll();
		} finally {
			busyId = null;
		}
	}

	async function cancelEntry(entry: ScheduledLive) {
		if (busyId) return;
		const ok = await confirmDialog.ask({
			title: $t('recordings.scheduled.confirm.cancelTitle'),
			message: $t('recordings.scheduled.confirm.cancelMessage', { title: entry.title }),
			confirmLabel: $t('recordings.scheduled.confirm.cancelConfirm'),
			cancelLabel: $t('recordings.scheduled.confirm.back'),
			tone: 'warning'
		});
		if (!ok) return;
		busyId = entry._id;
		try {
			const res = await fetch(`/api/scheduled-lives/${entry._id}/cancel`, { method: 'POST' });
			if (!res.ok) {
				toast.error((await res.text()) || $t('recordings.error.http', { status: res.status }));
				return;
			}
			toast.success($t('recordings.scheduled.toast.cancelled'));
			await invalidateAll();
		} finally {
			busyId = null;
		}
	}

	async function deleteEntry(entry: ScheduledLive) {
		if (busyId) return;
		const ok = await confirmDialog.ask({
			title: $t('recordings.scheduled.confirm.deleteTitle'),
			message: $t('recordings.scheduled.confirm.deleteMessage', { title: entry.title }),
			confirmLabel: $t('recordings.common.delete'),
			cancelLabel: $t('recordings.common.cancel'),
			tone: 'danger'
		});
		if (!ok) return;
		busyId = entry._id;
		try {
			const res = await fetch(`/api/scheduled-lives/${entry._id}`, { method: 'DELETE' });
			if (!res.ok) {
				toast.error((await res.text()) || $t('recordings.error.http', { status: res.status }));
				return;
			}
			toast.success($t('recordings.scheduled.toast.deleted'));
			await invalidateAll();
		} finally {
			busyId = null;
		}
	}

	function statusBadge(entry: ScheduledLive): { label: TranslationKey; cls: string } {
		switch (entry.status) {
			case 'live':
				return { label: 'recordings.scheduled.status.live', cls: 'bg-red-50 text-red-700 border-red-200' };
			case 'scheduled':
				return { label: 'recordings.scheduled.status.scheduled', cls: 'bg-orange-50 text-primary border-orange-200' };
			case 'ended':
				return { label: 'recordings.scheduled.status.ended', cls: 'bg-stone-100 text-stone-600 border-stone-200' };
			default:
				return { label: 'recordings.scheduled.status.cancelled', cls: 'bg-stone-50 text-stone-400 border-stone-200' };
		}
	}
</script>

<div class="mb-8 border border-stone-200/60 bg-white/40 p-6">
	<!-- Section header — same label/action pattern as the broadcast metadata section -->
	<div class="flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0 flex-1">
			<p class="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">
				{$t('recordings.scheduled.title')}
				{#if upcoming.length > 0}
					<span class="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/10 px-1 text-[9px] font-bold text-primary">
						{upcoming.length}
					</span>
				{/if}
			</p>
			<p class="mt-1 text-[10px] text-stone-400">
				{$t('recordings.scheduled.intro')}
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
			{$t('recordings.scheduled.schedule')}
		</button>
	</div>

	<!-- Upcoming -->
	{#if upcoming.length === 0}
		<div class="mt-5 flex flex-col items-center border border-dashed border-stone-200 bg-stone-50/40 px-6 py-8 text-center">
			<svg class="mb-2.5 h-8 w-8 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
			</svg>
			<p class="text-sm font-medium text-stone-500">{$t('recordings.scheduled.emptyTitle')}</p>
			<p class="mt-1 max-w-sm text-xs leading-relaxed text-stone-400">
				{$t('recordings.scheduled.emptyBody')}
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
									{$t(badge.label)}
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
										{$t('recordings.scheduled.announced')}
									</span>
								{/if}
								{#if entry.reminder_enabled}
									<span class="text-[10px] font-semibold uppercase tracking-[0.1em] text-stone-400">
										{$t('recordings.scheduled.reminderOn')}
									</span>
								{/if}
								{#if entry.subtitle_filename}
									<span
										class="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-sky-600"
										title={entry.subtitle_filename}
									>
										<svg class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
											<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h10" />
										</svg>
										{$t('recordings.scheduled.transcript')}
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
									{$t('recordings.common.copy')}
								</button>
								<a
									href={watchUrl(entry.slug)}
									target="_blank"
									rel="noopener noreferrer"
									class="shrink-0 border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-stone-600 transition-colors hover:border-stone-900 hover:bg-stone-900 hover:text-white"
								>
									{$t('recordings.common.open')}
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
								{$t('recordings.scheduled.startLive')}
							</button>
							<button
								type="button"
								class="border border-stone-200 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-stone-600 transition-colors hover:border-stone-900 hover:bg-stone-900 hover:text-white disabled:opacity-50"
								disabled={busyId === entry._id}
								onclick={() => openEdit(entry)}
							>
								{$t('recordings.common.edit')}
							</button>
							<button
								type="button"
								class="border border-rose-200 bg-rose-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-700 transition-colors hover:border-rose-600 hover:bg-rose-600 hover:text-white disabled:opacity-50"
								disabled={busyId === entry._id}
								onclick={() => cancelEntry(entry)}
							>
								{$t('recordings.common.cancel')}
							</button>
							{#if broadcast.is_live}
								<span class="text-[11px] text-stone-400">
									{$t('recordings.scheduled.alreadyLiveShort')}
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
			{$t('recordings.scheduled.history', { count: past.length })}
		</button>
		{#if showPast}
			<div class="mt-3 divide-y divide-stone-100 border border-stone-200/60 bg-white/60">
				{#each past as entry (entry._id)}
					{@const badge = statusBadge(entry)}
					<div class="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-stone-50/60">
						<span class="border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] {badge.cls}">
							{$t(badge.label)}
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
									{$t('recordings.scheduled.replay')}
								</a>
							{/if}
							<button
								type="button"
								class="border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-500 transition-colors hover:border-primary hover:bg-primary hover:text-white"
								onclick={() => copyLink(entry.slug)}
							>
								{$t('recordings.scheduled.copyLink')}
							</button>
							<button
								type="button"
								class="border border-transparent px-2 py-1 text-[11px] font-semibold text-stone-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
								disabled={busyId === entry._id}
								onclick={() => deleteEntry(entry)}
							>
								{$t('recordings.common.delete')}
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
			aria-label={$t('recordings.common.close')}
		></button>
		<div class="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl">
			<h2 class="font-display text-xl font-semibold text-stone-800">
				{editingId ? $t('recordings.scheduled.editTitle') : $t('recordings.scheduled.schedule')}
			</h2>
			<p class="mt-1 text-xs text-stone-400">
				{editingId
					? $t('recordings.scheduled.editHint')
					: $t('recordings.scheduled.createHint')}
			</p>

			<div class="mt-5 space-y-4">
				<div>
					<label for="direct-title" class="mb-1 block text-xs font-semibold text-stone-600">
						{$t('recordings.common.title')} <span class="text-rose-500">*</span>
					</label>
					<input
						id="direct-title"
						type="text"
						maxlength="120"
						bind:value={titleDraft}
						placeholder={$t('recordings.scheduled.titlePlaceholder')}
						class="w-full border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-primary focus:outline-none"
					/>
				</div>

				<div>
					<label for="direct-datetime" class="mb-1 block text-xs font-semibold text-stone-600">
						{$t('recordings.scheduled.dateTimeLabel')} <span class="text-rose-500">*</span>
						<span class="ml-1 font-normal text-stone-400">{$t('recordings.scheduled.localTime')}</span>
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
						{$t('recordings.common.description')}
					</label>
					<textarea
						id="direct-description"
						rows="3"
						maxlength="2000"
						bind:value={descriptionDraft}
						placeholder={$t('recordings.scheduled.descriptionPlaceholder')}
						class="w-full border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-primary focus:outline-none"
					></textarea>
				</div>

				<!-- Thumbnail -->
				<div>
					<span class="mb-1 block text-xs font-semibold text-stone-600">{$t('recordings.common.thumbnail')}</span>
					<div class="flex items-center gap-3">
						<div class="h-16 w-28 shrink-0 overflow-hidden border border-stone-200 bg-stone-50">
							{#if previewSrc}
								<img src={previewSrc} alt={$t('recordings.common.thumbnail')} class="h-full w-full object-cover" />
							{:else}
								<div class="flex h-full w-full items-center justify-center text-[10px] text-stone-300">
									{$t('recordings.scheduled.noneThumb')}
								</div>
							{/if}
						</div>
						<div class="flex flex-col gap-1.5">
							<label
								class="cursor-pointer border border-stone-200 bg-white px-3 py-1.5 text-center text-[11px] font-semibold text-stone-600 transition-colors hover:border-primary hover:text-primary"
							>
								{previewSrc ? $t('recordings.common.replace') : $t('recordings.scheduled.chooseImage')}
								<input type="file" accept="image/*" class="hidden" onchange={onThumbnailFileChange} />
							</label>
							{#if previewSrc}
								<button
									type="button"
									class="border border-transparent px-3 py-1 text-[11px] font-semibold text-stone-400 hover:text-rose-600"
									onclick={markThumbnailForRemoval}
								>
									{$t('recordings.common.remove')}
								</button>
							{/if}
						</div>
					</div>
				</div>

				<!-- Subtitle (SRT) -->
				<div>
					<span class="mb-1 block text-xs font-semibold text-stone-600">
						{$t('recordings.scheduled.srtLabel')}
					</span>
					<p class="mb-2 text-[11px] leading-relaxed text-stone-400">
						{$t('recordings.scheduled.srtHint')}
					</p>
					<div class="flex items-center gap-3">
						{#if subtitleDisplayName}
							<div class="min-w-0 flex-1 border border-stone-200 bg-stone-50 px-3 py-2">
								<p class="truncate text-xs font-medium text-stone-700">{subtitleDisplayName}</p>
								{#if subtitleCueCount !== null}
									<p class="text-[10px] text-stone-400">
										{$t('recordings.scheduled.cueCount', { count: subtitleCueCount })}{subtitleDurationLabel ? ` · ${subtitleDurationLabel}` : ''}
									</p>
								{/if}
							</div>
						{/if}
						<div class="flex shrink-0 flex-col gap-1.5">
							<label
								class="cursor-pointer border border-stone-200 bg-white px-3 py-1.5 text-center text-[11px] font-semibold text-stone-600 transition-colors hover:border-primary hover:text-primary"
							>
								{subtitleDisplayName ? $t('recordings.common.replace') : $t('recordings.scheduled.chooseSrt')}
								<input type="file" accept=".srt" class="hidden" onchange={onSubtitleFileChange} />
							</label>
							{#if subtitleDisplayName}
								<button
									type="button"
									class="border border-transparent px-3 py-1 text-[11px] font-semibold text-stone-400 hover:text-rose-600"
									onclick={markSubtitleForRemoval}
								>
									{$t('recordings.common.remove')}
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
							<span class="font-semibold">{$t('recordings.scheduled.announceLabel')}</span>
							({subscriberCount > 1 ? $t('recordings.subscribersMany', { count: subscriberCount }) : $t('recordings.subscribersOne', { count: subscriberCount })}) {$t('recordings.scheduled.announceHint')}
							{editingId ? $t('recordings.scheduled.afterEdit') : $t('recordings.scheduled.atCreation')}
						</span>
					</label>
					<label class="flex items-start gap-2.5">
						<input type="checkbox" bind:checked={reminderDraft} class="mt-0.5 accent-[#FF880C]" />
						<span class="text-xs text-stone-600">
							<span class="font-semibold">{$t('recordings.scheduled.reminderLabel')}</span> {$t('recordings.scheduled.reminderHint')}
						</span>
					</label>
				</div>

				{#if formError}
					<p class="border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{formError}</p>
				{/if}
			</div>

			<div class="mt-6 flex justify-end gap-2">
				<button type="button" class="admin-btn-secondary" onclick={closeModal} disabled={saving}>
					{$t('recordings.common.cancel')}
				</button>
				<button type="button" class="admin-btn-primary disabled:opacity-50" onclick={saveEntry} disabled={saving}>
					{saving ? $t('recordings.common.saving') : editingId ? $t('recordings.common.save') : $t('recordings.scheduled.scheduleAction')}
				</button>
			</div>
		</div>
	</div>
{/if}
