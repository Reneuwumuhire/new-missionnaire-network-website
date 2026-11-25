<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { ScheduledLive, BroadcastAdminState } from '../../db/collections';
	import { confirmDialog } from '$lib/stores/confirm-dialog';
	import { toast } from '$lib/stores/toast';
	import { locale, t, type TranslationKey } from '$lib/i18n';
	import { parseSrt } from '$lib/utils/srt';
	import { correctSubtitleSrt } from '$lib/utils/subtitleCorrections';

	// Embedded in /recordings, right under the broadcast control card —
	// scheduling lives next to the Go Live controls keeps the whole broadcast
	// workflow on one page. Each entry owns a stable public watch URL
	// (/live/<slug>) shareable before, during and after the live.
	let {
		upcoming,
		past,
		broadcast,
		subscriberCount,
		publicBaseUrl,
		onAttachReplay
	}: {
		upcoming: ScheduledLive[];
		past: ScheduledLive[];
		broadcast: BroadcastAdminState;
		subscriberCount: number;
		publicBaseUrl: string;
		/** Ended entry with no replay: hands it to the page's upload modal so the
		 *  admin can attach the audio after the fact and revive the public link. */
		onAttachReplay: (entry: ScheduledLive) => void;
	} = $props();

	function watchUrl(slug: string): string {
		return `${publicBaseUrl}/live/${slug}`;
	}

	// Instant-live: the same default info shown in the panel above is what an
	// unscheduled live airs with. Rendered here for the confirm dialog so the
	// admin sees the exact title before going live.
	const FALLBACK_DEFAULT_TITLE = '{date} Missionnaire Network Live audio';
	function berlinDateYmd(d: Date): string {
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Europe/Berlin',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).formatToParts(d);
		const g = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
		return `${g('year')}-${g('month')}-${g('day')}`;
	}
	function renderTitleTemplate(template: string): string {
		const date = berlinDateYmd(new Date());
		return template.includes('{date}')
			? template.replaceAll('{date}', date)
			: `${date} ${template}`;
	}
	const defaultTitlePreview = $derived(
		renderTitleTemplate(broadcast.default_title?.trim() || FALLBACK_DEFAULT_TITLE)
	);

	function fmtDate(iso: string): string {
		try {
			return new Date(iso).toLocaleString($locale, { dateStyle: 'full', timeStyle: 'short' });
		} catch {
			return iso;
		}
	}

	/** Short clock time (HH:MM) for the "live since" line on an on-air entry. */
	function fmtTime(iso: string): string {
		try {
			return new Date(iso).toLocaleTimeString($locale, { hour: '2-digit', minute: '2-digit' });
		} catch {
			return iso;
		}
	}

	// Keep countdowns and elapsed time current while there are broadcasts to show.
	let nowMs = $state(Date.now());
	$effect(() => {
		if (!upcoming.length) return;
		nowMs = Date.now();
		const id = setInterval(() => (nowMs = Date.now()), 30_000);
		return () => clearInterval(id);
	});

	/** "depuis 12 min" / "depuis 1 h 05" — how long an entry has been on air. */
	function liveElapsed(iso: string, now: number): string {
		const diffMs = now - Date.parse(iso);
		if (!Number.isFinite(diffMs) || diffMs < 60_000)
			return $t('recordings.scheduled.elapsedJustNow');
		const minutes = Math.floor(diffMs / 60_000);
		if (minutes < 60) return $t('recordings.scheduled.elapsedMin', { count: minutes });
		const hours = Math.floor(minutes / 60);
		return $t('recordings.scheduled.elapsedHm', { hours, minutes: pad(minutes % 60) });
	}

	/** Coarse "Dans 3 jours / Dans 2 h / Dans 45 min" chip, YouTube-style.
	 *  Updated while broadcasts are visible. */
	function relativeUntil(iso: string): string {
		const diffMs = Date.parse(iso) - nowMs;
		if (Number.isNaN(diffMs)) return '';
		if (diffMs < -60_000) return $t('recordings.scheduled.scheduledTimePassed');
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
	// True when editing an entry that's already on air — the modal then hides
	// the scheduling-only fields and edits the metadata viewers see right now.
	let editingLive = $state(false);
	let saving = $state(false);
	let formError = $state<string | null>(null);
	let titleDraft = $state('');
	let descriptionDraft = $state('');
	let youtubeUrlDraft = $state('');
	let scheduledAtDraft = $state(''); // datetime-local value, admin-local time
	let announceDraft = $state(false);
	let reminderDraft = $state(false);
	let notifyOnStartDraft = $state(false);
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
		youtubeUrlDraft = '';
		scheduledAtDraft = '';
		announceDraft = false;
		reminderDraft = false;
		notifyOnStartDraft = false;
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
		editingLive = false;
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
		editingLive = entry.status === 'live';
		titleDraft = entry.title;
		descriptionDraft = entry.description ?? '';
		youtubeUrlDraft = entry.youtube_url ?? '';
		scheduledAtDraft = isoToLocalInput(entry.scheduled_at);
		announceDraft = false; // already created — re-announce only if explicitly re-checked
		reminderDraft = entry.reminder_enabled;
		notifyOnStartDraft = entry.notify_on_start === true;
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
			totalMin >= 60
				? `${Math.floor(totalMin / 60)}h${String(totalMin % 60).padStart(2, '0')}`
				: $t('recordings.scheduled.durationMin', { count: totalMin });
	}

	function markSubtitleForRemoval() {
		subtitleFile = null;
		subtitleAction = 'remove';
		subtitleCueCount = null;
		subtitleDurationLabel = null;
	}

	async function autoCorrectStagedSubtitle() {
		if (!subtitleFile) return;
		const result = correctSubtitleSrt(await subtitleFile.text());
		if (!result.changes.length) {
			toast.success($t('recordings.scheduled.autoCorrectNone'));
			return;
		}
		subtitleFile = new File([result.text], subtitleFile.name, { type: 'text/plain' });
		toast.success($t('recordings.scheduled.autoCorrectDone', { count: result.changes.length }));
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
			formError =
				(await presignRes.text()) || $t('recordings.error.http', { status: presignRes.status });
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
			formError =
				(await presignRes.text()) || $t('recordings.error.http', { status: presignRes.status });
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
		// A live entry has no editable schedule — only the date matters before air.
		if (!editingLive && !scheduledAtDraft) {
			formError = $t('recordings.error.dateTimeRequired');
			return;
		}
		saving = true;
		formError = null;
		try {
			const body: Record<string, unknown> = {
				title: titleDraft.trim(),
				description: descriptionDraft.trim() || null,
				youtube_url: youtubeUrlDraft.trim() || null
			};
			// Scheduling-only fields are omitted while live (the server freezes them).
			if (!editingLive) {
				body.scheduled_at = new Date(scheduledAtDraft).toISOString();
				body.reminder_enabled = reminderDraft;
				body.notify_on_start = notifyOnStartDraft;
			}

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
	type CorrectionPreview = {
		changeCount: number;
		pdfChangeCount: number;
		cueCount: number;
		pdfUsed: boolean;
		originalKey: string;
		samples: Array<{ from: string; to: string }>;
	};

	async function autoCorrectEntry(entry: ScheduledLive) {
		if (busyId || !entry.subtitle_srt_s3_key) return;
		busyId = entry._id;
		try {
			const endpoint = `/api/scheduled-lives/${entry._id}/auto-correct`;
			const previewRes = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: '{}'
			});
			if (!previewRes.ok) throw new Error(await previewRes.text());
			const preview = (await previewRes.json()) as CorrectionPreview;
			if (preview.changeCount === 0) {
				toast.success($t('recordings.scheduled.autoCorrectNone'));
				return;
			}
			const examples = preview.samples
				.slice(0, 6)
				.map((item) => `${item.from} → ${item.to}`)
				.join(', ');
			const accepted = await confirmDialog.ask({
				title: $t('recordings.scheduled.autoCorrect'),
				message: `${$t('recordings.scheduled.autoCorrectPreview', {
					count: preview.changeCount,
					cues: preview.cueCount
				})}\n${$t(
					preview.pdfUsed
						? 'recordings.scheduled.autoCorrectPdfUsed'
						: 'recordings.scheduled.autoCorrectCommonOnly',
					{ count: preview.pdfChangeCount }
				)}\n${examples}`,
				confirmLabel: $t('recordings.scheduled.autoCorrectApply'),
				cancelLabel: $t('recordings.common.cancel')
			});
			if (!accepted) return;
			const applyRes = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ apply: true, expectedKey: preview.originalKey })
			});
			if (!applyRes.ok) throw new Error(await applyRes.text());
			const applied = (await applyRes.json()) as { applied: boolean; changeCount: number };
			if (!applied.applied) {
				toast.success($t('recordings.scheduled.autoCorrectNone'));
				await invalidateAll();
				return;
			}
			toast.success($t('recordings.scheduled.autoCorrectDone', { count: applied.changeCount }));
			if (editingId === entry._id) {
				existingSubtitleFilename = (entry.subtitle_filename || 'transcription.srt').replace(
					/(?:\.corrig[eé])?\.srt$/i,
					'.corrigé.srt'
				);
			}
			await invalidateAll();
		} catch (cause) {
			toast.error(
				cause instanceof Error ? cause.message : $t('recordings.scheduled.autoCorrectFailed')
			);
		} finally {
			busyId = null;
		}
	}
	let startingDefaults = $state(false);
	let notifyFromDefaults = $state(false);

	/** Start an immediate, unscheduled live off the saved default info. Always
	 *  confirms first — same gate as starting a scheduled entry. */
	async function startFromDefaults() {
		if (startingDefaults) return;
		if (broadcast.is_live) {
			toast.error($t('recordings.scheduled.error.alreadyLive'));
			return;
		}
		const willNotify = notifyFromDefaults && subscriberCount > 0;
		const ok = await confirmDialog.ask({
			title: $t('recordings.defaults.startFromDefaults'),
			message: willNotify
				? subscriberCount > 1
					? $t('recordings.defaults.confirm.startNotifyMany', {
							title: defaultTitlePreview,
							count: subscriberCount
						})
					: $t('recordings.defaults.confirm.startNotifyOne', {
							title: defaultTitlePreview,
							count: subscriberCount
						})
				: $t('recordings.defaults.confirm.start', { title: defaultTitlePreview }),
			confirmLabel: willNotify
				? $t('recordings.confirm.goLive.confirmNotify')
				: $t('recordings.defaults.startFromDefaults'),
			cancelLabel: $t('recordings.common.cancel')
		});
		if (!ok) return;
		startingDefaults = true;
		try {
			const res = await fetch('/api/broadcast/go-live', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notify: notifyFromDefaults, useDefaults: true })
			});
			if (!res.ok) {
				toast.error((await res.text()) || $t('recordings.error.http', { status: res.status }));
				return;
			}
			notifyFromDefaults = false;
			toast.success($t('recordings.defaults.toast.started'));
			await invalidateAll();
		} finally {
			startingDefaults = false;
		}
	}

	async function startLive(entry: ScheduledLive) {
		if (busyId) return;
		if (broadcast.is_live) {
			toast.error($t('recordings.scheduled.error.alreadyLive'));
			return;
		}
		const notify = entry.notify_on_start === true;
		const willNotify = notify && subscriberCount > 0;
		const ok = await confirmDialog.ask({
			title: $t('recordings.scheduled.startLive'),
			message: willNotify
				? subscriberCount > 1
					? $t('recordings.scheduled.confirm.startNotifyMany', {
							title: entry.title,
							count: subscriberCount
						})
					: $t('recordings.scheduled.confirm.startNotifyOne', {
							title: entry.title,
							count: subscriberCount
						})
				: $t('recordings.scheduled.confirm.start', { title: entry.title }),
			confirmLabel: willNotify
				? $t('recordings.confirm.goLive.confirmNotify')
				: $t('recordings.scheduled.startLive'),
			cancelLabel: $t('recordings.common.cancel')
		});
		if (!ok) return;
		busyId = entry._id;
		try {
			const res = await fetch('/api/broadcast/go-live', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notify, scheduledLiveId: entry._id })
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

	async function restoreEntry(entry: ScheduledLive) {
		if (busyId) return;
		const ok = await confirmDialog.ask({
			title: $t('recordings.scheduled.confirm.restoreTitle'),
			message: $t('recordings.scheduled.confirm.restoreMessage', { title: entry.title }),
			confirmLabel: $t('recordings.scheduled.restore'),
			cancelLabel: $t('recordings.scheduled.confirm.back')
		});
		if (!ok) return;
		busyId = entry._id;
		try {
			const res = await fetch(`/api/scheduled-lives/${entry._id}/restore`, { method: 'POST' });
			if (!res.ok) {
				toast.error((await res.text()) || $t('recordings.error.http', { status: res.status }));
				return;
			}
			toast.success($t('recordings.scheduled.toast.restored'));
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

	async function endLiveEntry(entry: ScheduledLive) {
		if (busyId) return;
		const ok = await confirmDialog.ask({
			title: $t('recordings.actions.endLive'),
			message: $t('recordings.scheduled.confirm.endMessage', { title: entry.title }),
			confirmLabel: $t('recordings.actions.endLive'),
			cancelLabel: $t('recordings.common.cancel'),
			tone: 'warning'
		});
		if (!ok) return;
		busyId = entry._id;
		try {
			// Canonical close: ends the broadcast gate, the linked entry, and fires
			// the main-site end-live push. Idempotent — returns alreadyOffline when
			// the gate is already closed.
			const res = await fetch('/api/broadcast/end-live', { method: 'POST' });
			if (!res.ok) {
				toast.error((await res.text()) || $t('recordings.error.http', { status: res.status }));
				return;
			}
			const data = (await res.json().catch(() => ({}))) as { alreadyOffline?: boolean };
			// Gate already offline → this entry was stranded on 'live'; end-live left
			// it untouched, so force-reconcile just this entry.
			if (data.alreadyOffline) {
				const endRes = await fetch(`/api/scheduled-lives/${entry._id}/end`, { method: 'POST' });
				if (!endRes.ok) {
					toast.error(
						(await endRes.text()) || $t('recordings.error.http', { status: endRes.status })
					);
					return;
				}
			}
			toast.success($t('recordings.scheduled.toast.ended'));
			await invalidateAll();
		} finally {
			busyId = null;
		}
	}

	const nextId = $derived(
		upcoming.find(
			(entry) =>
				entry.status === 'scheduled' && !entry.is_test && Date.parse(entry.scheduled_at) >= nowMs
		)?._id
	);
	const buttonClass =
		'inline-flex min-h-9 items-center justify-center gap-1.5 border px-3 text-[10px] font-semibold uppercase tracking-[0.15em] transition-colors disabled:cursor-not-allowed disabled:opacity-50';
	const actionClass = `${buttonClass} border-stone-200 bg-white text-stone-600 hover:border-primary hover:text-primary`;
	const menuActionClass =
		'block w-full px-3 py-2.5 text-left text-xs font-medium hover:bg-stone-100 focus-visible:bg-stone-100 disabled:opacity-50';

	function statusBadge(entry: ScheduledLive): { label: TranslationKey; cls: string } {
		switch (entry.status) {
			case 'live':
				return {
					label: 'recordings.scheduled.status.live',
					cls: 'bg-red-50 text-red-700 border-red-200'
				};
			case 'scheduled':
				return {
					label: 'recordings.scheduled.status.scheduled',
					cls: 'bg-orange-50 text-primary border-orange-200'
				};
			case 'ended':
				return {
					label: 'recordings.scheduled.status.ended',
					cls: 'bg-stone-100 text-stone-600 border-stone-200'
				};
			default:
				return {
					label: 'recordings.scheduled.status.cancelled',
					cls: 'bg-stone-50 text-stone-400 border-stone-200'
				};
		}
	}
</script>

<section
	aria-labelledby="scheduled-broadcasts-heading"
	class="mb-6 rounded-lg border border-stone-200 bg-white/60 p-4 sm:p-5"
>
	<header class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex min-w-0 items-center gap-2">
			<h2
				id="scheduled-broadcasts-heading"
				class="font-display text-2xl font-semibold leading-tight text-stone-900"
			>
				{$t('recordings.scheduled.title')}
			</h2>
			{#if upcoming.length > 0}
				<span
					class="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-stone-600"
					>{upcoming.length}</span
				>
			{/if}
		</div>
		<button
			type="button"
			onclick={openCreate}
			class={`${buttonClass} border-primary bg-primary text-white hover:bg-primary/90`}
		>
			<svg
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
				aria-hidden="true"
			>
				<path stroke-linecap="round" d="M12 4v16m8-8H4" />
			</svg>
			{$t('recordings.scheduled.schedule')}
		</button>
	</header>

	{#if upcoming.length === 0}
		<div
			class="mt-4 rounded-md border border-dashed border-stone-200 bg-stone-50 px-4 py-5 text-center"
		>
			<p class="text-sm font-semibold text-stone-700">{$t('recordings.scheduled.emptyTitle')}</p>
			<p class="mt-1 text-xs leading-relaxed text-stone-500">
				{$t('recordings.scheduled.emptyBody')}
			</p>
		</div>
	{:else}
		<div class="mt-4 space-y-3">
			{#each upcoming as entry (entry._id)}
				{@const onAir = entry.status === 'live'}
				{@const isNext = entry._id === nextId}
				{@const badge = statusBadge(entry)}
				<article
					id="scheduled-{entry._id}"
					class="scroll-mt-20 rounded-md border p-3.5 sm:p-4 {onAir
						? 'border-red-200 bg-red-50/40'
						: isNext
							? 'border-orange-200 bg-orange-50/40'
							: 'border-stone-200 bg-white'}"
				>
					<div class="flex items-start gap-3">
						{#if entry.thumbnail_url}
							<img
								src={entry.thumbnail_url}
								alt=""
								loading="lazy"
								width="112"
								height="63"
								class="aspect-video w-16 shrink-0 rounded-md border border-stone-200/80 object-cover sm:w-28"
							/>
						{/if}
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
								{#if onAir}
									<span
										class="rounded-full border px-2 py-0.5 text-[11px] font-semibold {badge.cls}"
										>{$t(badge.label)}</span
									>
								{:else if isNext}
									<span
										class="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800"
										>{$t('recordings.scheduled.nextBroadcast')}</span
									>
								{:else}
									<span class="text-[11px] font-semibold text-stone-600">{$t(badge.label)}</span>
								{/if}
								{#if entry.status === 'scheduled'}
									<span class="text-xs font-semibold tabular-nums text-stone-600"
										>{relativeUntil(entry.scheduled_at)}</span
									>
								{/if}
							</div>
							<h3
								class="mt-1 break-words font-display text-lg font-semibold leading-tight text-stone-900 sm:text-xl"
							>
								{entry.title}
							</h3>
							{#if onAir && entry.live_started_at}
								<p class="mt-1 text-xs font-medium text-red-700">
									{$t('recordings.scheduled.liveSince', { time: fmtTime(entry.live_started_at) })}
									<span class="text-stone-500">· {liveElapsed(entry.live_started_at, nowMs)}</span>
								</p>
							{:else}
								<time
									datetime={entry.scheduled_at}
									class="mt-1 block text-xs font-medium text-stone-600"
									>{fmtDate(entry.scheduled_at)}</time
								>
							{/if}
							{#if entry.announced_at || entry.reminder_enabled || entry.notify_on_start || entry.subtitle_filename}
								<div class="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium text-stone-600">
									{#if entry.announced_at}
										<span class="rounded bg-stone-100 px-2 py-0.5"
											>{$t('recordings.scheduled.announced')}</span
										>
									{/if}
									{#if entry.reminder_enabled}
										<span class="rounded bg-stone-100 px-2 py-0.5"
											>{$t('recordings.scheduled.reminderOn')}</span
										>
									{/if}
									{#if entry.notify_on_start}
										<span class="rounded bg-sky-50 px-2 py-0.5 text-sky-800"
											>{$t('recordings.scheduled.liveAlertOn')}</span
										>
									{/if}
									{#if entry.subtitle_filename}
										<span class="rounded bg-stone-100 px-2 py-0.5" title={entry.subtitle_filename}
											>{$t('recordings.scheduled.transcript')}</span
										>
									{/if}
								</div>
							{/if}
						</div>
					</div>

					<div class="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-200/80 pt-3">
						{#if onAir}
							<button
								type="button"
								onclick={() => endLiveEntry(entry)}
								disabled={busyId === entry._id}
								class={`${buttonClass} border-red-200 bg-red-50 text-red-700 hover:bg-red-700 hover:text-white`}
							>
								{$t('recordings.actions.endLive')}
							</button>
						{:else if entry.status === 'scheduled'}
							<button
								type="button"
								onclick={() => startLive(entry)}
								disabled={busyId === entry._id || broadcast.is_live}
								class={`${buttonClass} border-orange-200 bg-orange-50 text-orange-700 hover:border-primary hover:bg-primary hover:text-white`}
							>
								{$t('recordings.scheduled.startLive')}
							</button>
						{/if}
						<button
							type="button"
							class={actionClass}
							disabled={busyId === entry._id}
							onclick={() => openEdit(entry)}
						>
							{onAir ? $t('recordings.scheduled.editLive') : $t('recordings.common.edit')}
						</button>
						<button type="button" class={actionClass} onclick={() => copyLink(entry.slug)}>
							{$t('recordings.scheduled.copyLink')}
						</button>
						<details class="relative ml-auto">
							<summary
								class={`${actionClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
							>
								{$t('recordings.scheduled.more')}
								<svg
									class="h-4 w-4"
									viewBox="0 0 20 20"
									fill="none"
									stroke="currentColor"
									stroke-width="1.5"
									aria-hidden="true"
								>
									<path d="m5 7.5 5 5 5-5" stroke-linecap="round" stroke-linejoin="round" />
								</svg>
							</summary>
							<div
								class="absolute right-0 top-full z-20 mt-1 w-52 border border-stone-200 bg-white p-1 shadow-lg"
							>
								<a
									href={watchUrl(entry.slug)}
									target="_blank"
									rel="noopener noreferrer"
									class={menuActionClass}>{$t('recordings.scheduled.openWatchPage')}</a
								>
								{#if entry.status === 'scheduled'}
									{#if entry.subtitle_srt_s3_key}
										<button
											type="button"
											onclick={() => autoCorrectEntry(entry)}
											disabled={busyId === entry._id}
											class={menuActionClass}
										>
											{$t('recordings.scheduled.autoCorrect')}
										</button>
									{/if}
									<button
										type="button"
										onclick={() => cancelEntry(entry)}
										disabled={busyId === entry._id}
										class={`${menuActionClass} text-red-700 hover:bg-red-50`}
									>
										{$t('recordings.scheduled.cancelBroadcast')}
									</button>
								{/if}
							</div>
						</details>
						{#if entry.status === 'scheduled' && broadcast.is_live}
							<p class="basis-full text-xs text-stone-500">
								{$t('recordings.scheduled.alreadyLiveShort')}
							</p>
						{/if}
					</div>
				</article>
			{/each}
		</div>
	{/if}

	<div
		class="mt-4 flex flex-wrap items-center justify-between gap-2.5 border-t border-stone-200 pt-3"
	>
		<button
			type="button"
			onclick={startFromDefaults}
			disabled={startingDefaults || broadcast.is_live}
			data-testid="instant-live-btn"
			title={$t('recordings.defaults.startFromDefaultsTitle')}
			class={actionClass}
		>
			{startingDefaults ? $t('recordings.busy.starting') : $t('recordings.scheduled.goLiveNow')}
		</button>
		<label class="flex cursor-pointer items-center gap-2 text-xs font-medium text-stone-600">
			<input type="checkbox" bind:checked={notifyFromDefaults} class="accent-[#FF880C]" />
			{$t('recordings.scheduled.notifyThisStart')}
		</label>
	</div>

	<!-- Past (collapsed by default) -->
	{#if past.length > 0}
		<button
			type="button"
			class="mt-5 flex w-full items-center gap-2 text-left text-[11px] font-bold uppercase tracking-[0.2em] text-stone-400 transition-colors hover:text-stone-600"
			aria-expanded={showPast}
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
					<div
						class="flex flex-wrap items-center gap-3 px-5 py-3.5 transition-colors hover:bg-stone-50/60"
					>
						<span
							class="border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] {badge.cls}"
						>
							{$t(badge.label)}
						</span>
						<div class="min-w-0 flex-1">
							<p class="truncate text-sm font-medium text-stone-700">{entry.title}</p>
							<p class="text-[11px] text-stone-400">{fmtDate(entry.scheduled_at)}</p>
						</div>
						<div class="flex shrink-0 items-center gap-2">
							{#if entry.status === 'ended' || entry.status === 'cancelled'}
								<button
									type="button"
									class="border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:border-primary hover:bg-primary hover:text-white disabled:opacity-50"
									disabled={busyId === entry._id}
									onclick={() => restoreEntry(entry)}
								>
									{$t('recordings.scheduled.restore')}
								</button>
							{/if}
							{#if entry.status === 'ended' && entry.subtitle_srt_s3_key}
								<button
									type="button"
									class="border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 transition-colors hover:bg-sky-700 hover:text-white disabled:opacity-50"
									disabled={busyId === entry._id}
									onclick={() => autoCorrectEntry(entry)}
								>
									{$t('recordings.scheduled.autoCorrect')}
								</button>
							{/if}
							{#if entry.status === 'ended' && entry.recording_id}
								<a
									href={`${publicBaseUrl}/live/rediffusions/${entry.recording_id}`}
									target="_blank"
									rel="noopener noreferrer"
									class="text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
								>
									{$t('recordings.scheduled.replay')}
								</a>
							{:else if entry.status === 'ended'}
								<!-- Live ended without a recording: the shared link is dead until a
								     replay exists. Attach the audio now and it comes back to life. -->
								<button
									type="button"
									class="border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:border-primary hover:bg-primary hover:text-white"
									title={$t('recordings.scheduled.attachReplayTitle')}
									onclick={() => onAttachReplay(entry)}
								>
									{$t('recordings.scheduled.attachReplay')}
								</button>
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
</section>

<!-- Create / edit modal -->
{#if modalOpen}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4 lg:pl-64">
		<button
			type="button"
			class="absolute inset-0 bg-stone-900/40 backdrop-blur-[2px]"
			onclick={closeModal}
			aria-label={$t('recordings.common.close')}
		></button>
		<div class="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl">
			<h2 class="font-display text-xl font-semibold text-stone-800">
				{editingLive
					? $t('recordings.scheduled.editLiveTitle')
					: editingId
						? $t('recordings.scheduled.editTitle')
						: $t('recordings.scheduled.schedule')}
			</h2>
			<p class="mt-1 text-xs text-stone-400">
				{editingLive
					? $t('recordings.scheduled.editLiveHint')
					: editingId
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

				{#if !editingLive}
					<div>
						<label for="direct-datetime" class="mb-1 block text-xs font-semibold text-stone-600">
							{$t('recordings.scheduled.dateTimeLabel')} <span class="text-rose-500">*</span>
							<span class="ml-1 font-normal text-stone-400"
								>{$t('recordings.scheduled.localTime')}</span
							>
						</label>
						<input
							id="direct-datetime"
							type="datetime-local"
							bind:value={scheduledAtDraft}
							class="w-full border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-primary focus:outline-none"
						/>
					</div>
				{/if}

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

				<div>
					<label for="direct-youtube" class="mb-1 block text-xs font-semibold text-stone-600">
						{$t('recordings.scheduled.youtubeLabel')}
						<span class="ml-1 font-normal text-stone-400"
							>{$t('recordings.scheduled.optional')}</span
						>
					</label>
					<input
						id="direct-youtube"
						type="url"
						inputmode="url"
						bind:value={youtubeUrlDraft}
						placeholder={$t('recordings.scheduled.youtubePlaceholder')}
						class="w-full border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 focus:border-primary focus:outline-none"
					/>
				</div>

				<!-- Thumbnail -->
				<div>
					<span class="mb-1 block text-xs font-semibold text-stone-600"
						>{$t('recordings.common.thumbnail')}</span
					>
					<div class="flex items-center gap-3">
						<div class="h-16 w-28 shrink-0 overflow-hidden border border-stone-200 bg-stone-50">
							{#if previewSrc}
								<img
									src={previewSrc}
									alt={$t('recordings.common.thumbnail')}
									class="h-full w-full object-cover"
								/>
							{:else}
								<div
									class="flex h-full w-full items-center justify-center text-[10px] text-stone-300"
								>
									{$t('recordings.scheduled.noneThumb')}
								</div>
							{/if}
						</div>
						<div class="flex flex-col gap-1.5">
							<label
								class="cursor-pointer border border-stone-200 bg-white px-3 py-1.5 text-center text-[11px] font-semibold text-stone-600 transition-colors hover:border-primary hover:text-primary"
							>
								{previewSrc
									? $t('recordings.common.replace')
									: $t('recordings.scheduled.chooseImage')}
								<input
									type="file"
									accept="image/*"
									class="hidden"
									onchange={onThumbnailFileChange}
								/>
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

				<!-- Subtitle (SRT) — managed from the dedicated sync panel once on air,
				     so it's hidden when correcting a live entry's metadata. -->
				{#if !editingLive}
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
											{$t('recordings.scheduled.cueCount', {
												count: subtitleCueCount
											})}{subtitleDurationLabel ? ` · ${subtitleDurationLabel}` : ''}
										</p>
									{/if}
								</div>
							{/if}
							<div class="flex shrink-0 flex-col gap-1.5">
								<label
									class="cursor-pointer border border-stone-200 bg-white px-3 py-1.5 text-center text-[11px] font-semibold text-stone-600 transition-colors hover:border-primary hover:text-primary"
								>
									{subtitleDisplayName
										? $t('recordings.common.replace')
										: $t('recordings.scheduled.chooseSrt')}
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
						{#if subtitleFile}
							<button
								type="button"
								class="mt-2 border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-700 hover:text-white"
								onclick={autoCorrectStagedSubtitle}
							>
								{$t('recordings.scheduled.autoCorrect')}
							</button>
						{:else if editingId && subtitleAction === 'keep' && subtitleDisplayName}
							{@const existingEntry = upcoming.find((item) => item._id === editingId)}
							{#if existingEntry}
								<button
									type="button"
									class="mt-2 border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-700 hover:text-white disabled:opacity-50"
									disabled={busyId === editingId}
									onclick={() => autoCorrectEntry(existingEntry)}
								>
									{$t('recordings.scheduled.autoCorrect')}
								</button>
							{/if}
						{/if}
					</div>

					<!-- Notifications -->
					<div class="space-y-2 border border-stone-100 bg-stone-50/60 p-3">
						<label class="flex items-start gap-2.5">
							<input type="checkbox" bind:checked={announceDraft} class="mt-0.5 accent-[#FF880C]" />
							<span class="text-xs text-stone-600">
								<span class="font-semibold">{$t('recordings.scheduled.announceLabel')}</span>
								({subscriberCount > 1
									? $t('recordings.subscribersMany', { count: subscriberCount })
									: $t('recordings.subscribersOne', { count: subscriberCount })}) {$t(
									'recordings.scheduled.announceHint'
								)}
								{editingId
									? $t('recordings.scheduled.afterEdit')
									: $t('recordings.scheduled.atCreation')}
							</span>
						</label>
						<label class="flex items-start gap-2.5">
							<input type="checkbox" bind:checked={reminderDraft} class="mt-0.5 accent-[#FF880C]" />
							<span class="text-xs text-stone-600">
								<span class="font-semibold">{$t('recordings.scheduled.reminderLabel')}</span>
								{$t('recordings.scheduled.reminderHint')}
							</span>
						</label>
						<label class="flex items-start gap-2.5">
							<input
								type="checkbox"
								bind:checked={notifyOnStartDraft}
								class="mt-0.5 accent-[#FF880C]"
							/>
							<span class="text-xs text-stone-600">
								<span class="font-semibold">{$t('recordings.scheduled.notifyOnStartLabel')}</span>
								{$t('recordings.scheduled.notifyOnStartHint')}
							</span>
						</label>
					</div>
				{/if}

				{#if formError}
					<p class="border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
						{formError}
					</p>
				{/if}
			</div>

			<div class="mt-6 flex justify-end gap-2">
				<button type="button" class="admin-btn-secondary" onclick={closeModal} disabled={saving}>
					{$t('recordings.common.cancel')}
				</button>
				<button
					type="button"
					class="admin-btn-primary disabled:opacity-50"
					onclick={saveEntry}
					disabled={saving}
				>
					{saving
						? $t('recordings.common.saving')
						: editingId
							? $t('recordings.common.save')
							: $t('recordings.scheduled.scheduleAction')}
				</button>
			</div>
		</div>
	</div>
{/if}
