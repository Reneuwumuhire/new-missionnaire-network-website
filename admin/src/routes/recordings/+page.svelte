<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import type { Recording, RecordingStatus } from '$lib/models/recording';
	import { confirmDialog } from '$lib/stores/confirm-dialog';
	import { toast } from '$lib/stores/toast';
	import { t, type TranslationKey } from '$lib/i18n';
	import type { Component } from 'svelte';
	import BlurUpImage from '$lib/components/BlurUpImage.svelte';
	import SkeletonRows from '$lib/components/SkeletonRows.svelte';
	import ScheduledLivesPanel from '$lib/components/ScheduledLivesPanel.svelte';
	import SubtitleSyncPanel from '$lib/components/SubtitleSyncPanel.svelte';

	// AudioTrimEditor pulls in wavesurfer.js + plugins (~120 kB minified). It's
	// only used when the admin opens the trim modal, so we load it on demand
	// and keep the rest of the recordings page lean for first paint.
	type AudioTrimEditorProps = {
		recording: Recording;
		onClose: () => void;
		onSaved: () => void;
	};
	type RecordingTranscript = {
		_id: string;
		url: string;
		filename: string;
		size: number;
		publishedOn?: string;
	};
	let AudioTrimEditor = $state<Component<AudioTrimEditorProps> | null>(null);
	async function ensureTrimEditorLoaded(): Promise<void> {
		if (AudioTrimEditor) return;
		const mod = await import('$lib/components/AudioTrimEditor.svelte');
		AudioTrimEditor = mod.default as unknown as Component<AudioTrimEditorProps>;
	}
	function openTrimEditor(id: string): void {
		// Kick off the dynamic import without blocking the click handler — the
		// {#if AudioTrimEditor && trimEditorRecording} block below renders as
		// soon as both are ready (typically within a single network round trip).
		void ensureTrimEditorLoaded();
		trimEditorRecordingId = id;
	}
	import { vercelImage, vercelImageSrcSet, vercelImagePlaceholder } from '$lib/utils/vercelImage';

	let { data }: { data: PageData } = $props();

	type RecorderSnapshot = PageData['recorder'];
	type IcecastSnapshot = PageData['icecast'];

	// Recorder + icecast are polled every 5s. Mirror them in local state so the
	// poll can update just these two fields via a lightweight /api/recordings/status
	// fetch instead of invalidating the whole page (which would re-run the full
	// MongoDB load — list, broadcast, push subs count). $effect resyncs when
	// `data` changes after action-driven invalidateAll() calls.
	let recorder = $state<RecorderSnapshot>(data.recorder);
	let icecast = $state<IcecastSnapshot>(data.icecast);
	$effect(() => {
		recorder = data.recorder;
		icecast = data.icecast;
	});
	const broadcast = $derived(data.broadcast);
	const subscriberCount = $derived(data.subscriberCount);
	// Current admin email — used to decide whether stopping someone else's
	// session needs a confirmation (soft lock). Falls back to empty string
	// so the "different admin" check never mistakenly matches.
	const currentUserEmail = $derived(data.user?.email ?? '');
	const canDeleteRecordings = $derived(
		Boolean(data.user?.permissions.can_manage_recordings && data.user?.permissions.can_delete)
	);
	const broadcastStartedBy = $derived(broadcast.started_by ?? null);
	const broadcastStartedByName = $derived(broadcast.started_by_name ?? null);
	// Stable public watch link for the broadcast currently linked to a
	// scheduled live — shareable while live, resolves to the replay after.
	const publicWatchUrl = $derived(
		broadcast.scheduled_live_slug ? `${data.publicBaseUrl}/live/${broadcast.scheduled_live_slug}` : null
	);

	async function copyWatchLink() {
		if (!publicWatchUrl) return;
		try {
			await navigator.clipboard.writeText(publicWatchUrl);
			toast.success($t('recordings.toast.linkCopied'));
		} catch {
			toast.error($t('recordings.toast.linkCopyFailed'));
		}
	}
	const recordingStartedBy = $derived(
		recorder.available && 'recording' in recorder && recorder.recording
			? (recorder.createdBy ?? null)
			: null
	);
	const recordingStartedByName = $derived(
		recorder.available && 'recording' in recorder && recorder.recording
			? (recorder.createdByName ?? null)
			: null
	);
	// Surfaced when the recorder's ffmpeg died unexpectedly (streamer dropout)
	// and we're between auto-restart attempts. The recording is still active —
	// the operator just needs to know audio is paused while the source recovers.
	const sourceRecovering = $derived(
		recorder.available && 'recording' in recorder && recorder.recording
			? Boolean(recorder.sourceRecovering)
			: false
	);
	// >1 means the upstream dropped at least once and we've started a new
	// segment. All segments are concat'd into a single MP3 on Stop, but the
	// operator should know the recording isn't a single take.
	const segmentCount = $derived(
		recorder.available && 'recording' in recorder && recorder.recording
			? (recorder.segmentCount ?? 1)
			: 1
	);

	/** Prefer a stored full name; fall back to the local-part of the email.
	 *  Shown everywhere we mention who started/created a session. */
	function displayName(name: string | null | undefined, email: string | null | undefined): string {
		const trimmed = name?.trim();
		if (trimmed) return trimmed;
		if (!email) return '—';
		const at = email.indexOf('@');
		return at > 0 ? email.slice(0, at) : email;
	}

	/** Ask for confirmation when the actor is not the original starter. Returns
	 *  true if the action should proceed. */
	async function confirmOverride(
		startedBy: string | null,
		startedByName: string | null,
		label: string
	): Promise<boolean> {
		if (!startedBy || startedBy === currentUserEmail) return true;
		return confirmDialog.ask({
			title: $t('recordings.confirm.override.title', { label }),
			message: $t('recordings.confirm.override.message', {
				name: displayName(startedByName, startedBy),
				label: label.toLowerCase()
			}),
			confirmLabel: $t('recordings.confirm.override.confirm'),
			cancelLabel: $t('recordings.common.cancel'),
			tone: 'warning'
		});
	}
	let elapsed = $state(0);
	let broadcastElapsed = $state(0);
	let busy = $state(false);
	let broadcastBusy = $state(false);
	let actionError = $state<string | null>(null);
	// ── Search + multi-select (recordings table) ──────────────────────
	// The initial 5 most recent recordings are streamed in via the page
	// loader; everything else (search, "load more") goes through
	// /api/recordings/list. Client-side filtering is gone — it would only
	// see the 5 loaded rows, not the full archive, which is misleading.
	let searchQuery = $state('');
	let statusFilter = $state<'all' | RecordingStatus>('all');
	let publishedFilter = $state<'all' | 'published' | 'unpublished'>('all');
	let selectedIds = $state<Set<string>>(new Set());
	let bulkDeleting = $state(false);
	$effect(() => {
		if (!canDeleteRecordings && selectedIds.size > 0) selectedIds = new Set();
	});

	const PAGE_SIZE = 5;
	// The initial page of recordings is STREAMED from the loader (data.list is
	// a promise) so the control center paints instantly with skeleton rows.
	// It's consumed exactly once in onMount; later updates go through
	// fetchRecordings()/refreshVisibleRecordings() as before.
	type RecordingList = Awaited<PageData['list']>['data'];
	let recordings = $state<RecordingList>([]);
	let total = $state(0);
	let listLoaded = $state(false);
	let currentPage = $state(1);
	let isFetching = $state(false);
	let fetchError = $state<string | null>(null);

	const hasMore = $derived(recordings.length < total);
	const hasActiveFilters = $derived(
		Boolean(searchQuery.trim()) || statusFilter !== 'all' || publishedFilter !== 'all'
	);

	const RECORDING_LIST_UPLOAD_REFRESH_MS = 5 * 60 * 1000;
	let watchedRecordingId = $state<string | null>(null);
	let watchedRecordingRefreshUntil = $state(0);

	function buildListUrl(page: number, limit = PAGE_SIZE): string {
		const params = new URLSearchParams();
		params.set('limit', String(limit));
		params.set('page', String(page));
		if (searchQuery.trim()) params.set('q', searchQuery.trim());
		if (statusFilter !== 'all') params.set('status', statusFilter);
		if (publishedFilter !== 'all') params.set('published', publishedFilter);
		return `/api/recordings/list?${params}`;
	}

	async function fetchRecordings(
		append: boolean,
		options: { limit?: number; showLoading?: boolean; silentErrors?: boolean } = {}
	) {
		const limit = options.limit ?? PAGE_SIZE;
		const showLoading = options.showLoading ?? true;
		if (showLoading) isFetching = true;
		if (!options.silentErrors) fetchError = null;
		const targetPage = append ? currentPage + 1 : 1;
		try {
			const res = await fetch(buildListUrl(targetPage, limit));
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body = (await res.json()) as { data: RecordingList; total: number };
			if (append) {
				recordings = [...recordings, ...body.data];
				currentPage = targetPage;
			} else {
				recordings = body.data;
				total = body.total;
				currentPage = Math.max(1, Math.ceil(body.data.length / PAGE_SIZE));
				// Drop selections that no longer exist in the new result set.
				const surviving = new Set(body.data.map((r) => r._id!).filter(Boolean));
				if (selectedIds.size > 0) {
					selectedIds = new Set([...selectedIds].filter((id) => surviving.has(id)));
				}
			}
			listLoaded = true;
		} catch (err) {
			if (!options.silentErrors) fetchError = (err as Error).message || $t('recordings.error.network');
		} finally {
			if (showLoading) isFetching = false;
		}
	}

	async function refreshVisibleRecordings() {
		const visiblePages = Math.max(1, Math.ceil(recordings.length / PAGE_SIZE));
		const visibleLimit = Math.min(100, visiblePages * PAGE_SIZE);
		await fetchRecordings(false, {
			limit: visibleLimit,
			showLoading: false,
			silentErrors: true
		});
	}

	function watchRecordingList(id: string | null | undefined) {
		if (!id) return;
		watchedRecordingId = id;
		watchedRecordingRefreshUntil = Date.now() + RECORDING_LIST_UPLOAD_REFRESH_MS;
	}

	async function readRecordingId(res: Response): Promise<string | null> {
		const body = (await res.json().catch(() => null)) as {
			id?: unknown;
			subtitlesAnchored?: unknown;
		} | null;
		if (body?.subtitlesAnchored === true) {
			// Recording start doubled as the subtitle anchor (SRT 00:00 = now).
			toast.success($t('recordings.toast.subtitlesAnchoredAtStart'));
			await invalidateAll(); // refresh the sync panel with the new anchor
		}
		return typeof body?.id === 'string' ? body.id : null;
	}

	async function refreshWatchedRecordingList() {
		if (!watchedRecordingId) return;
		if (Date.now() > watchedRecordingRefreshUntil) {
			watchedRecordingId = null;
			watchedRecordingRefreshUntil = 0;
			return;
		}
		await refreshVisibleRecordings();
		const watched = recordings.find((r) => r._id === watchedRecordingId);
		if (watched && (watched.status === 'ready' || watched.status === 'failed')) {
			watchedRecordingId = null;
			watchedRecordingRefreshUntil = 0;
		}
	}

	function loadMore() {
		if (!isFetching && hasMore) void fetchRecordings(true);
	}

	// Filter changes refetch from the server. searchQuery is debounced (300ms);
	// the dropdowns refetch immediately. Skip the very first effect run so we
	// don't double-fetch on initial mount (the loader already gave us page 1).
	let didMount = false;
	let searchDebounce: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		// Track all three so any change re-runs this block.
		searchQuery;
		statusFilter;
		publishedFilter;
		if (!didMount) {
			didMount = true;
			return;
		}
		if (searchDebounce) clearTimeout(searchDebounce);
		searchDebounce = setTimeout(() => {
			void fetchRecordings(false);
		}, 300);
	});

	function resetFilters() {
		searchQuery = '';
		statusFilter = 'all';
		publishedFilter = 'all';
	}

	// Thumbnails from S3 can 404 (deleted object, expired URL, wrong key). Track
	// which ones failed to load so the UI swaps in a neutral placeholder instead
	// of the browser's default broken-image icon.
	let failedThumbnails = $state<Set<string>>(new Set());
	function markThumbnailFailed(id: string) {
		if (failedThumbnails.has(id)) return;
		const next = new Set(failedThumbnails);
		next.add(id);
		failedThumbnails = next;
	}
	let broadcastThumbnailBroken = $state(false);
	// Per-modal flag for the recording edit preview — when the existing thumbnail
	// URL 403s inside the edit modal, swap to the "no thumbnail" placeholder so
	// the admin can upload a replacement without the browser's broken-image icon.
	let recEditThumbnailBroken = $state(false);

	// All filter narrowing happens server-side now (see fetchRecordings).
	// Keeping the same names so the rest of the template (select-all
	// checkbox, bulk action bar, etc.) doesn't have to change.
	const filteredRecordings = $derived(recordings);
	const filteredIds = $derived(filteredRecordings.map((r) => r._id!).filter(Boolean));
	const allFilteredSelected = $derived(
		filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id))
	);
	const someFilteredSelected = $derived(
		filteredIds.some((id) => selectedIds.has(id)) && !allFilteredSelected
	);

	function toggleSelection(id: string) {
		if (!canDeleteRecordings) return;
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
	}

	function toggleSelectAllFiltered() {
		if (!canDeleteRecordings) return;
		if (allFilteredSelected) {
			const next = new Set(selectedIds);
			for (const id of filteredIds) next.delete(id);
			selectedIds = next;
		} else {
			const next = new Set(selectedIds);
			for (const id of filteredIds) next.add(id);
			selectedIds = next;
		}
	}

	function clearSelection() {
		selectedIds = new Set();
	}

	async function bulkDelete() {
		if (bulkDeleting || selectedIds.size === 0) return;
		if (!canDeleteRecordings) {
			clearSelection();
			toast.error($t('recordings.error.noDeletePermission'));
			return;
		}
		const count = selectedIds.size;
		const ok = await confirmDialog.ask({
			title:
				count > 1
					? $t('recordings.confirm.bulkDelete.titleMany', { count })
					: $t('recordings.confirm.bulkDelete.titleOne', { count }),
			message: $t('recordings.confirm.bulkDelete.message'),
			confirmLabel: $t('recordings.common.delete'),
			cancelLabel: $t('recordings.common.cancel'),
			tone: 'danger'
		});
		if (!ok) return;
		bulkDeleting = true;
		try {
			const res = await fetch('/api/recordings/bulk', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'delete', ids: Array.from(selectedIds) })
			});
			const payload = (await res.json()) as { data?: { deleted: number }; error?: string };
			if (!res.ok || payload.error) {
				toast.error(payload.error ?? $t('recordings.error.http', { status: res.status }));
				return;
			}
			const deleted = payload.data?.deleted ?? count;
			toast.success(
				deleted > 1
					? $t('recordings.toast.deletedMany', { count: deleted })
					: $t('recordings.toast.deletedOne', { count: deleted })
			);
			clearSelection();
			await refreshVisibleRecordings();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : $t('recordings.error.bulkDeleteFailed'));
		} finally {
			bulkDeleting = false;
		}
	}

	// ── Per-recording edit state (only one row editable at a time) ────
	let editingRecordingId = $state<string | null>(null);
	let recDraftTitle = $state<string>('');
	let recDraftDescription = $state<string>('');
	let recDraftYoutubeUrl = $state<string>('');
	let recYoutubeError = $state<string | null>(null);
	let recThumbnailFile = $state<File | null>(null);
	let recThumbnailPreviewUrl = $state<string | null>(null);
	let recThumbnailAction = $state<'keep' | 'replace' | 'remove'>('keep');
	let recThumbnailError = $state<string | null>(null);
	let recAudioFile = $state<File | null>(null);
	let recAudioDurationSec = $state<number | null>(null);
	let recAudioError = $state<string | null>(null);
	let recAudioUploadPct = $state<number | null>(null);
	let recPdfFile = $state<File | null>(null);
	let recPdfError = $state<string | null>(null);
	let recPdfUploadPct = $state<number | null>(null);
	let recExistingTranscript = $state<RecordingTranscript | null>(null);
	let recTranscriptLoading = $state(false);
	let recTranscriptUploadOpen = $state(false);
	let recPdfMode = $state<'add' | 'replace'>('add');
	// Replay subtitles (per-recording .srt + sync offset + hide toggle).
	let recSubtitleFile = $state<File | null>(null);
	let recSubtitleError = $state<string | null>(null);
	let recSubtitleAction = $state<'keep' | 'replace' | 'remove'>('keep');
	let recSubtitleOffsetSec = $state<number>(0);
	let recSubtitlesHidden = $state<boolean>(false);
	let recSaving = $state(false);

	// ── Backfill upload (manual recording for a missed live) ──────────
	// Lets an admin add a recording for a date we didn't capture live but have
	// elsewhere (e.g. the YouTube re-broadcast). Picks the MP3, a backdated
	// date, and metadata; the doc is created then audio is uploaded + finalized
	// via the same S3 flow the edit modal uses.
	const canManageRecordings = $derived(Boolean(data.user?.permissions.can_manage_recordings));
	let uploadModalOpen = $state(false);
	let uploadTitle = $state('');
	let uploadTitleDirty = $state(false);
	let uploadStartedAt = $state(''); // datetime-local value (local time)
	let uploadDescription = $state('');
	let uploadYoutubeUrl = $state('');
	let uploadYoutubeError = $state<string | null>(null);
	let uploadThumbnailFile = $state<File | null>(null);
	let uploadThumbnailPreviewUrl = $state<string | null>(null);
	let uploadThumbnailError = $state<string | null>(null);
	let uploadAudioFile = $state<File | null>(null);
	let uploadAudioDurationSec = $state<number | null>(null);
	let uploadAudioError = $state<string | null>(null);
	let uploadAudioPct = $state<number | null>(null);
	let uploadPublishNow = $state(false);
	let uploadSaving = $state(false);
	let uploadError = $state<string | null>(null);

	function toLocalDatetimeValue(d: Date): string {
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function renderTitleForDate(template: string, ymd: string): string {
		return template.includes('{date}') ? template.replaceAll('{date}', ymd) : `${ymd} ${template}`;
	}

	function clearUploadThumbnail() {
		if (uploadThumbnailPreviewUrl) URL.revokeObjectURL(uploadThumbnailPreviewUrl);
		uploadThumbnailPreviewUrl = null;
		uploadThumbnailFile = null;
		uploadThumbnailError = null;
	}

	function clearUploadAudio() {
		uploadAudioFile = null;
		uploadAudioDurationSec = null;
		uploadAudioError = null;
		uploadAudioPct = null;
	}

	function openUploadModal() {
		const now = new Date();
		uploadStartedAt = toLocalDatetimeValue(now);
		const ymd = uploadStartedAt.slice(0, 10);
		const tpl = broadcast.default_title?.trim() || FALLBACK_DEFAULT_TITLE;
		uploadTitle = renderTitleForDate(tpl, ymd);
		uploadTitleDirty = false;
		uploadDescription = broadcast.default_description?.trim() || '';
		uploadYoutubeUrl = '';
		uploadYoutubeError = null;
		clearUploadThumbnail();
		clearUploadAudio();
		uploadPublishNow = false;
		uploadError = null;
		uploadModalOpen = true;
	}

	function closeUploadModal() {
		if (uploadSaving) return;
		clearUploadThumbnail();
		clearUploadAudio();
		uploadModalOpen = false;
	}

	// Re-render the title's date prefix when the admin changes the date, but
	// only while they haven't hand-edited the title themselves.
	function onUploadDateChange() {
		if (uploadTitleDirty) return;
		const ymd = uploadStartedAt.slice(0, 10);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return;
		const tpl = broadcast.default_title?.trim() || FALLBACK_DEFAULT_TITLE;
		uploadTitle = renderTitleForDate(tpl, ymd);
	}

	async function onUploadAudioChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const isMp3 =
			file.type === 'audio/mpeg' ||
			file.type === 'audio/mp3' ||
			file.name.toLowerCase().endsWith('.mp3');
		if (!isMp3) {
			uploadAudioError = $t('recordings.error.selectMp3');
			return;
		}
		if (file.size > 2 * 1024 * 1024 * 1024) {
			uploadAudioError = $t('recordings.error.mp3TooLarge');
			return;
		}
		try {
			uploadAudioDurationSec = await readAudioDuration(file);
		} catch {
			uploadAudioError = $t('recordings.error.audioDurationUnreadable');
			return;
		}
		uploadAudioError = null;
		uploadAudioFile = file;
	}

	function onUploadThumbnailChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			uploadThumbnailError = $t('recordings.error.selectImage');
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			uploadThumbnailError = $t('recordings.error.imageTooLarge');
			return;
		}
		uploadThumbnailError = null;
		if (uploadThumbnailPreviewUrl) URL.revokeObjectURL(uploadThumbnailPreviewUrl);
		uploadThumbnailFile = file;
		uploadThumbnailPreviewUrl = URL.createObjectURL(file);
	}

	async function submitUpload() {
		if (uploadSaving) return;
		uploadError = null;
		uploadYoutubeError = null;
		uploadAudioError = null;
		uploadThumbnailError = null;

		if (!uploadAudioFile || !uploadAudioDurationSec) {
			uploadAudioError = $t('recordings.error.selectMp3');
			return;
		}
		if (!uploadTitle.trim()) {
			uploadError = $t('recordings.error.titleRequired');
			return;
		}
		const startedAt = new Date(uploadStartedAt);
		if (!uploadStartedAt || Number.isNaN(startedAt.getTime())) {
			uploadError = $t('recordings.error.invalidDate');
			return;
		}

		uploadSaving = true;
		try {
			// 1. Thumbnail (optional) — upload first so create can store its URL.
			let thumbnail_url: string | null = null;
			let thumbnail_s3_key: string | null = null;
			if (uploadThumbnailFile) {
				const presignRes = await fetch('/api/broadcast/thumbnail/presign', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						contentType: uploadThumbnailFile.type,
						size: uploadThumbnailFile.size
					})
				});
				if (!presignRes.ok) {
					uploadThumbnailError = (await presignRes.text()) || $t('recordings.error.http', { status: presignRes.status });
					return;
				}
				const presign = (await presignRes.json()) as {
					uploadUrl: string;
					key: string;
					publicUrl: string;
				};
				const putRes = await fetch(presign.uploadUrl, {
					method: 'PUT',
					headers: { 'Content-Type': uploadThumbnailFile.type },
					body: uploadThumbnailFile
				});
				if (!putRes.ok) {
					uploadThumbnailError = $t('recordings.error.thumbnailUploadFailed');
					return;
				}
				thumbnail_url = presign.publicUrl;
				thumbnail_s3_key = presign.key;
			}

			// 2. Create the recording doc (status 'uploading').
			const createRes = await fetch('/api/recordings/upload/create', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: uploadTitle.trim(),
					started_at: startedAt.toISOString(),
					description: uploadDescription.trim() || null,
					youtube_url: uploadYoutubeUrl.trim() || null,
					thumbnail_url,
					thumbnail_s3_key
				})
			});
			if (!createRes.ok) {
				const msg = (await createRes.text()) || $t('recordings.error.http', { status: createRes.status });
				if (msg.includes('YouTube')) uploadYoutubeError = msg;
				else uploadError = msg;
				return;
			}
			const { id } = (await createRes.json()) as { id: string };

			// 3. Upload the audio to S3, then finalize (promotes status → 'ready').
			const presignRes = await fetch(`/api/recordings/${id}/audio/upload-url`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ contentType: 'audio/mpeg' })
			});
			if (!presignRes.ok) {
				uploadAudioError = (await presignRes.text()) || $t('recordings.error.http', { status: presignRes.status });
				return;
			}
			const { uploadUrl, s3Key } = (await presignRes.json()) as {
				uploadUrl: string;
				s3Key: string;
			};
			uploadAudioPct = 0;
			try {
				await putWithProgress(uploadUrl, uploadAudioFile, 'audio/mpeg', (pct) => {
					uploadAudioPct = pct;
				});
			} catch (err) {
				uploadAudioError = err instanceof Error ? err.message : $t('recordings.error.s3UploadFailed');
				return;
			}
			const finalizeRes = await fetch(`/api/recordings/${id}/audio/finalize`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					s3_key: s3Key,
					size_bytes: uploadAudioFile.size,
					duration_sec: uploadAudioDurationSec
				})
			});
			if (!finalizeRes.ok) {
				uploadAudioError = (await finalizeRes.text()) || $t('recordings.error.http', { status: finalizeRes.status });
				return;
			}

			// 4. Publish immediately if requested.
			if (uploadPublishNow) {
				const pubRes = await fetch(`/api/recordings/${id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ published: true })
				});
				if (!pubRes.ok) {
					toast.error($t('recordings.toast.publishAfterUploadFailed'));
				}
			}

			toast.success(
				uploadPublishNow
					? $t('recordings.toast.uploadedAndPublished')
					: $t('recordings.toast.uploaded')
			);
			uploadModalOpen = false;
			clearUploadThumbnail();
			clearUploadAudio();
			await refreshVisibleRecordings();
		} catch (err) {
			uploadError = err instanceof Error ? err.message : $t('recordings.error.uploadFailed');
		} finally {
			uploadSaving = false;
			uploadAudioPct = null;
		}
	}

	// Audio trim editor — opens as a separate modal so it can coexist with
	// the metadata edit flow without entangling its state.
	let trimEditorRecordingId = $state<string | null>(null);
	const trimEditorRecording = $derived.by(() =>
		trimEditorRecordingId
			? (recordings.find((r) => r._id === trimEditorRecordingId) ?? null)
			: null
	);
	async function closeTrimEditor(saved: boolean) {
		trimEditorRecordingId = null;
		if (saved) {
			toast.success($t('recordings.toast.audioSaved'));
			await refreshVisibleRecordings();
		}
	}

	function enterRecordingEdit(rec: Recording) {
		if (recThumbnailPreviewUrl) URL.revokeObjectURL(recThumbnailPreviewUrl);
		recThumbnailPreviewUrl = null;
		recThumbnailFile = null;
		recThumbnailAction = 'keep';
		recThumbnailError = null;
		recEditThumbnailBroken = false;
		recAudioFile = null;
		recAudioDurationSec = null;
		recAudioError = null;
		recAudioUploadPct = null;
		recPdfFile = null;
		recPdfError = null;
		recPdfUploadPct = null;
		recExistingTranscript = null;
		recTranscriptLoading = false;
		recTranscriptUploadOpen = false;
		recPdfMode = 'add';
		recSubtitleFile = null;
		recSubtitleError = null;
		recSubtitleAction = 'keep';
		recSubtitleOffsetSec = (rec.subtitle_offset_into_recording_ms ?? 0) / 1000;
		recSubtitlesHidden = rec.subtitles_hidden ?? false;
		recDraftTitle = rec.title ?? '';
		recDraftDescription = rec.description ?? '';
		recDraftYoutubeUrl = rec.source_video_id
			? `https://www.youtube.com/watch?v=${rec.source_video_id}`
			: '';
		recYoutubeError = null;
		editingRecordingId = rec._id!;
		void loadExistingRecordingTranscript(rec._id!);
	}

	function cancelRecordingEdit() {
		if (recThumbnailPreviewUrl) URL.revokeObjectURL(recThumbnailPreviewUrl);
		recThumbnailPreviewUrl = null;
		recThumbnailFile = null;
		recThumbnailAction = 'keep';
		recThumbnailError = null;
		recAudioFile = null;
		recAudioDurationSec = null;
		recAudioError = null;
		recAudioUploadPct = null;
		recPdfFile = null;
		recPdfError = null;
		recPdfUploadPct = null;
		recExistingTranscript = null;
		recTranscriptLoading = false;
		recTranscriptUploadOpen = false;
		recPdfMode = 'add';
		recSubtitleFile = null;
		recSubtitleError = null;
		recSubtitleAction = 'keep';
		recSubtitleOffsetSec = 0;
		recSubtitlesHidden = false;
		editingRecordingId = null;
	}

	function readAudioDuration(file: File): Promise<number> {
		return new Promise((resolve, reject) => {
			const url = URL.createObjectURL(file);
			const audio = document.createElement('audio');
			audio.preload = 'metadata';
			audio.onloadedmetadata = () => {
				const d = audio.duration;
				URL.revokeObjectURL(url);
				if (!Number.isFinite(d) || d <= 0) reject(new Error('Invalid duration'));
				else resolve(Math.floor(d));
			};
			audio.onerror = () => {
				URL.revokeObjectURL(url);
				reject(new Error('Audio metadata read failed'));
			};
			audio.src = url;
		});
	}

	async function onRecAudioFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const isMp3 = file.type === 'audio/mpeg' || file.type === 'audio/mp3' || file.name.toLowerCase().endsWith('.mp3');
		if (!isMp3) {
			recAudioError = $t('recordings.error.selectMp3');
			return;
		}
		if (file.size > 2 * 1024 * 1024 * 1024) {
			recAudioError = $t('recordings.error.mp3TooLarge');
			return;
		}
		try {
			recAudioDurationSec = await readAudioDuration(file);
		} catch {
			recAudioError = $t('recordings.error.audioFileDurationUnreadable');
			return;
		}
		recAudioError = null;
		recAudioFile = file;
	}

	function clearRecAudio() {
		recAudioFile = null;
		recAudioDurationSec = null;
		recAudioError = null;
		recAudioUploadPct = null;
		recAudioUploadPct = null;
	}

	function onRecPdfFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
		if (!isPdf) {
			recPdfError = $t('recordings.error.selectPdf');
			return;
		}
		if (file.size > 100 * 1024 * 1024) {
			recPdfError = $t('recordings.error.pdfTooLarge');
			return;
		}
		recPdfError = null;
		recPdfUploadPct = null;
		recPdfFile = file;
	}

	function clearRecPdf() {
		recPdfFile = null;
		recPdfError = null;
		recPdfUploadPct = null;
		recTranscriptUploadOpen = false;
		recPdfMode = 'add';
	}

	function onRecSubtitleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (!file.name.toLowerCase().endsWith('.srt')) {
			recSubtitleError = $t('recordings.error.selectSrt');
			return;
		}
		if (file.size > 2 * 1024 * 1024) {
			recSubtitleError = $t('recordings.error.srtTooLarge');
			return;
		}
		recSubtitleError = null;
		recSubtitleFile = file;
		recSubtitleAction = 'replace';
	}

	function clearStagedRecSubtitle() {
		recSubtitleFile = null;
		recSubtitleError = null;
		recSubtitleAction = 'keep';
	}

	function markRecSubtitleRemove() {
		recSubtitleFile = null;
		recSubtitleError = null;
		recSubtitleAction = 'remove';
	}

	/** Presign + PUT the staged SRT to S3. Returns the triple or null on failure
	 *  (recSubtitleError is set). Reuses the broadcast subtitle presign route,
	 *  which writes under the shared `subtitles/` prefix. */
	async function uploadRecSubtitle(): Promise<{
		url: string;
		key: string;
		filename: string;
	} | null> {
		if (!recSubtitleFile) return null;
		const presignRes = await fetch('/api/broadcast/subtitles/presign', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ filename: recSubtitleFile.name, size: recSubtitleFile.size })
		});
		if (!presignRes.ok) {
			recSubtitleError =
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
			body: recSubtitleFile
		});
		if (!uploadRes.ok) {
			recSubtitleError = $t('recordings.error.srtUploadFailed');
			return null;
		}
		return { url: publicUrl, key, filename: recSubtitleFile.name };
	}

	/** Persist replay subtitle changes (file replace/remove, sync offset, hide
	 *  toggle) for the recording being edited. Returns false on failure. */
	async function saveRecSubtitle(rec: Recording): Promise<boolean> {
		const patch: Record<string, unknown> = {};
		const offsetMs = Math.round((recSubtitleOffsetSec || 0) * 1000);

		if (recSubtitleAction === 'remove') {
			patch.subtitle_srt_url = null;
			patch.subtitle_srt_s3_key = null;
			patch.subtitle_offset_into_recording_ms = null;
		} else if (recSubtitleAction === 'replace' && recSubtitleFile) {
			const uploaded = await uploadRecSubtitle();
			if (!uploaded) return false;
			patch.subtitle_srt_url = uploaded.url;
			patch.subtitle_srt_s3_key = uploaded.key;
			patch.subtitle_filename = uploaded.filename;
			patch.subtitle_offset_into_recording_ms = offsetMs;
		} else if (offsetMs !== (rec.subtitle_offset_into_recording_ms ?? 0)) {
			// Keep the file, just resync.
			patch.subtitle_offset_into_recording_ms = offsetMs;
		}

		if (recSubtitlesHidden !== (rec.subtitles_hidden ?? false)) {
			patch.subtitles_hidden = recSubtitlesHidden;
		}

		if (Object.keys(patch).length === 0) return true;
		try {
			const res = await fetch(`/api/recordings/${rec._id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch)
			});
			if (!res.ok) {
				recSubtitleError =
					(await res.text()) || $t('recordings.error.http', { status: res.status });
				return false;
			}
			return true;
		} catch {
			recSubtitleError = $t('recordings.error.srtUploadFailed');
			return false;
		}
	}

	function recSubtitleChanged(rec: Recording): boolean {
		const offsetMs = Math.round((recSubtitleOffsetSec || 0) * 1000);
		return (
			recSubtitleAction !== 'keep' ||
			recSubtitlesHidden !== (rec.subtitles_hidden ?? false) ||
			offsetMs !== (rec.subtitle_offset_into_recording_ms ?? 0)
		);
	}

	async function loadExistingRecordingTranscript(id: string) {
		recTranscriptLoading = true;
		try {
			const res = await fetch(`/api/recordings/${id}/transcript`);
			if (!res.ok) return;
			const body = (await res.json()) as { data: RecordingTranscript | null };
			if (editingRecordingId === id) {
				recExistingTranscript = body.data;
			}
		} catch {
			// Non-blocking convenience lookup; saving still works without it.
		} finally {
			if (editingRecordingId === id) recTranscriptLoading = false;
		}
	}

	/** Detach the transcript PDF from the recording being edited. Stores the
	 *  'none' sentinel so the date-based auto-match (which is how a wrong
	 *  same-day PDF gets attached) doesn't simply re-attach it. The PDF file
	 *  itself stays in the library — only the link to this recording goes. */
	async function detachRecordingTranscript() {
		const id = editingRecordingId;
		if (!id || !recExistingTranscript) return;
		const ok = await confirmDialog.ask({
			title: $t('recordings.confirm.detachTranscript.title'),
			message: $t('recordings.confirm.detachTranscript.message', {
				filename: recExistingTranscript.filename
			}),
			confirmLabel: $t('recordings.common.remove'),
			cancelLabel: $t('recordings.common.cancel'),
			tone: 'warning'
		});
		if (!ok) return;
		try {
			const res = await fetch(`/api/recordings/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ transcript_pdf_id: 'none' })
			});
			if (!res.ok) {
				toast.error((await res.text()) || $t('recordings.error.http', { status: res.status }));
				return;
			}
			recExistingTranscript = null;
			recTranscriptUploadOpen = false;
			recPdfMode = 'add';
			toast.success($t('recordings.toast.pdfDetached'));
		} catch {
			toast.error($t('recordings.error.pdfDetachFailed'));
		}
	}

	/** PUT a file to S3 via XHR so upload progress events are observable
	 *  (fetch() has no equivalent). Resolves on 2xx, rejects otherwise. */
	function putWithProgress(
		url: string,
		file: File,
		contentType: string,
		onProgress: (pct: number) => void
	): Promise<void> {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('PUT', url);
			xhr.setRequestHeader('Content-Type', contentType);
			xhr.upload.onprogress = (e) => {
				if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
			};
			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) resolve();
				else reject(new Error(`Upload failed (${xhr.status})`));
			};
			xhr.onerror = () => reject(new Error($t('recordings.error.uploadNetwork')));
			xhr.onabort = () => reject(new Error($t('recordings.error.uploadAborted')));
			xhr.send(file);
		});
	}

	async function uploadRecordingTranscript(rec: Recording): Promise<boolean> {
		if (!recPdfFile) return true;
		const hasYoutubeLink = Boolean(recDraftYoutubeUrl.trim() || rec.source_video_id);
		if (!hasYoutubeLink) {
			recPdfError = $t('recordings.error.youtubeRequiredForPdf');
			return false;
		}

		recPdfError = null;
		const uploadUrlRes = await fetch(`/api/recordings/${rec._id}/transcript/upload-url`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				fileName: recPdfFile.name,
				contentType: recPdfFile.type || 'application/pdf',
				size: recPdfFile.size
			})
		});
		if (!uploadUrlRes.ok) {
			recPdfError = (await uploadUrlRes.text()) || $t('recordings.error.http', { status: uploadUrlRes.status });
			return false;
		}
		const { uploadUrl, s3Key, s3Url } = (await uploadUrlRes.json()) as {
			uploadUrl: string;
			s3Key: string;
			s3Url: string;
		};

		recPdfUploadPct = 0;
		try {
			await putWithProgress(uploadUrl, recPdfFile, 'application/pdf', (pct) => {
				recPdfUploadPct = pct;
			});
		} catch (err) {
			recPdfError = err instanceof Error ? err.message : $t('recordings.error.pdfUploadFailed');
			recPdfUploadPct = null;
			return false;
		}

		const finalizeRes = await fetch(`/api/recordings/${rec._id}/transcript/finalize`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				fileName: recPdfFile.name,
				s3Key,
				s3Url,
				size: recPdfFile.size,
				replacePdfId:
					recPdfMode === 'replace' && recExistingTranscript ? recExistingTranscript._id : null
			})
		});
		if (!finalizeRes.ok) {
			recPdfError = (await finalizeRes.text()) || $t('recordings.error.http', { status: finalizeRes.status });
			return false;
		}

		recPdfUploadPct = 100;
		return true;
	}

	function onRecThumbnailFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			recThumbnailError = $t('recordings.error.selectImage');
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			recThumbnailError = $t('recordings.error.imageTooLarge');
			return;
		}
		recThumbnailError = null;
		if (recThumbnailPreviewUrl) URL.revokeObjectURL(recThumbnailPreviewUrl);
		recThumbnailFile = file;
		recThumbnailPreviewUrl = URL.createObjectURL(file);
		recThumbnailAction = 'replace';
	}

	function markRecThumbnailRemove() {
		if (recThumbnailPreviewUrl) URL.revokeObjectURL(recThumbnailPreviewUrl);
		recThumbnailPreviewUrl = null;
		recThumbnailFile = null;
		recThumbnailAction = 'remove';
	}

	function recPreviewSrc(rec: Recording): string | null {
		if (recThumbnailPreviewUrl) return recThumbnailPreviewUrl;
		if (recThumbnailAction === 'remove') return null;
		if (recEditThumbnailBroken) return null;
		return rec.thumbnail_url ?? null;
	}

	async function saveRecordingMetadata(rec: Recording) {
		if (recSaving) return;
		recSaving = true;
		recThumbnailError = null;
		try {
			const patch: Record<string, unknown> = {};

			const nextTitle = recDraftTitle.trim();
			if (nextTitle && nextTitle !== rec.title) patch.title = nextTitle;

			const nextDescription = recDraftDescription.trim() || null;
			if (nextDescription !== (rec.description ?? null)) patch.description = nextDescription;

			// YouTube link: send raw URL string; server parses to source_video_id.
			// Empty string = clear. Server returns 400 on unparseable input so we
			// surface that as an inline error instead of blowing up the whole save.
			const nextYoutube = recDraftYoutubeUrl.trim();
			const currentYoutube = rec.source_video_id
				? `https://www.youtube.com/watch?v=${rec.source_video_id}`
				: '';
			if (nextYoutube !== currentYoutube) {
				patch.youtube_url = nextYoutube;
			}

			if (recThumbnailAction === 'replace' && recThumbnailFile) {
				const presignRes = await fetch('/api/broadcast/thumbnail/presign', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ contentType: recThumbnailFile.type, size: recThumbnailFile.size })
				});
				if (!presignRes.ok) {
					recThumbnailError = (await presignRes.text()) || $t('recordings.error.http', { status: presignRes.status });
					return;
				}
				const { uploadUrl, key, publicUrl } = (await presignRes.json()) as {
					uploadUrl: string;
					key: string;
					publicUrl: string;
				};
				const uploadRes = await fetch(uploadUrl, {
					method: 'PUT',
					headers: { 'Content-Type': recThumbnailFile.type },
					body: recThumbnailFile
				});
				if (!uploadRes.ok) {
					recThumbnailError = $t('recordings.error.s3UploadFailed');
					return;
				}
				patch.thumbnail_url = publicUrl;
				patch.thumbnail_s3_key = key;
			} else if (recThumbnailAction === 'remove') {
				patch.thumbnail_url = null;
				patch.thumbnail_s3_key = null;
			}

			const hasMetadataPatch = Object.keys(patch).length > 0;

			if (hasMetadataPatch) {
				const res = await fetch(`/api/recordings/${rec._id}`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(patch)
				});
				if (!res.ok) {
					const msg = (await res.text()) || $t('recordings.error.http', { status: res.status });
					// Route the YouTube-URL validation error to its inline slot
					// instead of the thumbnail error area.
					if (msg.includes('YouTube')) recYoutubeError = msg;
					else recThumbnailError = msg;
					return;
				}
				recYoutubeError = null;
			}

			if (recPdfFile) {
				const uploaded = await uploadRecordingTranscript(rec);
				if (!uploaded) return;
			}

			// Replace audio last — if the file upload fails, metadata edits above
			// still landed. Admin can retry audio on next open.
			if (recAudioFile && recAudioDurationSec) {
				const presign = await fetch(`/api/recordings/${rec._id}/audio/upload-url`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ contentType: 'audio/mpeg' })
				});
				if (!presign.ok) {
					recAudioError = (await presign.text()) || $t('recordings.error.http', { status: presign.status });
					return;
				}
				const { uploadUrl, s3Key } = (await presign.json()) as { uploadUrl: string; s3Key: string };
				recAudioUploadPct = 0;
				try {
					await putWithProgress(uploadUrl, recAudioFile, 'audio/mpeg', (pct) => {
						recAudioUploadPct = pct;
					});
				} catch (err) {
					recAudioError = err instanceof Error ? err.message : $t('recordings.error.s3UploadFailed');
					recAudioUploadPct = null;
					return;
				}
				const finalize = await fetch(`/api/recordings/${rec._id}/audio/finalize`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						s3_key: s3Key,
						size_bytes: recAudioFile.size,
						duration_sec: recAudioDurationSec
					})
				});
				if (!finalize.ok) {
					recAudioError = (await finalize.text()) || $t('recordings.error.http', { status: finalize.status });
					return;
				}
			} else if (!hasMetadataPatch && !recPdfFile && !recSubtitleChanged(rec)) {
				cancelRecordingEdit();
				return;
			}

			const subtitleChanged = recSubtitleChanged(rec);
			if (subtitleChanged) {
				const ok = await saveRecSubtitle(rec);
				if (!ok) return;
			}

			if (recPdfFile) {
				toast.success(recPdfMode === 'replace' ? $t('recordings.toast.pdfReplaced') : $t('recordings.toast.pdfAdded'));
			}
			if (subtitleChanged) {
				toast.success($t('recordings.toast.subtitleSaved'));
			}
			cancelRecordingEdit();
			await refreshVisibleRecordings();
		} finally {
			recSaving = false;
		}
	}

	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let tickTimer: ReturnType<typeof setInterval> | null = null;

	const isRecording = $derived(recorder.available && 'recording' in recorder && recorder.recording);
	const showLiveBanner = $derived(
		icecast.reachable && icecast.sourceActive && !isRecording
	);

	async function refreshStatus() {
		// Hot path: this fires every 5s. Hit a dedicated lightweight endpoint
		// instead of invalidateAll(), which would re-run the full page+layout
		// load (recordings list, broadcast doc, push subscriptions count) for
		// data that doesn't change between polls. Update local mirrors only.
		try {
			const res = await fetch('/api/recordings/status', {
				headers: { Accept: 'application/json' }
			});
			if (res.ok) {
				const body = (await res.json()) as {
					recorder: RecorderSnapshot;
					icecast: IcecastSnapshot;
				};
				recorder = body.recorder;
				icecast = body.icecast;
			}
		} catch {
			// Transient network error — next tick will retry.
		}
		recomputeElapsed();
		await refreshWatchedRecordingList();
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
		// Resolve the streamed initial recordings list (skeleton rows until
		// then). A user-triggered fetch (search while loading) wins the race.
		void data.list.then(
			(result) => {
				if (listLoaded) return;
				recordings = result.data;
				total = result.total;
				listLoaded = true;
			},
			() => {
				if (listLoaded) return;
				listLoaded = true;
				fetchError = fetchError ?? $t('recordings.error.network');
			}
		);
		recomputeElapsed();
		pollTimer = setInterval(refreshStatus, 5000);
		tickTimer = setInterval(recomputeElapsed, 1000);
	});

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
		if (tickTimer) clearInterval(tickTimer);
		monitorDisconnect();
	});

	// ── Live monitor: always at the live edge, mute-only ────────────
	// No pause and no seeking: this is THE reference audio for syncing the
	// subtitles — it must always be exactly what listeners hear. It connects
	// muted as soon as a source is active (muted autoplay is allowed by
	// browsers) and the only control is the mute toggle. Any interruption
	// (OS pause, stream hiccup) reconnects fresh at the live edge rather
	// than ever sitting on stale buffered audio.
	let monitorEl = $state<HTMLAudioElement | null>(null);
	let monitorMuted = $state(true);
	let monitorLive = $state(false);
	let monitorConnecting = false;
	let monitorRetryTimer: ReturnType<typeof setTimeout> | null = null;

	function monitorConnect() {
		if (!monitorEl || monitorConnecting || monitorLive) return;
		monitorConnecting = true;
		const sep = data.liveStreamUrl.includes('?') ? '&' : '?';
		monitorEl.muted = monitorMuted;
		monitorEl.src = `${data.liveStreamUrl}${sep}t=${Date.now()}`;
		monitorEl.load();
		monitorEl
			.play()
			.then(() => {
				monitorConnecting = false;
				monitorLive = true;
			})
			.catch(() => {
				monitorConnecting = false;
				scheduleMonitorRetry();
			});
	}

	function monitorDisconnect() {
		if (monitorRetryTimer) {
			clearTimeout(monitorRetryTimer);
			monitorRetryTimer = null;
		}
		monitorLive = false;
		monitorConnecting = false;
		if (monitorEl) {
			monitorEl.pause();
			monitorEl.removeAttribute('src');
			monitorEl.load();
		}
	}

	function scheduleMonitorRetry() {
		monitorLive = false;
		if (monitorRetryTimer) return;
		monitorRetryTimer = setTimeout(() => {
			monitorRetryTimer = null;
			// sourceActive is refreshed by the 5s status poll — give up
			// quietly once the stream is genuinely gone.
			if (icecast.sourceActive) monitorConnect();
		}, 4000);
	}

	function onMonitorInterrupted() {
		// pause/ended/error while we believed we were live → reconnect fresh.
		if (monitorLive) scheduleMonitorRetry();
	}

	function toggleMonitorMute() {
		monitorMuted = !monitorMuted;
		if (monitorEl) monitorEl.muted = monitorMuted;
		// The click is a user gesture — if autoplay was blocked earlier,
		// connect now.
		if (!monitorMuted && !monitorLive) monitorConnect();
	}

	// Follow the source: connect when a stream appears, tear down when it ends.
	let monitorLastSourceActive = false;
	$effect(() => {
		const active = icecast.sourceActive;
		if (active === monitorLastSourceActive) return;
		monitorLastSourceActive = active;
		if (active) monitorConnect();
		else monitorDisconnect();
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
				actionError = text || $t('recordings.error.http', { status: res.status });
			} else {
				await readRecordingId(res);
			}
			await refreshStatus();
			await refreshVisibleRecordings();
		} finally {
			busy = false;
		}
	}

	async function stop() {
		if (busy) return;
		if (!(await confirmOverride(recordingStartedBy, recordingStartedByName, $t('recordings.confirm.override.recordingLabel')))) return;
		busy = true;
		actionError = null;
		let stoppedRecording = false;
		try {
			const res = await fetch('/api/recordings/stop', { method: 'POST' });
			if (!res.ok) {
				const text = await res.text();
				actionError = text || $t('recordings.error.http', { status: res.status });
			} else {
				stoppedRecording = true;
				watchRecordingList(await readRecordingId(res));
			}
			await refreshStatus();
			if (stoppedRecording && !watchedRecordingId) await refreshVisibleRecordings();
		} finally {
			busy = false;
		}
	}

	async function goLive() {
		if (broadcastBusy) return;
		const willNotify = notifyOnGoLive && subscriberCount > 0;
		const msg = willNotify
			? subscriberCount > 1
				? $t('recordings.confirm.goLive.notifyMany', { count: subscriberCount })
				: $t('recordings.confirm.goLive.notifyOne', { count: subscriberCount })
			: notifyOnGoLive
				? $t('recordings.confirm.goLive.noSubscribers')
				: $t('recordings.confirm.goLive.silent');
		const ok = await confirmDialog.ask({
			title: $t('recordings.actions.goLive'),
			message: msg,
			confirmLabel: willNotify ? $t('recordings.confirm.goLive.confirmNotify') : $t('recordings.actions.goLive'),
			cancelLabel: $t('recordings.common.cancel'),
			tone: willNotify ? 'default' : 'warning'
		});
		if (!ok) return;
		broadcastBusy = true;
		actionError = null;
		try {
			const res = await fetch('/api/broadcast/go-live', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notify: notifyOnGoLive })
			});
			if (!res.ok) {
				const text = await res.text();
				actionError = text || $t('recordings.error.http', { status: res.status });
			} else {
				// The handler links (or back-fills) a scheduled_lives entry and
				// returns its stable watch URL — surface it right away.
				const payload = (await res.json().catch(() => null)) as { watchPath?: string } | null;
				if (payload?.watchPath) {
					toast.success($t('recordings.toast.liveWithLink', { url: `${data.publicBaseUrl}${payload.watchPath}` }));
				}
			}
			await invalidateAll();
		} finally {
			broadcastBusy = false;
		}
	}

	async function endLive() {
		if (broadcastBusy) return;
		if (!(await confirmOverride(broadcastStartedBy, broadcastStartedByName, $t('recordings.confirm.override.liveLabel')))) return;
		const ok = await confirmDialog.ask({
			title: $t('recordings.actions.endLive'),
			message: $t('recordings.confirm.endLive.message'),
			confirmLabel: $t('recordings.actions.endLive'),
			cancelLabel: $t('recordings.common.cancel'),
			tone: 'warning'
		});
		if (!ok) return;
		broadcastBusy = true;
		actionError = null;
		try {
			const res = await fetch('/api/broadcast/end-live', { method: 'POST' });
			if (!res.ok) {
				const text = await res.text();
				actionError = text || $t('recordings.error.http', { status: res.status });
			}
			await invalidateAll();
		} finally {
			broadcastBusy = false;
		}
	}

	// ── Broadcast metadata (single unified edit mode) ─────────────────
	// One "Modifier" puts the whole section into edit mode; one "Enregistrer"
	// commits title + description + thumbnail changes in a single flow.
	let metadataEditing = $state(false);
	let metadataSaving = $state(false);
	let titleDraft = $state<string>('');
	let descriptionDraft = $state<string>('');
	let youtubeUrlDraft = $state<string>('');
	let broadcastYoutubeError = $state<string | null>(null);
	const YOUTUBE_CHANNEL_LIVE_URL = 'https://www.youtube.com/@MissionnaireNetwork/live';
	// Thumbnail staging — upload deferred to Save so cancel doesn't leave orphans.
	let thumbnailFile = $state<File | null>(null);
	let thumbnailPreviewUrl = $state<string | null>(null);
	let thumbnailAction = $state<'keep' | 'replace' | 'remove'>('keep');
	let thumbnailError = $state<string | null>(null);
	let thumbnailExpanded = $state(false);
	// Also store the freshly-uploaded thumbnail as the channel default — the
	// fallback used whenever a future live starts without its own thumbnail
	// (go-live copies it onto the gate, so recordings snapshot it too).
	let setAsDefaultThumbnail = $state(false);
	// Default ON: normal broadcasts notify. Uncheck for silent tests/re-broadcasts.
	let notifyOnGoLive = $state(true);

	function enterEditMode() {
		titleDraft = broadcast.title ?? '';
		descriptionDraft = broadcast.description ?? '';
		// Pre-fill with the channel-live URL when nothing's set, so admin
		// rarely has to type — they can just paste a specific video URL
		// once the live ends and the VOD is published.
		youtubeUrlDraft = broadcast.youtube_url ?? YOUTUBE_CHANNEL_LIVE_URL;
		broadcastYoutubeError = null;
		thumbnailFile = null;
		thumbnailAction = 'keep';
		if (thumbnailPreviewUrl) URL.revokeObjectURL(thumbnailPreviewUrl);
		thumbnailPreviewUrl = null;
		thumbnailError = null;
		setAsDefaultThumbnail = false;
		metadataEditing = true;
	}

	function cancelEditMode() {
		if (thumbnailPreviewUrl) URL.revokeObjectURL(thumbnailPreviewUrl);
		thumbnailPreviewUrl = null;
		thumbnailFile = null;
		thumbnailAction = 'keep';
		thumbnailError = null;
		setAsDefaultThumbnail = false;
		metadataEditing = false;
	}

	function berlinDateYmd(d: Date): string {
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Europe/Berlin',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).formatToParts(d);
		const y = parts.find((p) => p.type === 'year')?.value ?? '';
		const m = parts.find((p) => p.type === 'month')?.value ?? '';
		const day = parts.find((p) => p.type === 'day')?.value ?? '';
		return `${y}-${m}-${day}`;
	}

	// Applies stored defaults directly — no modal. Defaults are managed from
	// the settings page; this button just pushes them to the live broadcast.
	let applyingDefaults = $state(false);
	let applyDefaultsError = $state<string | null>(null);

	const FALLBACK_DEFAULT_TITLE = '{date} Missionnaire Network Live audio';
	const FALLBACK_DEFAULT_DESCRIPTION =
		'Rediffusion du direct de Missionnaire Network — prédications, enseignements et louanges.';

	function renderTitleTemplate(template: string): string {
		const date = berlinDateYmd(new Date());
		// If the template uses {date}, substitute; otherwise prepend so we never
		// end up with a dateless title (the original spec requires it at start).
		return template.includes('{date}') ? template.replaceAll('{date}', date) : `${date} ${template}`;
	}

	async function applyDefaultsDirectly() {
		if (applyingDefaults) return;
		applyingDefaults = true;
		applyDefaultsError = null;
		try {
			const storedTitle = broadcast.default_title?.trim();
			const storedDesc = broadcast.default_description?.trim();
			const patch: Record<string, unknown> = {
				title: renderTitleTemplate(storedTitle || FALLBACK_DEFAULT_TITLE),
				description: storedDesc || FALLBACK_DEFAULT_DESCRIPTION
			};
			// Point the live broadcast at the stored default thumbnail (no
			// re-upload — we reuse the existing S3 object). If no default is
			// set, clear any live thumbnail so the placeholder shows instead.
			if (broadcast.default_thumbnail_url && broadcast.default_thumbnail_s3_key) {
				patch.thumbnail_url = broadcast.default_thumbnail_url;
				patch.thumbnail_s3_key = broadcast.default_thumbnail_s3_key;
			} else if (broadcast.thumbnail_url) {
				patch.thumbnail_url = null;
				patch.thumbnail_s3_key = null;
			}

			const res = await fetch('/api/broadcast/metadata', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch)
			});
			if (!res.ok) {
				applyDefaultsError = (await res.text()) || $t('recordings.error.http', { status: res.status });
				return;
			}
			await invalidateAll();
		} finally {
			applyingDefaults = false;
		}
	}

	function onThumbnailFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			thumbnailError = $t('recordings.error.selectImage');
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			thumbnailError = $t('recordings.error.imageTooLarge');
			return;
		}
		thumbnailError = null;
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

	/** Returns the image URL to show in the preview slot during edit mode. */
	const previewSrc = $derived.by(() => {
		if (thumbnailPreviewUrl) return thumbnailPreviewUrl;
		if (thumbnailAction === 'remove') return null;
		if (broadcastThumbnailBroken) return null;
		return broadcast.thumbnail_url;
	});

	async function saveMetadata() {
		if (metadataSaving) return;
		metadataSaving = true;
		thumbnailError = null;
		try {
			const patch: Record<string, unknown> = {};

			// Title / description — only send changed fields.
			const nextTitle = titleDraft.trim() || null;
			if (nextTitle !== (broadcast.title ?? null)) patch.title = nextTitle;
			const nextDescription = descriptionDraft.trim() || null;
			if (nextDescription !== (broadcast.description ?? null)) patch.description = nextDescription;

			// YouTube URL: send raw string; server validates as http(s) URL.
			// Empty clears (the read side falls back to the channel-live URL).
			const nextYoutube = youtubeUrlDraft.trim() || null;
			if (nextYoutube !== (broadcast.youtube_url ?? null)) {
				patch.youtube_url = nextYoutube;
			}

			// Thumbnail — upload only if a new file was picked; remove or keep otherwise.
			if (thumbnailAction === 'replace' && thumbnailFile) {
				const presignRes = await fetch('/api/broadcast/thumbnail/presign', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ contentType: thumbnailFile.type, size: thumbnailFile.size })
				});
				if (!presignRes.ok) {
					thumbnailError = (await presignRes.text()) || $t('recordings.error.http', { status: presignRes.status });
					return;
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
					thumbnailError = $t('recordings.error.s3UploadFailed');
					return;
				}
				patch.thumbnail_url = publicUrl;
				patch.thumbnail_s3_key = key;
			} else if (thumbnailAction === 'remove') {
				patch.thumbnail_url = null;
				patch.thumbnail_s3_key = null;
			}

			if (Object.keys(patch).length === 0) {
				// Nothing changed — just exit edit mode.
				cancelEditMode();
				return;
			}

			const res = await fetch('/api/broadcast/metadata', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch)
			});
			if (!res.ok) {
				const msg = (await res.text()) || $t('recordings.error.http', { status: res.status });
				if (msg.includes('YouTube')) broadcastYoutubeError = msg;
				else thumbnailError = msg;
				return;
			}

			// Persist the new thumbnail as the channel default too, if asked.
			// Separate endpoint so a failure here doesn't undo the metadata save —
			// just surface it.
			if (setAsDefaultThumbnail && typeof patch.thumbnail_url === 'string') {
				const defRes = await fetch('/api/broadcast/defaults', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						default_thumbnail_url: patch.thumbnail_url,
						default_thumbnail_s3_key: patch.thumbnail_s3_key
					})
				});
				if (!defRes.ok) {
					toast.error($t('recordings.toast.defaultThumbnailFailed'));
				} else {
					toast.success($t('recordings.toast.defaultThumbnailSet'));
				}
			}

			broadcastYoutubeError = null;
			cancelEditMode();
			await invalidateAll();
		} finally {
			metadataSaving = false;
		}
	}

	function openThumbnail() {
		if (!broadcast.thumbnail_url) return;
		thumbnailExpanded = true;
	}
	function closeThumbnail() {
		thumbnailExpanded = false;
	}
	function onLightboxKeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		// Layered: thumbnail lightbox → broadcast modal → recording modal
		// (close the topmost one, one press per close).
		if (thumbnailExpanded) {
			closeThumbnail();
		} else if (metadataEditing && !metadataSaving) {
			cancelEditMode();
		} else if (editingRecordingId && !recSaving) {
			cancelRecordingEdit();
		}
	}
	function onBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) closeThumbnail();
	}
	function onEditModalBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget && !recSaving) cancelRecordingEdit();
	}
	function onBroadcastModalBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget && !metadataSaving) cancelEditMode();
	}
	function getEditingRecording(): Recording | null {
		if (!editingRecordingId) return null;
		return recordings.find((r) => r._id === editingRecordingId) ?? null;
	}

	/** End the live broadcast AND stop the recording in one click. Order matters:
	 *  end-live first so the public site flips offline immediately, then stop
	 *  recording (which triggers the S3 upload). Single confirmation for both. */
	async function stopBoth() {
		if (broadcastBusy || busy) return;
		if (!(await confirmOverride(broadcastStartedBy, broadcastStartedByName, $t('recordings.confirm.override.liveLabel')))) return;
		if (!(await confirmOverride(recordingStartedBy, recordingStartedByName, $t('recordings.confirm.override.recordingLabel')))) return;
		const ok = await confirmDialog.ask({
			title: $t('recordings.actions.stopAll'),
			message: $t('recordings.confirm.stopAll.message'),
			confirmLabel: $t('recordings.actions.stopAll'),
			cancelLabel: $t('recordings.common.cancel'),
			tone: 'warning'
		});
		if (!ok) return;
		broadcastBusy = true;
		busy = true;
		actionError = null;
		let stoppedRecording = false;
		try {
			const liveRes = await fetch('/api/broadcast/end-live', { method: 'POST' });
			if (!liveRes.ok) {
				actionError = (await liveRes.text()) || $t('recordings.error.endLiveHttp', { status: liveRes.status });
			}
			const recRes = await fetch('/api/recordings/stop', { method: 'POST' });
			if (!recRes.ok) {
				const recErr = (await recRes.text()) || `${recRes.status}`;
				actionError = actionError
					? $t('recordings.error.stopRecordingCombined', { error: actionError, detail: recErr })
					: $t('recordings.error.stopRecording', { detail: recErr });
			} else {
				stoppedRecording = true;
				watchRecordingList(await readRecordingId(recRes));
			}
			await refreshStatus();
			if (stoppedRecording && !watchedRecordingId) await refreshVisibleRecordings();
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
			? subscriberCount > 1
				? $t('recordings.confirm.startAll.notifyMany', { count: subscriberCount })
				: $t('recordings.confirm.startAll.notifyOne', { count: subscriberCount })
			: $t('recordings.confirm.startAll.message');
		const ok = await confirmDialog.ask({
			title: $t('recordings.actions.startAll'),
			message: msg,
			confirmLabel: $t('recordings.actions.startAll'),
			cancelLabel: $t('recordings.common.cancel')
		});
		if (!ok) return;
		broadcastBusy = true;
		busy = true;
		actionError = null;
		try {
			const liveRes = await fetch('/api/broadcast/go-live', { method: 'POST' });
			if (!liveRes.ok) {
				actionError = (await liveRes.text()) || $t('recordings.error.http', { status: liveRes.status });
				return;
			}
			const recRes = await fetch('/api/recordings/start', { method: 'POST' });
			if (!recRes.ok) {
				actionError = $t('recordings.error.startRecordingAfterLive', { detail: (await recRes.text()) || recRes.status });
			} else {
				await readRecordingId(recRes);
			}
			await refreshStatus();
			await refreshVisibleRecordings();
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

	async function togglePublish(rec: Recording) {
		await fetch(`/api/recordings/${rec._id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ published: !rec.published })
		});
		await refreshVisibleRecordings();
	}

	async function retryUpload(id: string) {
		const res = await fetch(`/api/recordings/retry/${id}`, { method: 'POST' });
		if (!res.ok) actionError = await res.text();
		await refreshVisibleRecordings();
	}

	async function remove(id: string) {
		if (!canDeleteRecordings) {
			toast.error($t('recordings.error.noDeletePermission'));
			return;
		}
		const ok = await confirmDialog.ask({
			title: $t('recordings.confirm.delete.title'),
			message: $t('recordings.confirm.delete.message'),
			confirmLabel: $t('recordings.common.delete'),
			cancelLabel: $t('recordings.common.cancel'),
			tone: 'danger'
		});
		if (!ok) return;
		const res = await fetch(`/api/recordings/${id}`, { method: 'DELETE' });
		if (!res.ok) {
			toast.error((await res.text()) || $t('recordings.error.http', { status: res.status }));
			return;
		}
		toast.success($t('recordings.toast.deleted'));
		await refreshVisibleRecordings();
	}

	const statusLabel: Record<RecordingStatus, TranslationKey> = {
		recording: 'recordings.status.recording',
		uploading: 'recordings.status.uploading',
		ready: 'recordings.status.ready',
		failed: 'recordings.status.failed'
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
	<title>{$t('recordings.head.title')}</title>
</svelte:head>

<div class="mb-8">
	<h1 class="font-display text-3xl font-bold text-stone-800">{$t('recordings.title')}</h1>
	<p class="mt-1 text-sm text-stone-500">
		{$t('recordings.subtitle')}
		{#if listLoaded}
			{total !== 1 ? $t('recordings.countMany', { count: total }) : $t('recordings.countOne', { count: total })}
		{/if}
	</p>
</div>

{#if !recorder.available}
	<div class="mb-6 border border-red-200 bg-red-50/80 p-5">
		<p class="text-sm font-semibold text-red-800">{$t('recordings.recorderUnreachable')}</p>
		<p class="mt-1 text-xs text-red-600">{recorder.error}</p>
	</div>
{/if}

{#if showLiveBanner}
	<div class="mb-6 border border-green-200 bg-green-50/80 p-5">
		<div class="flex items-start gap-3">
			<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-100">
				<span class="relative inline-flex h-2.5 w-2.5">
					<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75"></span>
					<span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-600"></span>
				</span>
			</div>
			<div>
				<p class="text-sm font-semibold text-green-800">{$t('recordings.liveDetected.title')}</p>
				<p class="mt-1 text-xs text-green-700">
					{$t('recordings.liveDetected.body1')} <strong>{$t('recordings.actions.startRecording')}</strong> {$t('recordings.liveDetected.body2')}
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
{#snippet iconRecordStop()}
	<svg class="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
		<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.75" />
		<circle cx="12" cy="12" r="3.75" fill="currentColor" />
	</svg>
{/snippet}
{#snippet iconLiveStop()}
	<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
		<path stroke-linecap="round" stroke-linejoin="round" d="M12 3v9M5.5 8a8 8 0 1013 0" />
	</svg>
{/snippet}
{#snippet iconBoth()}
	<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
		<circle cx="9" cy="12" r="3" fill="currentColor" stroke="none" />
		<path stroke-linecap="round" stroke-linejoin="round" d="M15 9a4.5 4.5 0 010 6m2.5-8.5a8 8 0 010 11" />
	</svg>
{/snippet}

<div class="mb-8 border bg-white/40 p-6 {broadcast.is_live ? 'border-red-200' : 'border-stone-200/60'}">
	<!-- Header: status + timers -->
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div class="flex items-center gap-4">
			<div class="flex h-12 w-12 items-center justify-center rounded-full {broadcast.is_live || isRecording ? 'bg-red-50' : 'bg-stone-100'}">
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
					<p class="font-display text-lg font-semibold text-red-700">{$t('recordings.state.liveAndRecording')}</p>
					<p class="text-xs text-stone-500">
						{$t('recordings.state.liveAndRecordingHint')}
					</p>
					{#if broadcastStartedBy || recordingStartedBy}
						<p class="mt-0.5 text-[11px] text-stone-400">
							{#if broadcastStartedBy && recordingStartedBy && broadcastStartedBy === recordingStartedBy}
								{$t('recordings.state.startedBy')} <span class="font-medium text-stone-600">{displayName(broadcastStartedByName, broadcastStartedBy)}</span>
							{:else}
								{#if broadcastStartedBy}{$t('recordings.state.livePrefix')} <span class="font-medium text-stone-600">{displayName(broadcastStartedByName, broadcastStartedBy)}</span>{/if}
								{#if broadcastStartedBy && recordingStartedBy} · {/if}
								{#if recordingStartedBy}{$t('recordings.state.recPrefix')} <span class="font-medium text-stone-600">{displayName(recordingStartedByName, recordingStartedBy)}</span>{/if}
							{/if}
						</p>
					{/if}
				{:else if broadcast.is_live}
					<p class="font-display text-lg font-semibold text-red-700">{$t('recordings.state.live')}</p>
					<p class="text-xs text-stone-500">
						{$t('recordings.state.startedAt', { time: formatTime(broadcast.started_at) })} · {icecast.listeners !== 1 ? $t('recordings.listenersMany', { count: icecast.listeners }) : $t('recordings.listenersOne', { count: icecast.listeners })}
						{#if broadcastStartedBy} · {$t('recordings.state.by')} <span class="font-medium text-stone-600">{displayName(broadcastStartedByName, broadcastStartedBy)}</span>{/if}
					</p>
				{:else if isRecording}
					<p class="font-display text-lg font-semibold text-stone-800">{$t('recordings.state.recordingOnly')}</p>
					<p class="text-xs text-stone-500">
						{$t('recordings.state.recordingOnlyHint')}
						{#if recordingStartedBy} · {$t('recordings.state.by')} <span class="font-medium text-stone-600">{displayName(recordingStartedByName, recordingStartedBy)}</span>{/if}
					</p>
				{:else}
					<p class="font-display text-lg font-semibold text-stone-800">{$t('recordings.state.readyToBroadcast')}</p>
					<p class="text-xs text-stone-500">
						{#if icecast.reachable}
							{$t('recordings.state.icecastStream', { state: icecast.sourceActive ? $t('recordings.state.streamActive') : $t('recordings.state.streamInactive') })} · {icecast.listeners !== 1 ? $t('recordings.listenersMany', { count: icecast.listeners }) : $t('recordings.listenersOne', { count: icecast.listeners })}
						{:else}
							{$t('recordings.state.icecastUnreachable')}
						{/if}
						{#if subscriberCount > 0} · {subscriberCount > 1 ? $t('recordings.subscribersMany', { count: subscriberCount }) : $t('recordings.subscribersOne', { count: subscriberCount })}{/if}
					</p>
				{/if}
			</div>
		</div>

		<!-- Live timers (shown only for active states). Full-width on mobile so
		     both timers split the row evenly; right-aligned block on desktop. -->
		{#if broadcast.is_live || isRecording}
			<div class="flex w-full items-start gap-6 sm:w-auto sm:items-center sm:gap-5">
				{#if broadcast.is_live}
					<div class="flex flex-1 flex-col sm:flex-initial sm:items-end">
						<span class="text-[9px] font-bold uppercase tracking-[0.2em] text-red-600">{$t('recordings.timer.live')}</span>
						<span class="font-mono text-2xl font-semibold text-red-700 tabular-nums leading-tight">
							{formatElapsed(broadcastElapsed)}
						</span>
					</div>
				{/if}
				{#if isRecording}
					<div class="flex flex-1 flex-col sm:flex-initial sm:items-end">
						<span class="text-[9px] font-bold uppercase tracking-[0.2em] {sourceRecovering ? 'text-amber-600' : 'text-stone-500'}">{$t('recordings.timer.recording')}</span>
						<span class="font-mono text-2xl font-semibold {sourceRecovering ? 'text-amber-700' : 'text-stone-700'} tabular-nums leading-tight">
							{formatElapsed(elapsed)}
						</span>
						{#if sourceRecovering}
							<span class="mt-1 inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-700">
								<span class="relative inline-flex h-1.5 w-1.5">
									<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75"></span>
									<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500"></span>
								</span>
								{$t('recordings.timer.reconnecting')}
								{#if segmentCount > 1} · {$t('recordings.timer.segments', { count: segmentCount })}{/if}
							</span>
						{:else if segmentCount > 1}
							<span class="mt-1 text-[10px] text-stone-500">
								{$t('recordings.timer.segmentsMerge', { count: segmentCount })}
							</span>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Public watch link — stable URL that follows this broadcast from live to replay -->
	{#if broadcast.is_live && publicWatchUrl}
		<div class="mt-4 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-4">
			<span class="shrink-0 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
				{$t('recordings.publicLink')}
			</span>
			<code class="min-w-0 flex-1 truncate border border-stone-200/60 bg-stone-50 px-3 py-1.5 text-[11px] text-stone-500">
				{publicWatchUrl}
			</code>
			<button
				type="button"
				class="shrink-0 border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-stone-600 transition-colors hover:border-primary hover:bg-primary hover:text-white"
				onclick={copyWatchLink}
			>
				{$t('recordings.common.copy')}
			</button>
			<a
				href={publicWatchUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="shrink-0 border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-stone-600 transition-colors hover:border-stone-900 hover:bg-stone-900 hover:text-white"
			>
				{$t('recordings.common.open')}
			</a>
		</div>
	{/if}

	<!-- Actions -->
	<div class="mt-5 border-t border-stone-100 pt-5">
		{#if !icecast.sourceActive && !broadcast.is_live && !isRecording}
			<span class="inline-flex items-center gap-2 border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-medium text-stone-400">
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
				</svg>
				{$t('recordings.waitingForStream')}
			</span>
		{:else if broadcast.is_live && isRecording}
			<!-- All three actions stay visible, equal-height, each with a distinct
			     tonal identity at rest so they're recognizable at a glance:
			     stone = direct, rose = enregistrement, red-700 = session totale. -->
			<p class="mb-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
				{$t('recordings.sessionControls')}
			</p>
			<div class="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
				<button
					onclick={endLive}
					disabled={broadcastBusy}
					class="inline-flex items-center justify-center gap-2 border border-stone-300 bg-stone-100 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-800 transition-all hover:border-stone-900 hover:bg-stone-900 hover:text-white disabled:opacity-50 sm:order-1"
				>
					{@render iconLiveStop()}
					<span>{broadcastBusy ? '…' : $t('recordings.actions.endLive')}</span>
				</button>
				<button
					onclick={stop}
					disabled={busy}
					class="inline-flex items-center justify-center gap-2 border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-rose-700 transition-all hover:border-rose-600 hover:bg-rose-600 hover:text-white disabled:opacity-50 sm:order-2"
				>
					{@render iconRecordStop()}
					<span>{busy ? $t('recordings.busy.stopping') : $t('recordings.actions.stopRecording')}</span>
				</button>
				<button
					onclick={stopBoth}
					disabled={broadcastBusy || busy}
					class="order-first inline-flex items-center justify-center gap-2 bg-red-700 px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.2em] text-white shadow-sm shadow-red-700/30 ring-1 ring-red-700/60 transition-all hover:bg-red-800 hover:shadow-md hover:shadow-red-700/40 disabled:opacity-50 sm:order-3"
				>
					{@render iconStop()}
					<span>{(broadcastBusy || busy) ? $t('recordings.busy.stopping') : $t('recordings.actions.stopAll')}</span>
				</button>
			</div>
		{:else if !broadcast.is_live && !isRecording && icecast.sourceActive}
			<!-- Mirror of the stop cluster: stone = direct, orange = enregistrement,
			     emerald = session complète. -->
			<p class="mb-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
				{$t('recordings.sessionStart')}
			</p>
			<div class="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
				<button
					onclick={goLive}
					disabled={broadcastBusy}
					class="inline-flex items-center justify-center gap-2 border border-stone-300 bg-stone-100 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-800 transition-all hover:border-stone-900 hover:bg-stone-900 hover:text-white disabled:opacity-50 sm:order-1"
				>
					{@render iconBroadcast()}
					<span>{broadcastBusy ? '…' : $t('recordings.actions.goLive')}</span>
				</button>
				<button
					onclick={start}
					disabled={busy || !recorder.available || ('pendingOrphans' in recorder && recorder.pendingOrphans > 0)}
					class="inline-flex items-center justify-center gap-2 border border-orange-200 bg-orange-50 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-primary transition-all hover:border-primary hover:bg-primary hover:text-white disabled:opacity-50 sm:order-2"
				>
					{@render iconRecord()}
					<span>{busy ? '…' : $t('recordings.actions.record')}</span>
				</button>
				<button
					onclick={startBoth}
					disabled={broadcastBusy || busy || !recorder.available || ('pendingOrphans' in recorder && recorder.pendingOrphans > 0)}
					class="order-first inline-flex items-center justify-center gap-2 bg-emerald-600 px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.2em] text-white shadow-sm shadow-emerald-600/30 ring-1 ring-emerald-600/50 transition-all hover:bg-emerald-700 hover:shadow-md hover:shadow-emerald-600/40 disabled:opacity-50 sm:order-3"
				>
					{@render iconBoth()}
					<span>{(broadcastBusy || busy) ? $t('recordings.busy.starting') : $t('recordings.actions.startAll')}</span>
				</button>
			</div>
		{:else if broadcast.is_live}
			<!-- Direct seul : arrêt du direct (tonalité stone) + démarrage de
			     l'enregistrement (tonalité orange). -->
			<p class="mb-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
				{$t('recordings.sessionControls')}
			</p>
			<div class="grid gap-2 sm:grid-cols-2">
				<button
					onclick={endLive}
					disabled={broadcastBusy}
					class="inline-flex items-center justify-center gap-2 bg-stone-800 px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.2em] text-white shadow-sm shadow-stone-900/20 ring-1 ring-stone-900/40 transition-all hover:bg-stone-900 hover:shadow-md hover:shadow-stone-900/30 disabled:opacity-50"
				>
					{@render iconLiveStop()}
					<span>{broadcastBusy ? $t('recordings.busy.stopping') : $t('recordings.actions.endLive')}</span>
				</button>
				<button
					onclick={start}
					disabled={busy || !recorder.available || ('pendingOrphans' in recorder && recorder.pendingOrphans > 0)}
					class="inline-flex items-center justify-center gap-2 border border-orange-200 bg-orange-50 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-primary transition-all hover:border-primary hover:bg-primary hover:text-white disabled:opacity-50"
				>
					{@render iconRecord()}
					<span>{busy ? $t('recordings.busy.starting') : $t('recordings.actions.startRecording')}</span>
				</button>
			</div>
		{:else if isRecording}
			<!-- Enregistrement seul : arrêt (tonalité rose) + passage en direct
			     (tonalité stone pour le domaine broadcast). -->
			<p class="mb-2.5 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400">
				{$t('recordings.sessionControls')}
			</p>
			<div class="grid gap-2 sm:grid-cols-2">
				<button
					onclick={stop}
					disabled={busy}
					class="inline-flex items-center justify-center gap-2 bg-rose-600 px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.2em] text-white shadow-sm shadow-rose-600/30 ring-1 ring-rose-600/50 transition-all hover:bg-rose-700 hover:shadow-md hover:shadow-rose-600/40 disabled:opacity-50"
				>
					{@render iconRecordStop()}
					<span>{busy ? $t('recordings.busy.stopping') : $t('recordings.actions.stopRecording')}</span>
				</button>
				<button
					onclick={goLive}
					disabled={broadcastBusy}
					class="inline-flex items-center justify-center gap-2 border border-stone-300 bg-stone-100 px-4 py-3 text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-800 transition-all hover:border-stone-900 hover:bg-stone-900 hover:text-white disabled:opacity-50"
				>
					{@render iconBroadcast()}
					<span>{broadcastBusy ? '…' : $t('recordings.actions.goLive')}</span>
				</button>
			</div>
		{/if}
	</div>

	{#if recorder.available && 'pendingOrphans' in recorder && recorder.pendingOrphans > 0}
		<p class="mt-4 bg-amber-50 px-3 py-2 text-xs text-amber-700">
			{$t('recordings.pendingOrphans', { count: recorder.pendingOrphans })}
		</p>
	{/if}

	{#if actionError}
		<p class="mt-4 bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</p>
	{/if}

	<!-- Live audio monitor -->
	<div class="mt-5 flex flex-wrap items-center gap-3 border-t border-stone-100 pt-4">
		<div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
			<svg class="h-4 w-4 text-missionnaire" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
			</svg>
			{$t('recordings.monitor.title')}
		</div>
		{#if icecast.sourceActive}
			<!-- No pause, no seek — always the live edge. Mute is the only
			     control, so this stays a trustworthy sync reference. -->
			<div class="flex h-9 flex-1 min-w-[280px] items-center gap-3 bg-stone-50 px-3">
				{#if monitorLive}
					<span class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-red-600">
						<span class="relative inline-flex h-1.5 w-1.5">
							<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"></span>
							<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500"></span>
						</span>
						{$t('recordings.monitor.live')}
					</span>
				{:else}
					<span class="text-[11px] italic text-stone-400">{$t('recordings.monitor.connecting')}</span>
				{/if}
				<span class="min-w-0 flex-1 truncate text-[10px] text-stone-400">
					{monitorMuted ? $t('recordings.monitor.mutedHint') : $t('recordings.monitor.unmutedHint')}
				</span>
				<button
					type="button"
					onclick={toggleMonitorMute}
					class="inline-flex shrink-0 items-center gap-1.5 border px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors {monitorMuted
						? 'border-missionnaire bg-missionnaire text-white hover:bg-missionnaire/90'
						: 'border-stone-200 bg-white text-stone-600 hover:border-stone-900 hover:bg-stone-900 hover:text-white'}"
				>
					{#if monitorMuted}
						<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
							<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
							<path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
						</svg>
						{$t('recordings.monitor.unmute')}
					{:else}
						<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
							<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
							<line x1="23" y1="9" x2="17" y2="15" />
							<line x1="17" y1="9" x2="23" y2="15" />
						</svg>
						{$t('recordings.monitor.mute')}
					{/if}
				</button>
			</div>
		{:else}
			<div class="flex h-9 flex-1 min-w-[280px] items-center bg-stone-50 px-3 text-[11px] italic text-stone-400">
				{$t('recordings.monitor.noSource')}
			</div>
		{/if}
		<span class="text-[11px] text-stone-400">
			{icecast.sourceActive ? $t('recordings.monitor.sourceActive') : $t('recordings.monitor.sourceInactive')}
		</span>
		<audio
			bind:this={monitorEl}
			preload="none"
			muted
			onpause={onMonitorInterrupted}
			onended={onMonitorInterrupted}
			onerror={onMonitorInterrupted}
		></audio>
	</div>

	<!-- Broadcast metadata: title + description + thumbnail shown on the public /live page -->
	<div class="mt-5 border-t border-stone-100 pt-5">
		<div class="mb-4 flex items-start justify-between gap-4">
			<div class="min-w-0 flex-1">
				<p class="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">
					{$t('recordings.meta.title')}
				</p>
				<p class="mt-1 text-[10px] text-stone-400">
					{$t('recordings.meta.hint')}
				</p>
			</div>
			<div class="flex shrink-0 items-center gap-2">
				<button
					type="button"
					onclick={applyDefaultsDirectly}
					disabled={applyingDefaults}
					title={$t('recordings.meta.applyDefaultsTitle')}
					class="border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-600 transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
				>
					{applyingDefaults ? $t('recordings.meta.applying') : $t('recordings.meta.defaults')}
				</button>
				<button
					type="button"
					onclick={enterEditMode}
					class="border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-600 transition-colors hover:border-primary hover:text-primary"
				>
					{$t('recordings.common.edit')}
				</button>
			</div>
		</div>

		{#if applyDefaultsError}
			<p class="mb-3 bg-red-50 px-3 py-2 text-xs text-red-700">{applyDefaultsError}</p>
		{/if}

		<!-- Full-width reminder banner — spans under the label/button row so the
		     message reads comfortably regardless of viewport size. -->
		<div class="mb-4 flex items-start gap-2.5 border border-amber-200 bg-amber-50/80 px-3.5 py-2.5">
			<svg class="h-4 w-4 shrink-0 text-amber-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.2 16c-.77 1.33.2 3 1.73 3z" />
			</svg>
			<p class="text-[11px] leading-snug text-amber-800 sm:text-xs">
				<strong>{$t('recordings.meta.reminderStrong')}</strong>{$t('recordings.meta.reminderRest')}
			</p>
		</div>

		<div class="flex flex-col gap-5 sm:flex-row sm:items-start">
			<!-- Thumbnail (view-only, click to expand) -->
			<div class="flex flex-col gap-2">
				<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.common.thumbnail')}</span>
				{#if broadcast.thumbnail_url && !broadcastThumbnailBroken}
					<button
						type="button"
						onclick={openThumbnail}
						aria-label={$t('recordings.meta.expandThumbnail')}
						class="relative h-28 w-44 overflow-hidden border border-stone-300 bg-cream/40 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 group cursor-zoom-in hover:border-primary"
					>
						<BlurUpImage
							src={vercelImage(broadcast.thumbnail_url, 384)}
							srcset={vercelImageSrcSet(broadcast.thumbnail_url, 192)}
							placeholderSrc={vercelImagePlaceholder(broadcast.thumbnail_url)}
							alt={$t('recordings.meta.thumbnailAlt')}
							width={176}
							height={112}
							loading="eager"
							fetchpriority="high"
							class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
							on:error={() => (broadcastThumbnailBroken = true)}
						/>
						<span class="pointer-events-none absolute inset-0 flex items-end justify-end p-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
							<span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow">
								<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-stone-700">
									<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
								</svg>
							</span>
						</span>
					</button>
				{:else}
					<!-- Default fallback preview — this is what the public site will show -->
					<div class="relative h-28 w-44 overflow-hidden border border-dashed border-stone-300 default-thumbnail-admin">
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
								{$t('recordings.state.live')}
							</div>
						</div>
						<span class="absolute bottom-1 left-1 rounded-sm bg-stone-900/70 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-white">
							{$t('recordings.meta.defaultBadge')}
						</span>
					</div>
				{/if}
			</div>

			<!-- Title + Description (view-only) -->
			<div class="flex flex-1 flex-col gap-4">
				<div class="flex flex-col gap-2">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.meta.liveTitle')}</span>
					<p class="text-sm {broadcast.title ? 'text-stone-700' : 'text-stone-400 italic'}">
						{broadcast.title || $t('recordings.meta.noTitle')}
					</p>
				</div>

				<div class="flex flex-col gap-2">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.common.description')}</span>
					<p class="text-sm whitespace-pre-wrap {broadcast.description ? 'text-stone-700' : 'text-stone-400 italic'}">
						{broadcast.description || $t('recordings.meta.noDescription')}
					</p>
				</div>

				<!-- YouTube link — view-only. Shows the stored URL, or the channel
				     /live URL in muted grey when nothing's been pinned yet. -->
				<div class="flex flex-col gap-2">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.common.youtubeLink')}</span>
					<a
						href={broadcast.youtube_url || YOUTUBE_CHANNEL_LIVE_URL}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center gap-1.5 text-sm {broadcast.youtube_url ? 'text-stone-700 hover:text-primary' : 'text-stone-400 italic hover:text-stone-500'} break-all transition-colors"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="shrink-0">
							<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
						</svg>
						<span>{broadcast.youtube_url || $t('recordings.meta.youtubeDefault', { url: YOUTUBE_CHANNEL_LIVE_URL })}</span>
					</a>
				</div>
			</div>
		</div>
	</div>
</div>

<!-- Subtitle sync — shown during any live: attach an SRT mid-broadcast if
     the stream started without one, then sync/nudge it. -->
{#if broadcast.is_live}
	<SubtitleSyncPanel {broadcast} />
{/if}

<!-- Scheduled lives — YouTube-style: schedule ahead, get a stable share link
     (/live/<slug>) immediately, start the live from its entry when ready. -->
<ScheduledLivesPanel
	upcoming={data.upcomingLives}
	past={data.pastLives}
	{broadcast}
	{subscriberCount}
	publicBaseUrl={data.publicBaseUrl}
/>

<!-- Search + filters toolbar -->
<div class="mb-3 flex flex-wrap items-center gap-2 sm:gap-3">
	{#if canManageRecordings}
		<button
			type="button"
			onclick={openUploadModal}
			class="inline-flex shrink-0 items-center gap-2 bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v12m0-12l-4 4m4-4l4 4M4 20h16" />
			</svg>
			<span class="hidden sm:inline">{$t('recordings.upload.title')}</span>
			<span class="sm:hidden">{$t('recordings.common.upload')}</span>
		</button>
	{/if}
	<div class="relative min-w-[220px] flex-1 basis-full sm:basis-auto">
		<svg class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
			<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-4.35-4.35M17 10a7 7 0 11-14 0 7 7 0 0114 0z" />
		</svg>
		<input
			type="search"
			bind:value={searchQuery}
			placeholder={$t('recordings.toolbar.searchPlaceholder')}
			class="admin-input w-full !pl-10 text-sm"
		/>
	</div>

	<select
		bind:value={statusFilter}
		aria-label={$t('recordings.toolbar.filterStatus')}
		class="admin-input !w-auto text-sm"
	>
		<option value="all">{$t('recordings.toolbar.allStatuses')}</option>
		<option value="ready">{$t('recordings.status.ready')}</option>
		<option value="recording">{$t('recordings.status.recording')}</option>
		<option value="uploading">{$t('recordings.status.uploading')}</option>
		<option value="failed">{$t('recordings.status.failed')}</option>
	</select>

	<select
		bind:value={publishedFilter}
		aria-label={$t('recordings.toolbar.filterPublished')}
		class="admin-input !w-auto text-sm"
	>
		<option value="all">{$t('recordings.toolbar.all')}</option>
		<option value="published">{$t('recordings.toolbar.published')}</option>
		<option value="unpublished">{$t('recordings.toolbar.unpublished')}</option>
	</select>

	{#if hasActiveFilters}
		<button
			type="button"
			onclick={resetFilters}
			class="inline-flex items-center gap-1 border border-stone-200 bg-white/60 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 transition-colors hover:border-stone-400 hover:text-stone-700"
		>
			<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
			</svg>
			{$t('recordings.common.reset')}
		</button>
	{/if}

	<span class="ml-auto text-xs text-stone-400">
		{#if isFetching || !listLoaded}
			{$t('recordings.common.loading')}
		{:else}
			{$t('recordings.list.shownCount', { shown: recordings.length, total })} {hasActiveFilters ? $t('recordings.list.results') : $t('recordings.list.total')}
		{/if}
	</span>
</div>
{#if fetchError}
	<p class="mb-3 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
		{$t('recordings.list.loadError', { error: fetchError })}
	</p>
{/if}

<!-- Mobile + tablet cards (< lg). Editorial catalog layout: thumbnail + serif
     title + meta chips + action row. Each recording is a self-contained card
     so no information needs to be hidden on small screens. -->
<div class="space-y-2.5 lg:hidden">
	{#if filteredRecordings.length > 0 && canDeleteRecordings}
		<div class="flex items-center gap-2.5 px-1 pb-1">
			<input
				type="checkbox"
				checked={allFilteredSelected}
				indeterminate={someFilteredSelected}
				onchange={toggleSelectAllFiltered}
				disabled={filteredIds.length === 0}
				aria-label={$t('recordings.list.selectAll')}
				class="h-4 w-4 cursor-pointer rounded border-stone-300 text-primary focus:ring-primary"
			/>
			<span class="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
				{allFilteredSelected ? $t('recordings.list.deselectAll') : $t('recordings.list.selectAll')}
			</span>
			<span class="ml-auto text-[11px] text-stone-400 tabular-nums">
				{filteredRecordings.length > 1 ? $t('recordings.list.countMany', { count: filteredRecordings.length }) : $t('recordings.list.countOne', { count: filteredRecordings.length })}
			</span>
		</div>
	{/if}

	{#if !listLoaded}
		<!-- Initial-load skeleton: mirrors the recording card layout -->
		{#each Array.from({ length: 3 }) as _}
			<article class="animate-pulse overflow-hidden border border-stone-200/70 bg-white/60" aria-hidden="true">
				<div class="flex items-start gap-3 p-4">
					<div class="h-14 w-20 shrink-0 bg-stone-200"></div>
					<div class="min-w-0 flex-1 space-y-2 pt-0.5">
						<div class="h-4 w-3/4 rounded-full bg-stone-200"></div>
						<div class="h-3 w-1/2 rounded-full bg-stone-100"></div>
					</div>
				</div>
				<div class="flex items-center gap-3 border-t border-stone-100 bg-stone-50/30 px-4 py-2.5">
					<div class="h-4 w-14 rounded bg-stone-100"></div>
					<div class="h-3 w-12 rounded-full bg-stone-100"></div>
					<div class="ml-auto h-5 w-9 rounded-full bg-stone-200"></div>
				</div>
			</article>
		{/each}
	{/if}

	{#each filteredRecordings as rec}
		{@const isEditing = editingRecordingId === rec._id}
		{@const isSelected = selectedIds.has(rec._id!)}
		<article
			class="group overflow-hidden border bg-white/60 transition-all {isSelected ? 'border-primary/50 bg-orange-50/40 shadow-sm shadow-primary/10' : 'border-stone-200/70'}"
		>
			<!-- Header: checkbox + thumbnail + title block -->
			<div class="flex items-start gap-3 p-4">
				{#if canDeleteRecordings}
					<input
						type="checkbox"
						checked={isSelected}
						onchange={() => toggleSelection(rec._id!)}
						aria-label={$t('recordings.list.selectOne', { title: rec.title })}
						class="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-stone-300 text-primary focus:ring-primary"
					/>
				{/if}

				{#if rec.thumbnail_url && !failedThumbnails.has(rec._id!)}
					<div class="h-14 w-20 shrink-0 border border-stone-200/60 overflow-hidden">
						<BlurUpImage
							src={vercelImage(rec.thumbnail_url, 192)}
							srcset={vercelImageSrcSet(rec.thumbnail_url, 96)}
							placeholderSrc={vercelImagePlaceholder(rec.thumbnail_url)}
							alt=""
							width={80}
							height={56}
							loading="lazy"
							class="h-full w-full object-cover"
							on:error={() => markThumbnailFailed(rec._id!)}
						/>
					</div>
				{:else}
					<div class="flex h-14 w-20 shrink-0 items-center justify-center border border-stone-200/60 bg-cream/60 text-stone-300" aria-hidden="true">
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
							<path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 6h16v12H4V6z" />
						</svg>
					</div>
				{/if}

				<div class="min-w-0 flex-1 pt-0.5">
					<h3 class="font-display text-[15px] font-semibold leading-snug text-stone-800 line-clamp-2">
						{rec.title}
					</h3>
					<p class="mt-1 text-[11px] leading-tight text-stone-500">
						<span class="font-medium text-stone-600">{displayName(rec.created_by_name, rec.created_by)}</span>
						<span class="text-stone-300"> · </span>
						<span>{formatDateTime(rec.started_at)}</span>
					</p>
				</div>
			</div>

			<!-- Meta row: status · duration · size · publish toggle -->
			<div class="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-stone-100 bg-stone-50/30 px-4 py-2.5">
				<span class="inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide {statusClass(rec.status)}">
					{$t(statusLabel[rec.status])}
				</span>
				<span class="font-mono text-[11px] tabular-nums text-stone-600">
					{formatDuration(rec.duration_sec)}
				</span>
				<span class="text-[11px] text-stone-400">
					{formatBytes(rec.size_bytes)}
				</span>
				<div class="ml-auto flex items-center gap-1.5">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.list.published')}</span>
					<button
						onclick={() => togglePublish(rec)}
						disabled={rec.status !== 'ready'}
						aria-label={rec.published ? $t('recordings.list.unpublish') : $t('recordings.list.publish')}
						title={rec.published ? $t('recordings.list.unpublish') : $t('recordings.list.publish')}
						class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors {rec.published ? 'bg-primary' : 'bg-stone-200'} disabled:opacity-40"
					>
						<span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform {rec.published ? 'translate-x-4' : 'translate-x-0.5'}"></span>
					</button>
				</div>
			</div>

			<!-- Audio player (ready recordings only) -->
			{#if rec.status === 'ready' && rec.s3_url}
				<div class="border-t border-stone-100 px-4 py-3">
					<audio src={rec.s3_url} controls preload="none" class="h-9 w-full"></audio>
				</div>
			{/if}

			{#if rec.status === 'ready' || rec.status === 'failed' || canDeleteRecordings}
				<!-- Action row: edit · retry · delete -->
				<div class="flex flex-wrap items-center gap-2 border-t border-stone-100 px-4 py-2.5">
					{#if rec.status === 'failed'}
						<button
							onclick={() => retryUpload(rec._id!)}
							class="bg-amber-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-700 transition-colors hover:bg-amber-200"
						>
							{$t('recordings.list.retryUpload')}
						</button>
					{/if}
					{#if rec.status === 'ready' || rec.status === 'failed'}
						<button
							onclick={() => (isEditing ? cancelRecordingEdit() : enterRecordingEdit(rec))}
							class="inline-flex items-center gap-1.5 border border-stone-200 bg-white/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-600 transition-colors hover:border-primary hover:text-primary"
						>
							<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
							</svg>
							{isEditing ? $t('recordings.common.close') : $t('recordings.common.edit')}
						</button>
					{/if}
					{#if rec.status === 'ready' && rec.s3_url}
						<button
							onclick={() => openTrimEditor(rec._id!)}
							class="inline-flex items-center gap-1.5 border border-stone-200 bg-white/60 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-600 transition-colors hover:border-primary hover:text-primary"
							title={$t('recordings.list.trimAudioTitle')}
						>
							<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" d="M6 20l3.5-3.5M18 20l-3.5-3.5M6 4l12 12M18 4L6 16" />
							</svg>
							{$t('recordings.list.trimAudio')}
						</button>
					{/if}
					{#if canDeleteRecordings}
						<button
							onclick={() => remove(rec._id!)}
							class="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 transition-colors hover:bg-red-50 hover:text-red-600"
							title={$t('recordings.common.delete')}
						>
							<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">
								<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
							</svg>
							{$t('recordings.common.delete')}
						</button>
					{/if}
				</div>
			{/if}
		</article>
	{/each}

	{#if listLoaded && filteredRecordings.length === 0 && !isFetching}
		<div class="border border-dashed border-stone-200 bg-white/40 px-5 py-14 text-center">
			<p class="font-display text-sm text-stone-500">
				{#if hasActiveFilters}
					{$t('recordings.list.emptyFiltered')}
				{:else}
					{$t('recordings.list.emptyNone')}
				{/if}
			</p>
			{#if hasActiveFilters}
				<button type="button" onclick={resetFilters} class="mt-3 text-xs font-medium text-primary underline-offset-4 hover:underline">
					{$t('recordings.list.resetFilters')}
				</button>
			{/if}
		</div>
	{/if}
	{#if hasMore || isFetching}
		<div class="mt-4 flex justify-center">
			<button
				type="button"
				onclick={loadMore}
				disabled={isFetching || !hasMore}
				class="inline-flex items-center gap-2 border border-stone-300 bg-white px-5 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-stone-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if isFetching}
					{$t('recordings.common.loading')}
				{:else}
					{$t('recordings.list.loadMore', { count: total - recordings.length })}
				{/if}
			</button>
		</div>
	{/if}
</div>

<!-- Recordings table (≥ lg). Original dense layout unchanged. -->
<div class="hidden overflow-hidden border border-stone-200/60 bg-white/40 lg:block">
	<table class="w-full text-left text-sm">
		<thead>
			<tr class="border-b border-stone-100 bg-cream/50">
				{#if canDeleteRecordings}
					<th class="w-10 px-5 py-3.5">
						<input
							type="checkbox"
							checked={allFilteredSelected}
							indeterminate={someFilteredSelected}
							onchange={toggleSelectAllFiltered}
							disabled={filteredIds.length === 0}
							aria-label={$t('recordings.list.selectAll')}
							class="h-4 w-4 cursor-pointer rounded border-stone-300 text-primary focus:ring-primary"
						/>
					</th>
				{/if}
				<th class="px-5 py-3.5 font-medium text-stone-500">{$t('recordings.common.title')}</th>
				<th class="px-5 py-3.5 font-medium text-stone-500">{$t('recordings.table.date')}</th>
				<th class="px-5 py-3.5 font-medium text-stone-500">{$t('recordings.table.duration')}</th>
				<th class="px-5 py-3.5 font-medium text-stone-500">{$t('recordings.table.size')}</th>
				<th class="px-5 py-3.5 font-medium text-stone-500">{$t('recordings.table.status')}</th>
				<th class="px-5 py-3.5 font-medium text-stone-500">{$t('recordings.list.published')}</th>
				<th class="px-5 py-3.5 text-right font-medium text-stone-500">{$t('recordings.table.actions')}</th>
			</tr>
		</thead>
		<tbody>
			{#if !listLoaded}
				<SkeletonRows rows={5} cols={canDeleteRecordings ? 8 : 7} />
			{/if}
			{#each filteredRecordings as rec}
				{@const isEditing = editingRecordingId === rec._id}
				{@const isSelected = selectedIds.has(rec._id!)}
				<tr class="border-b border-stone-50 {isSelected ? 'bg-primary/5' : ''}">
					{#if canDeleteRecordings}
						<td class="px-5 py-4">
							<input
								type="checkbox"
								checked={isSelected}
								onchange={() => toggleSelection(rec._id!)}
								aria-label={$t('recordings.list.selectOne', { title: rec.title })}
								class="h-4 w-4 cursor-pointer rounded border-stone-300 text-primary focus:ring-primary"
							/>
						</td>
					{/if}
					<td class="px-5 py-4">
						<div class="flex items-center gap-3">
							{#if rec.thumbnail_url && !failedThumbnails.has(rec._id!)}
								<div class="h-9 w-14 shrink-0 rounded border border-stone-200/60 overflow-hidden">
									<BlurUpImage
										src={vercelImage(rec.thumbnail_url, 192)}
										srcset={vercelImageSrcSet(rec.thumbnail_url, 96)}
										placeholderSrc={vercelImagePlaceholder(rec.thumbnail_url)}
										alt=""
										width={56}
										height={36}
										loading="lazy"
										class="h-full w-full object-cover"
										on:error={() => markThumbnailFailed(rec._id!)}
									/>
								</div>
							{:else}
								<div class="flex h-9 w-14 shrink-0 items-center justify-center rounded border border-stone-200/60 bg-cream/60 text-stone-300" aria-hidden="true">
									<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
										<path stroke-linecap="round" stroke-linejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 6h16v12H4V6z" />
									</svg>
								</div>
							{/if}
							<div class="min-w-0 flex-1">
								<span class="block font-medium text-stone-700">{rec.title}</span>
								<span class="block text-[11px] text-stone-400">
									{displayName(rec.created_by_name, rec.created_by)}
								</span>
							</div>
						</div>
					</td>
					<td class="px-5 py-4 text-stone-500">{formatDateTime(rec.started_at)}</td>
					<td class="px-5 py-4 font-mono text-xs text-stone-500">{formatDuration(rec.duration_sec)}</td>
					<td class="px-5 py-4 text-stone-500">{formatBytes(rec.size_bytes)}</td>
					<td class="px-5 py-4">
						<span class="inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide {statusClass(rec.status)}">
							{$t(statusLabel[rec.status])}
						</span>
					</td>
					<td class="px-5 py-4">
						<button
							onclick={() => togglePublish(rec)}
							disabled={rec.status !== 'ready'}
							aria-label={rec.published ? $t('recordings.list.unpublish') : $t('recordings.list.publish')}
							title={rec.published ? $t('recordings.list.unpublish') : $t('recordings.list.publish')}
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
								<button onclick={() => retryUpload(rec._id!)} class="bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-amber-700 hover:bg-amber-200">
									{$t('recordings.list.retry')}
								</button>
							{/if}
							{#if rec.status === 'ready' || rec.status === 'failed'}
								<button
									onclick={() => (isEditing ? cancelRecordingEdit() : enterRecordingEdit(rec))}
									class="border border-stone-200 bg-white/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-600 hover:border-primary hover:text-primary"
								>
									{isEditing ? $t('recordings.common.close') : $t('recordings.common.edit')}
								</button>
							{/if}
							{#if rec.status === 'ready' && rec.s3_url}
								<button
									onclick={() => openTrimEditor(rec._id!)}
									class="border border-stone-200 bg-white/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-600 hover:border-primary hover:text-primary"
									title={$t('recordings.list.trimAudioTitle')}
								>
									{$t('recordings.list.trimAudio')}
								</button>
							{/if}
							{#if canDeleteRecordings}
								<button onclick={() => remove(rec._id!)} class="px-2 py-1.5 text-xs text-stone-500 transition-colors hover:bg-red-50 hover:text-red-600" title={$t('recordings.common.delete')}>
									<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
									</svg>
								</button>
							{/if}
						</div>
					</td>
				</tr>
				{/each}
			{#if listLoaded && filteredRecordings.length === 0}
				<tr>
					<td colspan={canDeleteRecordings ? 8 : 7} class="px-5 py-12 text-center text-stone-400">
						{#if total === 0}
							{$t('recordings.list.emptyStart')}
						{:else if hasActiveFilters}
							{$t('recordings.list.emptyFiltered')}
							<button type="button" onclick={resetFilters} class="ml-1 font-medium text-primary underline-offset-4 hover:underline">
								{$t('recordings.common.reset')}
							</button>
						{:else}
							{$t('recordings.list.empty')}
						{/if}
					</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>

{#if hasMore || isFetching}
	<div class="mt-4 hidden lg:flex justify-center">
		<button
			type="button"
			onclick={loadMore}
			disabled={isFetching || !hasMore}
			class="inline-flex items-center gap-2 border border-stone-300 bg-white px-5 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-stone-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
		>
			{#if isFetching}
				{$t('recordings.common.loading')}
			{:else}
				Charger plus ({total - recordings.length} restants)
			{/if}
		</button>
	</div>
{/if}

<!-- Bulk action bar — sticky footer appears while anything is selected -->
{#if canDeleteRecordings && selectedIds.size > 0}
	<div class="sticky bottom-4 z-20 mx-auto mt-4 w-fit animate-[page-in_0.2s_ease] rounded-sm border border-stone-200 bg-white px-6 py-3 shadow-lg">
		<div class="flex items-center gap-4">
			<span class="text-sm font-medium text-stone-700">
				{selectedIds.size > 1 ? $t('recordings.bulk.selectedMany', { count: selectedIds.size }) : $t('recordings.bulk.selectedOne', { count: selectedIds.size })}
			</span>
			<div class="h-5 w-px bg-stone-200"></div>
			<button
				onclick={bulkDelete}
				disabled={bulkDeleting}
				class="admin-btn-danger admin-btn-compact"
			>
				{bulkDeleting ? $t('recordings.bulk.deleting') : $t('recordings.common.delete')}
			</button>
			<button onclick={clearSelection} class="text-xs text-stone-400 hover:text-stone-600">
				{$t('recordings.bulk.clear')}
			</button>
		</div>
	</div>
{/if}

<svelte:window onkeydown={onLightboxKeydown} />

{#if uploadModalOpen}
	<!-- Backfill upload modal — add a recording for a missed live (audio we have
	     from YouTube/elsewhere). Date is backdated; audio uploads to S3. -->
	<div
		class="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-stone-900/60 p-4 backdrop-blur-sm animate-lightbox-in"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeUploadModal();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') closeUploadModal();
		}}
		role="dialog"
		aria-modal="true"
		aria-labelledby="upload-recording-title"
		tabindex="-1"
	>
		<div class="my-8 w-full max-w-2xl rounded-sm bg-white shadow-2xl">
			<div class="flex items-center justify-between border-b border-stone-100 px-6 py-4">
				<h2 id="upload-recording-title" class="font-display text-lg font-semibold text-stone-800">
					{$t('recordings.upload.title')}
				</h2>
				<button
					type="button"
					onclick={closeUploadModal}
					disabled={uploadSaving}
					aria-label={$t('recordings.common.close')}
					class="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 disabled:opacity-50"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M6 6l12 12M6 18L18 6" />
					</svg>
				</button>
			</div>

			<div class="flex flex-col gap-5 px-6 py-6">
				<p class="text-xs text-stone-500">
					{$t('recordings.upload.intro')}
				</p>

				<!-- Audio file (required) -->
				<div class="flex flex-col gap-1.5">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.upload.audioLabel')} <span class="text-red-500">*</span></span>
					<div class="flex flex-wrap items-center gap-3">
						<label class="cursor-pointer border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-600 transition-colors hover:border-primary hover:text-primary {uploadSaving ? 'pointer-events-none opacity-50' : ''}">
							{uploadAudioFile ? $t('recordings.upload.changeFile') : $t('recordings.upload.chooseMp3')}
							<input
								type="file"
								accept="audio/mpeg,audio/mp3,.mp3"
								class="hidden"
								onchange={onUploadAudioChange}
								disabled={uploadSaving}
							/>
						</label>
						{#if uploadAudioFile}
							<span class="text-xs text-stone-600">
								{uploadAudioFile.name}
								{#if uploadAudioDurationSec}· {formatDuration(uploadAudioDurationSec)}{/if}
								· {formatBytes(uploadAudioFile.size)}
							</span>
						{/if}
					</div>
					{#if uploadAudioPct !== null}
						<div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
							<div class="h-full bg-primary transition-all" style="width: {uploadAudioPct}%"></div>
						</div>
						<span class="text-[10px] text-stone-400 tabular-nums">{$t('recordings.upload.progress', { pct: uploadAudioPct })}</span>
					{/if}
					{#if uploadAudioError}
						<p class="text-xs text-red-600">{uploadAudioError}</p>
					{/if}
				</div>

				<!-- Date / time (required) -->
				<div class="flex flex-col gap-1.5">
					<label for="upload-started-at" class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.upload.dateLabel')} <span class="text-red-500">*</span></label>
					<input
						id="upload-started-at"
						type="datetime-local"
						bind:value={uploadStartedAt}
						oninput={onUploadDateChange}
						disabled={uploadSaving}
						class="admin-input text-sm sm:w-64"
					/>
					<span class="text-[10px] text-stone-400">{$t('recordings.upload.dateHint')}</span>
				</div>

				<!-- Title (required) -->
				<div class="flex flex-col gap-1.5">
					<label for="upload-title" class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.common.title')} <span class="text-red-500">*</span></label>
					<input
						id="upload-title"
						type="text"
						bind:value={uploadTitle}
						oninput={() => (uploadTitleDirty = true)}
						maxlength="200"
						disabled={uploadSaving}
						placeholder={$t('recordings.upload.titlePlaceholder')}
						class="admin-input text-sm"
					/>
				</div>

				<!-- Description -->
				<div class="flex flex-col gap-1.5">
					<label for="upload-description" class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.common.description')}</label>
					<textarea
						id="upload-description"
						bind:value={uploadDescription}
						maxlength="2000"
						rows="4"
						disabled={uploadSaving}
						placeholder={$t('recordings.upload.descriptionPlaceholder')}
						class="admin-input resize-y text-sm"
					></textarea>
				</div>

				<!-- YouTube link -->
				<div class="flex flex-col gap-1.5">
					<label for="upload-youtube" class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.common.youtubeLink')}</label>
					<input
						id="upload-youtube"
						type="url"
						bind:value={uploadYoutubeUrl}
						disabled={uploadSaving}
						placeholder="https://www.youtube.com/watch?v=…"
						class="admin-input text-sm"
					/>
					{#if uploadYoutubeError}
						<p class="text-xs text-red-600">{uploadYoutubeError}</p>
					{/if}
				</div>

				<!-- Thumbnail -->
				<div class="flex flex-col gap-2">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.common.thumbnail')}</span>
					<div class="flex items-start gap-4">
						{#if uploadThumbnailPreviewUrl}
							<div class="relative aspect-video w-40 shrink-0 overflow-hidden border border-stone-300 bg-cream/40">
								<img src={uploadThumbnailPreviewUrl} alt="" class="h-full w-full object-cover" />
							</div>
						{:else}
							<div class="flex aspect-video w-40 shrink-0 flex-col items-center justify-center gap-1 border border-dashed border-stone-300">
								<picture>
									<source srcset="/icons/logo.webp" type="image/webp" />
									<img src="/icons/logo.png" alt="" class="h-5 w-auto opacity-90" width="150" height="64" />
								</picture>
								<span class="text-[8px] font-bold uppercase tracking-[0.2em] text-stone-500">{$t('recordings.common.noThumbnail')}</span>
							</div>
						{/if}
						<div class="flex flex-col gap-2">
							<div class="flex gap-2">
								<label class="cursor-pointer border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-600 transition-colors hover:border-primary hover:text-primary {uploadSaving ? 'pointer-events-none opacity-50' : ''}">
									{uploadThumbnailPreviewUrl ? $t('recordings.common.change') : $t('recordings.common.upload')}
									<input
										type="file"
										accept="image/jpeg,image/png,image/webp,image/gif"
										class="hidden"
										onchange={onUploadThumbnailChange}
										disabled={uploadSaving}
									/>
								</label>
								{#if uploadThumbnailPreviewUrl}
									<button
										type="button"
										onclick={clearUploadThumbnail}
										disabled={uploadSaving}
										class="border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 transition-colors hover:border-red-200 hover:text-red-600 disabled:opacity-50"
									>
										{$t('recordings.common.remove')}
									</button>
								{/if}
							</div>
							<p class="text-[10px] text-stone-400">{$t('recordings.common.imageFormats')}</p>
							{#if uploadThumbnailError}
								<p class="text-xs text-red-600">{uploadThumbnailError}</p>
							{/if}
						</div>
					</div>
				</div>

				<!-- Publish immediately -->
				<label class="flex items-center gap-2 text-sm text-stone-700">
					<input type="checkbox" bind:checked={uploadPublishNow} disabled={uploadSaving} class="h-4 w-4 accent-primary" />
					{$t('recordings.upload.publishNow')}
				</label>

				{#if uploadError}
					<p class="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{uploadError}</p>
				{/if}
			</div>

			<div class="flex items-center justify-end gap-3 border-t border-stone-100 px-6 py-4">
				<button
					type="button"
					onclick={closeUploadModal}
					disabled={uploadSaving}
					class="px-4 py-2 text-sm font-medium text-stone-500 transition-colors hover:text-stone-700 disabled:opacity-50"
				>
					{$t('recordings.common.cancel')}
				</button>
				<button
					type="button"
					onclick={submitUpload}
					disabled={uploadSaving || !uploadAudioFile}
					class="inline-flex items-center gap-2 bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{uploadSaving ? $t('recordings.common.uploading') : $t('recordings.common.upload')}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if metadataEditing}
	<!-- Broadcast metadata edit modal — title, description, thumbnail for the live broadcast. -->
	<div
		class="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm animate-lightbox-in overflow-y-auto"
		onclick={onBroadcastModalBackdropClick}
		onkeydown={onLightboxKeydown}
		role="dialog"
		aria-modal="true"
		aria-labelledby="edit-broadcast-title"
		tabindex="-1"
	>
		<div class="w-full max-w-3xl rounded-sm bg-white shadow-2xl my-8">
			<div class="flex items-center justify-between border-b border-stone-100 px-6 py-4">
				<h2 id="edit-broadcast-title" class="font-display text-lg font-semibold text-stone-800">
					{$t('recordings.meta.editTitle')}
				</h2>
				<button
					type="button"
					onclick={cancelEditMode}
					disabled={metadataSaving}
					aria-label={$t('recordings.common.close')}
					class="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 disabled:opacity-50"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M6 6l12 12M6 18L18 6" />
					</svg>
				</button>
			</div>

			<div class="px-6 py-6">
				<div class="flex flex-col gap-5 sm:flex-row sm:items-start">
					<div class="flex flex-col gap-2 shrink-0">
						<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.common.thumbnail')}</span>
						{#if previewSrc}
							<div class="relative aspect-video w-48 overflow-hidden border border-stone-300 bg-cream/40">
								<img
									src={previewSrc}
									alt=""
									onerror={() => {
										if (!thumbnailPreviewUrl) broadcastThumbnailBroken = true;
									}}
									class="h-full w-full object-cover"
								/>
								{#if metadataSaving && thumbnailAction === 'replace'}
									<div class="absolute inset-0 flex items-center justify-center bg-white/80 text-xs font-medium text-stone-600">
										{$t('recordings.common.uploading')}
									</div>
								{/if}
							</div>
						{:else}
							<div class="default-thumbnail-admin relative flex aspect-video w-48 flex-col items-center justify-center gap-1 border border-dashed border-stone-300">
								<picture>
									<source srcset="/icons/logo.webp" type="image/webp" />
									<img src="/icons/logo.png" alt="" class="h-5 w-auto opacity-90" width="150" height="64" />
								</picture>
								<span class="text-[8px] font-bold uppercase tracking-[0.2em] text-stone-500">{$t('recordings.common.noThumbnail')}</span>
							</div>
						{/if}
						<div class="flex gap-2">
							<label class="cursor-pointer border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-600 transition-colors hover:border-primary hover:text-primary">
								{previewSrc ? $t('recordings.common.change') : $t('recordings.common.upload')}
								<input
									type="file"
									accept="image/jpeg,image/png,image/webp,image/gif"
									class="hidden"
									onchange={onThumbnailFileChange}
									disabled={metadataSaving}
								/>
							</label>
							{#if previewSrc}
								<button
									type="button"
									onclick={markThumbnailForRemoval}
									disabled={metadataSaving}
									class="border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 transition-colors hover:border-red-200 hover:text-red-600 disabled:opacity-50"
								>
									{$t('recordings.common.remove')}
								</button>
							{/if}
						</div>
						<p class="text-[10px] text-stone-400">{$t('recordings.common.imageFormats')}</p>
						{#if thumbnailAction === 'replace'}
							<label class="flex w-48 items-start gap-2 border border-stone-100 bg-stone-50/60 px-2.5 py-2">
								<input
									type="checkbox"
									bind:checked={setAsDefaultThumbnail}
									disabled={metadataSaving}
									class="mt-0.5 accent-[#FF880C]"
								/>
								<span class="text-[10px] leading-snug text-stone-500">
									<span class="font-semibold text-stone-600">{$t('recordings.meta.setDefaultLabel')}</span>
									{$t('recordings.meta.setDefaultHint')}
								</span>
							</label>
						{/if}
					</div>

					<div class="flex flex-1 flex-col gap-4">
						<div class="flex flex-col gap-1.5">
							<label for="edit-broadcast-title-input" class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.meta.liveTitle')}</label>
							<input
								id="edit-broadcast-title-input"
								type="text"
								bind:value={titleDraft}
								maxlength="120"
								disabled={metadataSaving}
								placeholder={$t('recordings.meta.titlePlaceholder')}
								class="admin-input text-sm"
							/>
							<span class="self-end text-[10px] text-stone-400 tabular-nums">{titleDraft.length} / 120</span>
						</div>

						<div class="flex flex-col gap-1.5">
							<label for="edit-broadcast-desc" class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.common.description')}</label>
							<textarea
								id="edit-broadcast-desc"
								bind:value={descriptionDraft}
								placeholder={$t('recordings.meta.descriptionPlaceholder')}
								maxlength="2000"
								rows="6"
								disabled={metadataSaving}
								class="admin-input text-sm resize-y min-h-[120px]"
							></textarea>
							<span class="self-end text-[10px] text-stone-400 tabular-nums">{descriptionDraft.length} / 2000</span>
						</div>

						<!-- YouTube link for the live. Defaults to the channel /live URL
						     when nothing's stored — admin can replace with a specific
						     video URL once the live ends and YouTube assigns the VOD id. -->
						<div class="flex flex-col gap-1.5">
							<label for="edit-broadcast-youtube" class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.common.youtubeLink')}</label>
							<input
								id="edit-broadcast-youtube"
								type="url"
								bind:value={youtubeUrlDraft}
								placeholder={YOUTUBE_CHANNEL_LIVE_URL}
								disabled={metadataSaving}
								class="admin-input text-sm"
							/>
							<span class="text-[10px] text-stone-400">
								{$t('recordings.meta.youtubeHint')}
							</span>
							{#if broadcastYoutubeError}
								<p class="bg-red-50 px-3 py-2 text-xs text-red-700">{broadcastYoutubeError}</p>
							{/if}
						</div>

						{#if thumbnailError}
							<p class="bg-red-50 px-3 py-2 text-xs text-red-700">{thumbnailError}</p>
						{/if}
					</div>
				</div>
			</div>

			<div class="flex items-center justify-end gap-2 border-t border-stone-100 px-6 py-4">
				<button
					type="button"
					onclick={cancelEditMode}
					disabled={metadataSaving}
					class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-50"
				>
					{$t('recordings.common.cancel')}
				</button>
				<button
					type="button"
					onclick={saveMetadata}
					disabled={metadataSaving}
					class="bg-primary px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white hover:bg-missionnaire-600 disabled:opacity-50"
				>
					{metadataSaving ? $t('recordings.common.saving') : $t('recordings.common.save')}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if editingRecordingId}
	{@const editingRec = getEditingRecording()}
	{#if editingRec}
		<!-- Recording metadata edit modal — focused editing with thumbnail + title + description. -->
		<div
			class="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto overflow-x-hidden bg-stone-900/60 p-3 backdrop-blur-sm animate-lightbox-in sm:p-4"
			onclick={onEditModalBackdropClick}
			onkeydown={onLightboxKeydown}
			role="dialog"
			aria-modal="true"
			aria-labelledby="edit-rec-title"
			tabindex="-1"
		>
			<div class="my-4 w-full max-w-3xl overflow-hidden rounded-sm bg-white shadow-2xl sm:my-8">
				<!-- Modal header -->
				<div class="flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-4 sm:px-6">
					<h2 id="edit-rec-title" class="min-w-0 truncate font-display text-lg font-semibold text-stone-800">
						{$t('recordings.edit.title')}
					</h2>
					<button
						type="button"
						onclick={cancelRecordingEdit}
						disabled={recSaving}
						aria-label={$t('recordings.common.close')}
						class="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 disabled:opacity-50"
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M6 6l12 12M6 18L18 6" />
						</svg>
					</button>
				</div>

				<!-- Modal body -->
				<div class="overflow-x-hidden px-4 py-5 sm:px-6 sm:py-6">
					<div class="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start">
						<!-- Thumbnail editor -->
						<div class="flex w-full max-w-[12rem] shrink-0 flex-col gap-2 sm:w-48">
							<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.common.thumbnail')}</span>
							{#if recPreviewSrc(editingRec)}
								<div class="relative aspect-video w-48 overflow-hidden border border-stone-300 bg-cream/40">
									<img
										src={recPreviewSrc(editingRec)}
										alt=""
										onerror={() => {
											// Only flip the flag for the stored URL — a just-picked local
											// file (blob:) would never 403, so don't mask upload issues.
											if (!recThumbnailPreviewUrl) recEditThumbnailBroken = true;
										}}
										class="h-full w-full object-cover"
									/>
									{#if recSaving && recThumbnailAction === 'replace'}
										<div class="absolute inset-0 flex items-center justify-center bg-white/80 text-xs font-medium text-stone-600">
											{$t('recordings.common.uploading')}
										</div>
									{/if}
								</div>
							{:else}
								<div class="default-thumbnail-admin relative flex aspect-video w-48 flex-col items-center justify-center gap-1 border border-dashed border-stone-300">
									<picture>
										<source srcset="/icons/logo.webp" type="image/webp" />
										<img src="/icons/logo.png" alt="" class="h-5 w-auto opacity-90" width="150" height="64" />
									</picture>
									<span class="text-[8px] font-bold uppercase tracking-[0.2em] text-stone-500">{$t('recordings.common.noThumbnail')}</span>
								</div>
							{/if}
							<div class="flex flex-wrap gap-2">
								<label class="cursor-pointer border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-600 transition-colors hover:border-primary hover:text-primary">
									{recPreviewSrc(editingRec) ? $t('recordings.common.change') : $t('recordings.common.upload')}
									<input
										type="file"
										accept="image/jpeg,image/png,image/webp,image/gif"
										class="hidden"
										onchange={onRecThumbnailFileChange}
										disabled={recSaving}
									/>
								</label>
								{#if recPreviewSrc(editingRec)}
									<button
										type="button"
										onclick={markRecThumbnailRemove}
										disabled={recSaving}
										class="border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 transition-colors hover:border-red-200 hover:text-red-600 disabled:opacity-50"
									>
										{$t('recordings.common.remove')}
									</button>
								{/if}
							</div>
							<p class="text-[10px] text-stone-400">{$t('recordings.common.imageFormats')}</p>
						</div>

						<!-- Title + Description -->
						<div class="flex min-w-0 flex-1 flex-col gap-4">
							<div class="flex flex-col gap-1.5">
								<label for="edit-rec-title-input" class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.common.title')}</label>
								<input
									id="edit-rec-title-input"
									type="text"
									bind:value={recDraftTitle}
									maxlength="200"
									disabled={recSaving}
									placeholder={$t('recordings.edit.titlePlaceholder')}
									class="admin-input text-sm"
								/>
								<span class="self-end text-[10px] text-stone-400 tabular-nums">{recDraftTitle.length} / 200</span>
							</div>

							<div class="flex flex-col gap-1.5">
								<label for="edit-rec-desc" class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.common.description')}</label>
								<textarea
									id="edit-rec-desc"
									bind:value={recDraftDescription}
									placeholder={$t('recordings.edit.descriptionPlaceholder')}
									maxlength="2000"
									rows="6"
									disabled={recSaving}
									class="admin-input text-sm resize-y min-h-[120px]"
								></textarea>
								<span class="self-end text-[10px] text-stone-400 tabular-nums">{recDraftDescription.length} / 2000</span>
							</div>

							<!-- YouTube link. Server parses to source_video_id (11-char id),
							     which powers the "Voir sur YouTube" button and the
							     transcription-PDF lookup on the public detail page. Empty
							     clears the link. -->
							<div class="flex flex-col gap-1.5">
								<label for="edit-rec-youtube" class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.common.youtubeLink')}</label>
								<input
									id="edit-rec-youtube"
									type="url"
									bind:value={recDraftYoutubeUrl}
									placeholder="https://www.youtube.com/watch?v=…"
									disabled={recSaving}
									class="admin-input text-sm"
								/>
								<span class="text-[10px] text-stone-400">
									{$t('recordings.edit.youtubeHint')}
								</span>
								{#if recYoutubeError}
									<p class="bg-red-50 px-3 py-2 text-xs text-red-700">{recYoutubeError}</p>
								{/if}
							</div>

							<div class="flex min-w-0 flex-col gap-2 overflow-hidden border border-stone-100 bg-stone-50/40 p-3">
								<div class="flex flex-col gap-1">
									<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.edit.transcriptLabel')}</span>
									<span class="text-[10px] text-stone-400">
										{$t('recordings.edit.transcriptAutoHint')}
									</span>
								</div>
								{#if recTranscriptLoading}
									<div class="border border-stone-200 bg-white px-3 py-2 text-xs text-stone-500">
										{$t('recordings.edit.transcriptSearching')}
									</div>
								{:else if recExistingTranscript && !recPdfFile && !recTranscriptUploadOpen}
									<div class="flex min-w-0 items-center justify-between gap-3 overflow-hidden border border-green-200 bg-green-50/70 px-3 py-2">
										<div class="min-w-0 flex-1">
											<p class="truncate text-xs font-medium text-green-900">{recExistingTranscript.filename}</p>
											<p class="truncate text-[10px] text-green-700 tabular-nums">
												{formatBytes(recExistingTranscript.size)}
												{#if recExistingTranscript.publishedOn}
													· {formatDateTime(recExistingTranscript.publishedOn)}
												{/if}
											</p>
										</div>
										<a
											href={recExistingTranscript.url}
											target="_blank"
											rel="noopener noreferrer"
											class="shrink-0 text-[10px] font-semibold uppercase tracking-[0.15em] text-green-700 hover:text-green-900"
										>
											{$t('recordings.common.open')}
										</a>
									</div>
									<div class="flex flex-wrap items-center gap-2">
										<span class="text-[10px] text-stone-400">{$t('recordings.edit.transcriptNoUploadNeeded')}</span>
										<button
											type="button"
											onclick={() => {
												recPdfMode = 'replace';
												recTranscriptUploadOpen = true;
											}}
											disabled={recSaving}
											class="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary hover:underline disabled:opacity-50"
										>
											{$t('recordings.edit.replacePdf')}
										</button>
										<button
											type="button"
											onclick={() => {
												recPdfMode = 'add';
												recTranscriptUploadOpen = true;
											}}
											disabled={recSaving}
											class="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary hover:underline disabled:opacity-50"
										>
											{$t('recordings.edit.addAnotherPdf')}
										</button>
										<button
											type="button"
											onclick={detachRecordingTranscript}
											disabled={recSaving}
											class="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 transition-colors hover:text-red-600 hover:underline disabled:opacity-50"
										>
											{$t('recordings.edit.removePdf')}
										</button>
									</div>
								{/if}
								{#if recPdfFile}
									<div class="flex min-w-0 items-center justify-between gap-3 overflow-hidden border border-stone-200 bg-white px-3 py-2">
										<div class="min-w-0 flex-1">
											<p class="truncate text-xs font-medium text-stone-700">{recPdfFile.name}</p>
											<p class="truncate text-[10px] text-stone-500 tabular-nums">
												{formatBytes(recPdfFile.size)}
												{#if recPdfMode === 'replace' && recExistingTranscript}
													· {$t('recordings.edit.willReplace', { filename: recExistingTranscript.filename })}
												{/if}
											</p>
										</div>
										<button
											type="button"
											onclick={clearRecPdf}
											disabled={recSaving}
											class="shrink-0 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 hover:text-red-600 disabled:opacity-50"
										>
											{$t('recordings.common.remove')}
										</button>
									</div>
									{#if recPdfUploadPct !== null}
										<div class="flex flex-col gap-1">
											<div class="flex items-center justify-between text-[10px] font-mono text-stone-500 tabular-nums">
												<span>{recPdfUploadPct < 100 ? $t('recordings.edit.pdfUploading') : $t('recordings.edit.finalizing')}</span>
												<span>{recPdfUploadPct}%</span>
											</div>
											<div class="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
												<div
													class="h-full bg-primary transition-[width] duration-150 ease-out"
													style:width="{recPdfUploadPct}%"
												></div>
											</div>
										</div>
									{/if}
								{:else if !recTranscriptLoading && (!recExistingTranscript || recTranscriptUploadOpen)}
									<div class="flex flex-wrap items-center gap-2">
										<label class="cursor-pointer border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-600 transition-colors hover:border-primary hover:text-primary">
											{recExistingTranscript && recPdfMode === 'replace'
												? $t('recordings.edit.choosePdfReplacement')
												: recExistingTranscript
													? $t('recordings.edit.chooseAnotherPdf')
													: $t('recordings.edit.addPdf')}
											<input
												type="file"
												accept="application/pdf,.pdf"
												class="hidden"
												onchange={onRecPdfFileChange}
												disabled={recSaving}
											/>
										</label>
										<p class="text-[10px] text-stone-400">{$t('recordings.edit.pdfFormats')}</p>
										{#if recExistingTranscript}
											<button
												type="button"
												onclick={() => {
													recTranscriptUploadOpen = false;
													recPdfMode = 'add';
												}}
												disabled={recSaving}
												class="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 hover:text-stone-700 disabled:opacity-50"
											>
												{$t('recordings.edit.keepExisting')}
											</button>
										{/if}
									</div>
								{/if}
								{#if recPdfError}
									<p class="bg-red-50 px-3 py-2 text-xs text-red-700">{recPdfError}</p>
								{/if}
							</div>

							{#if recThumbnailError}
								<p class="bg-red-50 px-3 py-2 text-xs text-red-700">{recThumbnailError}</p>
							{/if}
						</div>
					</div>

					<!-- Audio replace — destructive: overwrites the published MP3 -->
					<div class="mt-6 min-w-0 border-t border-stone-100 pt-5">
						<div class="flex flex-col gap-2">
							<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.edit.audioLabel')}</span>
							{#if recAudioFile && recAudioDurationSec}
								<div class="flex min-w-0 items-center justify-between gap-3 overflow-hidden border border-amber-200 bg-amber-50/60 px-3 py-2">
									<div class="min-w-0 flex-1">
										<p class="truncate text-xs font-medium text-stone-700">{recAudioFile.name}</p>
										<p class="text-[10px] text-stone-500 tabular-nums">
											{formatBytes(recAudioFile.size)} · {formatDuration(recAudioDurationSec)}
										</p>
									</div>
									<button
										type="button"
										onclick={clearRecAudio}
										disabled={recSaving}
										class="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 hover:text-red-600 disabled:opacity-50"
									>
										{$t('recordings.common.remove')}
									</button>
								</div>
								<p class="text-[10px] text-amber-700">
									{$t('recordings.edit.audioReplaceWarning')}
								</p>
								{#if recAudioUploadPct !== null}
									<div class="flex flex-col gap-1">
										<div class="flex items-center justify-between text-[10px] font-mono text-stone-500 tabular-nums">
											<span>{recAudioUploadPct < 100 ? $t('recordings.common.uploading') : $t('recordings.edit.finalizing')}</span>
											<span>{recAudioUploadPct}%</span>
										</div>
										<div class="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
											<div
												class="h-full bg-primary transition-[width] duration-150 ease-out"
												style:width="{recAudioUploadPct}%"
											></div>
										</div>
									</div>
								{/if}
							{:else}
								<div class="flex items-center gap-2">
									<label class="cursor-pointer border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-600 transition-colors hover:border-primary hover:text-primary">
										{$t('recordings.edit.replaceAudio')}
										<input
											type="file"
											accept="audio/mpeg,audio/mp3,.mp3"
											class="hidden"
											onchange={onRecAudioFileChange}
											disabled={recSaving}
										/>
									</label>
									<p class="text-[10px] text-stone-400">{$t('recordings.edit.audioFormats')}</p>
								</div>
							{/if}
							{#if recAudioError}
								<p class="bg-red-50 px-3 py-2 text-xs text-red-700">{recAudioError}</p>
							{/if}
						</div>
					</div>

					<!-- Replay subtitles: per-recording .srt + sync offset + hide toggle -->
					<div class="mt-6 min-w-0 border-t border-stone-100 pt-5">
						<div class="flex flex-col gap-2">
							<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400"
								>{$t('recordings.edit.subtitleLabel')}</span
							>
							<p class="text-[10px] text-stone-400">{$t('recordings.edit.subtitleHint')}</p>

							{#if recSubtitleFile}
								<div class="flex min-w-0 items-center justify-between gap-3 overflow-hidden border border-amber-200 bg-amber-50/60 px-3 py-2">
									<div class="min-w-0 flex-1">
										<p class="truncate text-xs font-medium text-stone-700">{recSubtitleFile.name}</p>
										<p class="text-[10px] text-stone-500 tabular-nums">{formatBytes(recSubtitleFile.size)}</p>
									</div>
									<button
										type="button"
										onclick={clearStagedRecSubtitle}
										disabled={recSaving}
										class="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 hover:text-stone-700 disabled:opacity-50"
									>
										{$t('recordings.edit.keepExisting')}
									</button>
								</div>
							{:else if recSubtitleAction === 'remove'}
								<div class="flex min-w-0 items-center justify-between gap-3 border border-red-200 bg-red-50/60 px-3 py-2">
									<p class="truncate text-xs font-medium text-red-700">{$t('recordings.common.remove')}</p>
									<button
										type="button"
										onclick={clearStagedRecSubtitle}
										disabled={recSaving}
										class="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 hover:text-stone-700 disabled:opacity-50"
									>
										{$t('recordings.edit.keepExisting')}
									</button>
								</div>
							{:else if editingRec.subtitle_filename}
								<div class="flex min-w-0 items-center justify-between gap-3 overflow-hidden border border-green-200 bg-green-50/60 px-3 py-2">
									<p class="truncate text-xs font-medium text-green-900">{editingRec.subtitle_filename}</p>
									<div class="flex shrink-0 items-center gap-3">
										<label class="cursor-pointer text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 hover:text-primary">
											{$t('recordings.edit.replaceSubtitle')}
											<input type="file" accept=".srt,text/plain" class="hidden" onchange={onRecSubtitleFileChange} disabled={recSaving} />
										</label>
										<button
											type="button"
											onclick={markRecSubtitleRemove}
											disabled={recSaving}
											class="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 hover:text-red-600 disabled:opacity-50"
										>
											{$t('recordings.common.remove')}
										</button>
									</div>
								</div>
							{:else}
								<div class="flex items-center gap-2">
									<label class="cursor-pointer border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-600 transition-colors hover:border-primary hover:text-primary">
										{$t('recordings.edit.addSubtitle')}
										<input type="file" accept=".srt,text/plain" class="hidden" onchange={onRecSubtitleFileChange} disabled={recSaving} />
									</label>
									<p class="text-[10px] text-stone-400">{$t('recordings.edit.subtitleFormats')}</p>
								</div>
							{/if}

							{#if recSubtitleFile || (editingRec.subtitle_filename && recSubtitleAction !== 'remove')}
								<label class="mt-1 flex flex-col gap-1">
									<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{$t('recordings.edit.subtitleOffsetLabel')}</span>
									<input
										type="number"
										step="0.1"
										bind:value={recSubtitleOffsetSec}
										disabled={recSaving}
										class="w-32 border border-stone-200 px-2 py-1.5 text-xs tabular-nums focus:border-primary focus:outline-none disabled:opacity-50"
									/>
									<span class="text-[10px] text-stone-400">{$t('recordings.edit.subtitleOffsetHint')}</span>
								</label>
							{/if}

							<label class="mt-1 flex items-start gap-2">
								<input type="checkbox" bind:checked={recSubtitlesHidden} disabled={recSaving} class="mt-0.5" />
								<span class="flex flex-col">
									<span class="text-xs font-medium text-stone-700">{$t('recordings.edit.subtitleHide')}</span>
									<span class="text-[10px] text-stone-400">{$t('recordings.edit.subtitleHideHint')}</span>
								</span>
							</label>

							{#if recSubtitleError}
								<p class="bg-red-50 px-3 py-2 text-xs text-red-700">{recSubtitleError}</p>
							{/if}
						</div>
					</div>
				</div>

				<!-- Modal footer -->
				<div class="flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 px-4 py-4 sm:px-6">
					<button
						type="button"
						onclick={cancelRecordingEdit}
						disabled={recSaving}
						class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-50"
					>
						{$t('recordings.common.cancel')}
					</button>
					<button
						type="button"
						onclick={() => saveRecordingMetadata(editingRec)}
						disabled={recSaving}
						class="bg-primary px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white hover:bg-missionnaire-600 disabled:opacity-50"
					>
						{recSaving ? $t('recordings.common.saving') : $t('recordings.common.save')}
					</button>
				</div>
			</div>
		</div>
	{/if}
{/if}

{#if trimEditorRecording && AudioTrimEditor}
	<AudioTrimEditor
		recording={trimEditorRecording}
		onClose={() => closeTrimEditor(false)}
		onSaved={() => closeTrimEditor(true)}
	/>
{/if}


{#if thumbnailExpanded && broadcast.thumbnail_url && !broadcastThumbnailBroken}
	<!-- Lightbox: click backdrop or press Escape to close. -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-lightbox-in"
		onclick={onBackdropClick}
		onkeydown={onLightboxKeydown}
		role="dialog"
		aria-modal="true"
		aria-label={$t('recordings.meta.thumbnailAlt')}
		tabindex="-1"
	>
		<button
			type="button"
			onclick={closeThumbnail}
			aria-label={$t('recordings.common.close')}
			class="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M6 6l12 12M6 18L18 6" />
			</svg>
		</button>
		<!-- Lightbox: skip BlurUpImage here — the image IS the focus, so a
		     blur-up distracts. Just request the largest optimized variant. -->
		<img
			src={vercelImage(broadcast.thumbnail_url, 1920, 85)}
			alt={broadcast.title || $t('recordings.meta.thumbnailAlt')}
			onerror={() => {
				broadcastThumbnailBroken = true;
				closeThumbnail();
			}}
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
