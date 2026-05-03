<script lang="ts">
	import { onMount } from 'svelte';

	type ReviewStatus = '' | 'approved' | 'rejected' | 'ready_for_sync';

	type ReviewRow = {
		review_status: ReviewStatus;
		reviewed_by: string;
		review_notes: string;
		reviewed_at: string;
		match_status: string;
		audio_id: string;
		audio_title: string;
		audio_artist: string;
		audio_book: string;
		audio_book_full_name: string;
		audio_category: string;
		audio_number: string;
		audio_version: string;
		audio_duration_seconds: string;
		audio_s3_key: string;
		audio_url: string;
		lyrics_text_id: string;
		confidence: string;
		reason: string;
		source_book: string;
		source_number: string;
		source_title: string;
		source_url: string;
		lyrics_sync_status?: string;
		lyrics_synced_at?: string;
		lyrics_synced_by?: string;
		timeline_status?: string;
		timeline_line_count?: string;
		timeline_timed_line_count?: string;
		saving?: boolean;
		syncing?: boolean;
	};

	type LyricsState = {
		error?: string;
		lines?: string[];
		loading?: boolean;
		sections?: {
			label: string;
			lines: Array<string | { role?: string; text?: string; verse_number?: number | null }>;
			title: string;
		}[];
		title?: string;
	};

	let rows: ReviewRow[] = [];
	let loading = true;
	let error = '';
	let reviewerName = '';
	let search = '';
	let matchFilter = 'all';
	let reviewFilter = 'all';
	let selectedAudioId = '';
	let lyricsByRow: Record<string, LyricsState> = {};
	let manualLyricsByRow: Record<string, string> = {};
	let exporting = false;
	let bulkSaving = false;
	let selectedAudioIds = new Set<string>();

	onMount(() => {
		reviewerName = localStorage.getItem('lyrics-reviewer-name') ?? '';
		void loadRows();
	});

	$: selectedRow = rows.find((row) => row.audio_id === selectedAudioId) ?? rows[0] ?? null;
	$: if (!selectedAudioId && rows.length > 0) {
		selectedAudioId = rows[0].audio_id;
	}
	$: summary = summarizeRows(rows);
	$: filteredRows = rows.filter((row) => {
		const term = search.trim().toLowerCase();
		const matchesSearch =
			!term ||
			[
				row.audio_title,
				row.audio_artist,
				row.audio_book,
				row.audio_book_full_name,
				row.audio_number,
				row.audio_version,
				row.source_title,
				row.source_book,
				row.source_number
			]
				.join(' ')
				.toLowerCase()
				.includes(term);

		const matchesMatchFilter = matchFilter === 'all' || row.match_status === matchFilter;
		const matchesReviewFilter =
			reviewFilter === 'all' ||
			(reviewFilter === 'pending' && !row.review_status) ||
			(reviewFilter === 'approved' &&
				(row.review_status === 'approved' || row.review_status === 'ready_for_sync')) ||
			(reviewFilter === 'rejected' && row.review_status === 'rejected') ||
			(reviewFilter === 'lyrics_published' &&
				(row.lyrics_sync_status === 'published' || Boolean(row.lyrics_synced_at))) ||
			(reviewFilter === 'timing' &&
				(row.timeline_status === 'published' || row.timeline_status === 'draft'));

		return matchesSearch && matchesMatchFilter && matchesReviewFilter;
	});
	$: selectedLyrics = selectedRow ? lyricsByRow[selectedRow.audio_id] : null;
	$: selectedManualLyrics = selectedRow ? (manualLyricsByRow[selectedRow.audio_id] ?? '') : '';
	$: selectedCount = selectedAudioIds.size;
	$: visibleSelectedCount = filteredRows.filter((row) => selectedAudioIds.has(row.audio_id)).length;
	$: allVisibleSelected =
		filteredRows.length > 0 && filteredRows.every((row) => selectedAudioIds.has(row.audio_id));

	async function loadRows() {
		loading = true;
		error = '';

		try {
			const response = await fetch('/api/lyrics-review');

			const payload = await response.json();
			if (!response.ok) {
				throw new Error(payload.error ?? 'Could not load lyrics review data');
			}

			rows = payload.rows ?? [];
			if (rows.length > 0 && !selectedAudioId) {
				selectedAudioId = rows[0].audio_id;
				void loadLyrics(rows[0]);
			}
		} catch (caughtError) {
			error =
				caughtError instanceof Error ? caughtError.message : 'Could not load lyrics review data';
		} finally {
			loading = false;
		}
	}

	function setReviewerName(value: string) {
		reviewerName = value;
		localStorage.setItem('lyrics-reviewer-name', reviewerName);
	}

	function selectRow(row: ReviewRow) {
		selectedAudioId = row.audio_id;
		void loadLyrics(row);
	}

	function toggleRowSelection(row: ReviewRow, event: Event) {
		const checked = (event.currentTarget as HTMLInputElement).checked;
		const next = new Set(selectedAudioIds);
		if (checked) next.add(row.audio_id);
		else next.delete(row.audio_id);
		selectedAudioIds = next;
	}

	function toggleVisibleSelection(event: Event) {
		const checked = (event.currentTarget as HTMLInputElement).checked;
		const next = new Set(selectedAudioIds);
		for (const row of filteredRows) {
			if (checked) next.add(row.audio_id);
			else next.delete(row.audio_id);
		}
		selectedAudioIds = next;
	}

	function clearSelectedRows() {
		selectedAudioIds = new Set();
	}

	async function loadLyrics(row: ReviewRow) {
		if (
			!row.source_url ||
			lyricsByRow[row.audio_id]?.lines ||
			lyricsByRow[row.audio_id]?.sections ||
			lyricsByRow[row.audio_id]?.loading
		) {
			return;
		}

		lyricsByRow = {
			...lyricsByRow,
			[row.audio_id]: { loading: true }
		};

		try {
			const params = new URLSearchParams({
				audioTitle: row.audio_title,
				url: row.source_url,
				version: row.audio_version
			});
			const response = await fetch(`/api/lyrics-review/lyrics?${params.toString()}`);
			const payload = await response.json();

			if (!response.ok) {
				throw new Error(payload.error ?? 'Could not load lyrics');
			}

			lyricsByRow = {
				...lyricsByRow,
				[row.audio_id]: {
					lines: payload.lines ?? [],
					sections: payload.sections ?? [],
					title: payload.title ?? row.source_title
				}
			};
		} catch (caughtError) {
			lyricsByRow = {
				...lyricsByRow,
				[row.audio_id]: {
					error: caughtError instanceof Error ? caughtError.message : 'Could not load lyrics'
				}
			};
		}
	}

	function setManualLyrics(row: ReviewRow, value: string) {
		manualLyricsByRow = {
			...manualLyricsByRow,
			[row.audio_id]: value
		};
	}

	async function saveReview(row: ReviewRow, reviewStatus: ReviewStatus) {
		rows = rows.map((item) => (item.audio_id === row.audio_id ? { ...item, saving: true } : item));
		error = '';

		try {
			const current = rows.find((item) => item.audio_id === row.audio_id) ?? row;
			const response = await fetch('/api/lyrics-review', {
				body: JSON.stringify({
					audioId: row.audio_id,
					reviewNotes: current.review_notes ?? '',
					reviewStatus,
					reviewedBy: reviewerName
				}),
				headers: {
					'content-type': 'application/json'
				},
				method: 'POST'
			});
			const payload = await response.json();

			if (!response.ok) {
				throw new Error(payload.error ?? 'Could not save review');
			}

			if (payload.row) {
				rows = rows.map((item) =>
					item.audio_id === row.audio_id ? { ...item, ...payload.row, saving: false } : item
				);
				return payload.row as ReviewRow;
			}
			return null;
		} catch (caughtError) {
			error = caughtError instanceof Error ? caughtError.message : 'Could not save review';
			rows = rows.map((item) =>
				item.audio_id === row.audio_id ? { ...item, saving: false } : item
			);
			return null;
		}
	}

	async function saveBulkReview(reviewStatus: ReviewStatus) {
		const audioIds = [...selectedAudioIds];
		if (audioIds.length === 0) return;

		bulkSaving = true;
		error = '';
		const selectedSet = new Set(audioIds);
		rows = rows.map((item) => (selectedSet.has(item.audio_id) ? { ...item, saving: true } : item));

		try {
			const response = await fetch('/api/lyrics-review', {
				body: JSON.stringify({
					audioIds,
					reviewStatus,
					reviewedBy: reviewerName
				}),
				headers: {
					'content-type': 'application/json'
				},
				method: 'POST'
			});
			const payload = await response.json();

			if (!response.ok) {
				throw new Error(payload.error ?? 'Could not save selected reviews');
			}

			const updatedRows = new Map(
				((payload.rows ?? []) as ReviewRow[]).map((row) => [row.audio_id, row])
			);
			rows = rows.map((item) => {
				const updated = updatedRows.get(item.audio_id);
				if (updated) return { ...item, ...updated, saving: false };
				if (selectedSet.has(item.audio_id)) return { ...item, saving: false };
				return item;
			});
			selectedAudioIds = new Set();
		} catch (caughtError) {
			error =
				caughtError instanceof Error ? caughtError.message : 'Could not save selected reviews';
			rows = rows.map((item) =>
				selectedSet.has(item.audio_id) ? { ...item, saving: false } : item
			);
		} finally {
			bulkSaving = false;
		}
	}

	/** Bulk publish lyrics for every currently-selected row. Skips rows that
	 *  aren't eligible (no source URL, or not yet confirmed) — never silently
	 *  publishes something that wasn't ready. Updates each row live so status
	 *  badges flip "Synchronisé" as each call completes. Shows a final summary
	 *  in the error slot only if anything was skipped or failed. */
	let bulkPublishCurrent = 0;
	let bulkPublishTotal = 0;

	async function bulkPublishLyrics() {
		const audioIds = [...selectedAudioIds];
		if (audioIds.length === 0) return;

		bulkSaving = true;
		error = '';
		bulkPublishCurrent = 0;
		bulkPublishTotal = audioIds.length;

		let published = 0;
		let skipped = 0;
		let failed = 0;
		const reasons: string[] = [];

		for (const audioId of audioIds) {
			bulkPublishCurrent += 1;
			const row = rows.find((item) => item.audio_id === audioId);
			if (!row) {
				skipped += 1;
				continue;
			}
			if (!row.source_url) {
				skipped += 1;
				reasons.push(`${row.audio_title || row.audio_id} : pas de source`);
				continue;
			}
			if (row.review_status !== 'approved' && row.review_status !== 'ready_for_sync') {
				skipped += 1;
				reasons.push(`${row.audio_title || row.audio_id} : non confirmé`);
				continue;
			}

			// syncLyrics writes to the global `error` on failure — clear before
			// each call and inspect after to determine outcome without polluting
			// the bulk summary mid-loop.
			error = '';
			try {
				await syncLyrics(row, true);
				if (error) {
					failed += 1;
					reasons.push(`${row.audio_title || row.audio_id} : ${error}`);
					error = '';
				} else {
					published += 1;
				}
			} catch (caughtError) {
				failed += 1;
				reasons.push(
					`${row.audio_title || row.audio_id} : ${caughtError instanceof Error ? caughtError.message : 'erreur'}`
				);
			}
		}

		bulkSaving = false;
		bulkPublishCurrent = 0;
		bulkPublishTotal = 0;

		const parts: string[] = [];
		if (published > 0) parts.push(`${published} publié${published > 1 ? 's' : ''}`);
		if (skipped > 0) parts.push(`${skipped} ignoré${skipped > 1 ? 's' : ''}`);
		if (failed > 0) parts.push(`${failed} échec${failed > 1 ? 's' : ''}`);

		if (failed > 0 || skipped > 0) {
			// Surface up to 3 reasons so the user can act on them.
			const sample = reasons.slice(0, 3).join(' · ');
			const more = reasons.length > 3 ? ` · +${reasons.length - 3} autres` : '';
			error = `${parts.join(' · ')}${reasons.length ? ` — ${sample}${more}` : ''}`;
		}

		// Only clear selection on full success; on partial failure leave the
		// selection so the user can see which rows are still un-published.
		if (failed === 0 && skipped === 0) {
			selectedAudioIds = new Set();
		}
	}

	async function publishLyrics(row: ReviewRow) {
		const manualLyrics = (manualLyricsByRow[row.audio_id] ?? '').trim();
		if (manualLyrics) {
			if (row.review_status !== 'approved' && row.review_status !== 'ready_for_sync') {
				const savedRow = await saveReview(row, 'approved');
				if (!savedRow) return;
				row = savedRow;
			}
			await publishManualLyrics(row, manualLyrics);
			return;
		}

		if (!row.source_url) {
			error = 'Ajoutez les bonnes paroles avant de publier cet audio.';
			return;
		}

		const current = rows.find((item) => item.audio_id === row.audio_id) ?? row;
		if (current.review_status !== 'approved' && current.review_status !== 'ready_for_sync') {
			error = 'Confirmez la correspondance avant de publier les paroles.';
			return;
		}

		await syncLyrics(current, true);
	}

	async function syncLyrics(row: ReviewRow, force = false) {
		if (!force && !canSyncLyrics(row)) return;

		rows = rows.map((item) => (item.audio_id === row.audio_id ? { ...item, syncing: true } : item));
		error = '';

		try {
			const response = await fetch(`/api/lyrics-review/timeline/${row.audio_id}`, {
				body: JSON.stringify({ action: 'sync' }),
				headers: {
					'content-type': 'application/json'
				},
				method: 'POST'
			});
			const payload = await response.json();

			if (!response.ok) {
				throw new Error(payload.error ?? 'Could not sync lyrics');
			}

			const lyrics = payload.lyrics ?? {};
			const sync = payload.sync ?? {};
			const lineCount = String(sync.timableLineCount ?? countTimableLines(lyrics.lines) ?? '');

			rows = rows.map((item) =>
				item.audio_id === row.audio_id
					? {
							...item,
							lyrics_sync_status: lyrics.lyrics_status || 'published',
							lyrics_synced_at: lyrics.synced_at ?? item.lyrics_synced_at ?? '',
							lyrics_synced_by: lyrics.synced_by ?? item.lyrics_synced_by ?? '',
							syncing: false,
							timeline_line_count: lineCount,
							timeline_status: lyrics.timeline_status ?? item.timeline_status ?? '',
							timeline_timed_line_count: String(
								(lyrics.timeline_status === 'published'
									? lyrics.timeline_published?.length
									: lyrics.timeline_draft?.length) ??
									item.timeline_timed_line_count ??
									''
							)
						}
					: item
			);
		} catch (caughtError) {
			error = caughtError instanceof Error ? caughtError.message : 'Could not sync lyrics';
			rows = rows.map((item) =>
				item.audio_id === row.audio_id ? { ...item, syncing: false } : item
			);
		}
	}

	async function publishManualLyrics(row: ReviewRow, lyricsText: string) {
		rows = rows.map((item) => (item.audio_id === row.audio_id ? { ...item, syncing: true } : item));
		error = '';

		try {
			const response = await fetch(`/api/audio/${row.audio_id}/lyrics`, {
				body: JSON.stringify({
					lyricsText,
					sourceBook: row.source_book || row.audio_book_full_name || row.audio_book,
					sourceNumber: row.source_number || row.audio_number,
					sourceTitle: row.source_title || row.audio_title,
					title: row.source_title || row.audio_title
				}),
				headers: {
					'content-type': 'application/json'
				},
				method: 'POST'
			});
			const payload = await response.json();

			if (!response.ok) {
				throw new Error(payload.error ?? 'Could not publish lyrics');
			}

			const lyrics = payload.data?.lyrics ?? {};
			const sync = payload.data ?? {};
			const lineCount = String(sync.timableLineCount ?? countTimableLines(lyrics.lines) ?? '');

			rows = rows.map((item) =>
				item.audio_id === row.audio_id
					? {
							...item,
							lyrics_sync_status: lyrics.lyrics_status || 'published',
							lyrics_synced_at: lyrics.synced_at ?? item.lyrics_synced_at ?? '',
							lyrics_synced_by: lyrics.synced_by ?? item.lyrics_synced_by ?? '',
							review_status: item.review_status || 'approved',
							syncing: false,
							timeline_line_count: lineCount,
							timeline_status: lyrics.timeline_status ?? item.timeline_status ?? '',
							timeline_timed_line_count: String(
								(lyrics.timeline_status === 'published'
									? lyrics.timeline_published?.length
									: lyrics.timeline_draft?.length) ??
									item.timeline_timed_line_count ??
									''
							)
						}
					: item
			);
			manualLyricsByRow = {
				...manualLyricsByRow,
				[row.audio_id]: ''
			};
		} catch (caughtError) {
			error = caughtError instanceof Error ? caughtError.message : 'Could not publish lyrics';
			rows = rows.map((item) =>
				item.audio_id === row.audio_id ? { ...item, syncing: false } : item
			);
		}
	}

	async function downloadCsv() {
		exporting = true;
		error = '';

		try {
			const response = await fetch('/api/lyrics-review/export');

			if (!response.ok) {
				throw new Error(await response.text());
			}

			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = url;
			anchor.download = 'lyrics-matches-reviewed.csv';
			anchor.click();
			URL.revokeObjectURL(url);
		} catch (caughtError) {
			error = caughtError instanceof Error ? caughtError.message : 'Could not export CSV';
		} finally {
			exporting = false;
		}
	}

	function summarizeRows(items: ReviewRow[]) {
		return items.reduce(
			(acc, row) => {
				if (row.review_status) acc.reviewed += 1;
				else acc.pending += 1;

				if (row.review_status === 'approved') acc.approved += 1;
				if (row.review_status === 'rejected') acc.rejected += 1;
				if (row.review_status === 'ready_for_sync') acc.readyForSync += 1;
				if (row.review_status === 'approved' || row.review_status === 'ready_for_sync') {
					acc.matched += 1;
				}

				if (row.match_status === 'likely') acc.likely += 1;
				if (row.match_status === 'candidate') acc.candidate += 1;
				if (row.match_status === 'needs_review') acc.needsReview += 1;
				return acc;
			},
			{
				approved: 0,
				candidate: 0,
				likely: 0,
				matched: 0,
				needsReview: 0,
				pending: 0,
				readyForSync: 0,
				rejected: 0,
				reviewed: 0,
				total: items.length
			}
		);
	}

	function confidenceLabel(value: string) {
		const number = Number(value);
		if (!Number.isFinite(number)) return '0%';
		return `${Math.round(number * 100)}%`;
	}

	function statusLabel(status: string) {
		if (status === 'approved') return 'Confirmé';
		if (status === 'rejected') return 'Rejeté';
		if (status === 'ready_for_sync') return 'Prêt';
		return 'En attente';
	}

	function syncStatusLabel(row: ReviewRow) {
		if (row.lyrics_sync_status === 'published' || row.lyrics_synced_at) return 'Synchronisé';
		if (row.review_status === 'ready_for_sync') return 'Prêt à synchroniser';
		return 'Non synchronisé';
	}

	function syncStatusClass(row: ReviewRow) {
		if (row.lyrics_sync_status === 'published' || row.lyrics_synced_at) {
			return 'bg-emerald-100 text-emerald-800';
		}
		if (row.review_status === 'ready_for_sync') return 'bg-amber-100 text-amber-800';
		return 'bg-stone-100 text-stone-600';
	}

	function timelineStatusLabel(row: ReviewRow) {
		if (row.timeline_status === 'published') return 'Timeline publiée';
		if (row.timeline_status === 'draft') return 'Timeline brouillon';
		if (row.lyrics_sync_status === 'published' || row.lyrics_synced_at) return 'Timing requis';
		return 'Pas de timeline';
	}

	function timelineStatusClass(row: ReviewRow) {
		if (row.timeline_status === 'published') return 'bg-blue-100 text-blue-800';
		if (row.timeline_status === 'draft') return 'bg-amber-100 text-amber-800';
		if (row.lyrics_sync_status === 'published' || row.lyrics_synced_at) {
			return 'bg-stone-100 text-stone-700';
		}
		return 'bg-stone-100 text-stone-500';
	}

	function timelineProgressLabel(row: ReviewRow) {
		const total = Number(row.timeline_line_count);
		const timed = Number(row.timeline_timed_line_count);
		if (!Number.isFinite(total) || total <= 0) return '';
		return `${Number.isFinite(timed) ? timed : 0}/${total} synchronisées`;
	}

	function canSyncLyrics(row: ReviewRow) {
		return (
			(row.review_status === 'approved' || row.review_status === 'ready_for_sync') &&
			Boolean(row.source_url) &&
			!row.syncing
		);
	}

	function canPublishLyrics(row: ReviewRow) {
		return (
			!row.syncing &&
			(Boolean((manualLyricsByRow[row.audio_id] ?? '').trim()) || canSyncLyrics(row))
		);
	}

	function lyricsPublishLabel(row: ReviewRow) {
		if (row.syncing) return 'Publication...';
		if (row.lyrics_sync_status || row.lyrics_synced_at) return 'Republier paroles';
		return 'Publier paroles';
	}

	function canOpenTiming(row: ReviewRow) {
		return Boolean(row.lyrics_sync_status || row.lyrics_synced_at);
	}

	function countTimableLines(lines: unknown) {
		if (!Array.isArray(lines)) return '';
		return lines.filter(
			(line) =>
				typeof line !== 'object' || line === null || !('kind' in line) || line.kind !== 'heading'
		).length;
	}

	function getSourceLineText(line: string | { text?: string; verse_number?: number | null }) {
		if (typeof line === 'string') return line;
		const text = line.text ?? '';
		return line.verse_number ? `${line.verse_number}. ${text}` : text;
	}

	function matchLabel(status: string) {
		if (status === 'likely') return 'Probable';
		if (status === 'candidate') return 'Candidat';
		return 'À revoir';
	}

	function numberLabel(row: ReviewRow) {
		return [row.audio_number, row.audio_version].filter(Boolean).join(' ');
	}
</script>

<svelte:head>
	<title>Révision paroles - Missionnaire Admin</title>
</svelte:head>

<div class="flex flex-col gap-6 text-stone-900">
	<div class="mb-2 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
		<header>
			<div>
				<p class="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">
					Révision paroles
				</p>
				<h1 class="mt-2 font-display text-3xl font-semibold text-stone-800">
					Correspondances audio/paroles
				</h1>
				<p class="mt-1 max-w-2xl text-sm text-stone-500">
					Validez les correspondances, synchronisez les paroles et préparez les timelines pour le
					lecteur public.
				</p>
			</div>
		</header>

		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[560px]">
			<div class="card-lift border border-stone-200/60 bg-white/40 p-4">
				<p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Révisé</p>
				<p class="mt-1 text-2xl font-semibold text-stone-800">{summary.reviewed}/{summary.total}</p>
			</div>
			<div class="card-lift border border-stone-200/60 bg-white/40 p-4">
				<p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Validés</p>
				<p class="mt-1 text-2xl font-semibold text-stone-800">{summary.matched}</p>
			</div>
			<div class="card-lift border border-stone-200/60 bg-white/40 p-4">
				<p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Prêts</p>
				<p class="mt-1 text-2xl font-semibold text-stone-800">{summary.readyForSync}</p>
			</div>
			<div class="card-lift border border-stone-200/60 bg-white/40 p-4">
				<p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">
					En attente
				</p>
				<p class="mt-1 text-2xl font-semibold text-stone-800">{summary.pending}</p>
			</div>
		</div>
	</div>

	{#if error}
		<p class="border border-red-200 bg-red-50/80 px-4 py-3 text-sm font-semibold text-red-700">
			{error}
		</p>
	{/if}

	<section class="border border-stone-200/60 bg-white/40 p-4">
		<div class="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
			<div class="grid gap-4 md:grid-cols-[1fr_170px_190px_220px]">
				<label>
					<span class="admin-label">Recherche</span>
					<input
						class="admin-input"
						bind:value={search}
						placeholder="Titre, recueil, numéro, paroles"
					/>
				</label>

				<label>
					<span class="admin-label">Score</span>
					<select class="admin-input" bind:value={matchFilter}>
						<option value="all">Tous</option>
						<option value="likely">Probable</option>
						<option value="candidate">Candidat</option>
						<option value="needs_review">À revoir</option>
					</select>
				</label>

				<label>
					<span class="admin-label">Statut</span>
					<select class="admin-input" bind:value={reviewFilter}>
						<option value="all">Tous</option>
						<option value="pending">En attente</option>
						<option value="approved">Confirmé</option>
						<option value="lyrics_published">Republier paroles</option>
						<option value="timing">Timing</option>
						<option value="rejected">Rejeté</option>
					</select>
				</label>

				<label>
					<span class="admin-label">Réviseur</span>
					<input
						class="admin-input"
						value={reviewerName}
						on:input={(event) => setReviewerName(event.currentTarget.value)}
						placeholder="Nom"
					/>
				</label>
			</div>

			<button
				class="admin-btn-secondary justify-center"
				disabled={exporting}
				on:click={downloadCsv}
				type="button"
			>
				{exporting ? 'Export...' : 'Exporter CSV'}
			</button>
		</div>
	</section>

	{#if loading}
		<div
			class="border border-stone-200/60 bg-white/40 p-8 text-center text-sm font-semibold text-stone-500"
		>
			Chargement des correspondances...
		</div>
	{:else if rows.length > 0}
		<section class="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(390px,0.75fr)]">
			<div class="overflow-hidden border border-stone-200/60 bg-white/40">
				<div
					class="flex flex-col gap-3 border-b border-stone-200/60 bg-white/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
				>
					<div>
						<p class="text-sm font-semibold text-stone-700">{filteredRows.length} chants</p>
						<p class="mt-1 text-xs font-medium text-stone-500">
							{summary.likely} probables / {summary.candidate} candidats / {summary.needsReview}
							à revoir
						</p>
					</div>

					{#if selectedCount > 0}
						<div class="flex flex-wrap items-center gap-2">
							<span class="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">
								{selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}
								{visibleSelectedCount !== selectedCount
									? ` / ${visibleSelectedCount} visibles`
									: ''}
							</span>
							<button
								class="inline-flex min-h-9 items-center bg-blue-600 px-3 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60"
								disabled={bulkSaving}
								on:click={() => saveBulkReview('approved')}
								type="button"
							>
								Confirmer
							</button>
							<button
								class="inline-flex min-h-9 items-center bg-emerald-600 px-3 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60"
								disabled={bulkSaving}
								on:click={() => saveBulkReview('ready_for_sync')}
								type="button"
							>
								Prêt
							</button>
							<button
								class="inline-flex min-h-9 items-center bg-missionnaire px-3 text-xs font-semibold text-white shadow-sm shadow-missionnaire/20 disabled:cursor-wait disabled:opacity-60"
								disabled={bulkSaving}
								on:click={bulkPublishLyrics}
								type="button"
								title="Publier les paroles pour les chants confirmés sélectionnés"
							>
								{bulkPublishTotal > 0
									? `Publication ${bulkPublishCurrent}/${bulkPublishTotal}…`
									: 'Publier paroles'}
							</button>
							<button
								class="inline-flex min-h-9 items-center bg-red-700 px-3 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60"
								disabled={bulkSaving}
								on:click={() => saveBulkReview('rejected')}
								type="button"
							>
								Rejeter
							</button>
							<button
								class="inline-flex min-h-9 items-center border border-stone-300 bg-white/70 px-3 text-xs font-semibold text-stone-700 disabled:cursor-wait disabled:opacity-60"
								disabled={bulkSaving}
								on:click={() => saveBulkReview('')}
								type="button"
							>
								Effacer
							</button>
							<button
								class="inline-flex min-h-9 items-center border border-stone-200 bg-white/50 px-3 text-xs font-semibold text-stone-500 hover:text-stone-800 disabled:cursor-wait disabled:opacity-60"
								disabled={bulkSaving}
								on:click={clearSelectedRows}
								type="button"
							>
								Désélectionner
							</button>
						</div>
					{/if}
				</div>

				<div class="max-h-[72vh] overflow-auto">
					<table class="w-full border-collapse text-left text-sm">
						<thead
							class="sticky top-0 z-10 border-b border-stone-200/60 bg-cream/90 text-[11px] uppercase tracking-[0.12em] text-stone-500 backdrop-blur"
						>
							<tr>
								<th class="w-10 px-4 py-3">
									<input
										aria-label="Select visible songs"
										checked={allVisibleSelected}
										class="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary/30"
										disabled={filteredRows.length === 0 || bulkSaving}
										on:change={toggleVisibleSelection}
										type="checkbox"
									/>
								</th>
								<th class="w-24 px-4 py-3">Score</th>
								<th class="min-w-[260px] px-4 py-3">Audio</th>
								<th class="min-w-[260px] px-4 py-3">Paroles</th>
								<th class="w-28 px-4 py-3">Statut</th>
							</tr>
						</thead>
						<tbody>
							{#each filteredRows as row (row.audio_id)}
								<tr
									class="cursor-pointer border-b border-stone-100 transition {selectedAudioId ===
									row.audio_id
										? 'bg-primary/5 shadow-[inset_4px_0_0_#ff880c]'
										: 'hover:bg-cream/50'}"
									on:click={() => selectRow(row)}
								>
									<td class="px-4 py-3 align-top">
										<input
											aria-label={`Select ${row.audio_title}`}
											checked={selectedAudioIds.has(row.audio_id)}
											class="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary/30"
											disabled={bulkSaving || row.saving}
											on:change={(event) => toggleRowSelection(row, event)}
											on:click={(event) => event.stopPropagation()}
											type="checkbox"
										/>
									</td>
									<td class="px-4 py-3 align-top">
										<div class="font-semibold tabular-nums text-stone-800">
											{confidenceLabel(row.confidence)}
										</div>
										<div class="mt-1 text-xs font-medium text-stone-500">
											{matchLabel(row.match_status)}
										</div>
									</td>
									<td class="px-4 py-3 align-top">
										<div class="font-semibold text-stone-800">{row.audio_title}</div>
										<div class="mt-1 text-xs text-stone-500">
											{row.audio_book_full_name || row.audio_book} #{numberLabel(row)}
										</div>
									</td>
									<td class="px-4 py-3 align-top">
										<div class="font-semibold text-stone-700">{row.source_title}</div>
										<div class="mt-1 text-xs text-stone-500">
											{row.source_book} #{row.source_number}
										</div>
									</td>
									<td class="px-4 py-3 align-top">
										<div class="flex flex-col items-start gap-1.5">
											<span
												class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold {row.review_status ===
												'ready_for_sync'
													? 'bg-emerald-100 text-emerald-800'
													: row.review_status === 'approved'
														? 'bg-blue-100 text-blue-800'
														: row.review_status === 'rejected'
															? 'bg-red-100 text-red-800'
															: 'bg-stone-100 text-stone-600'}"
											>
												{statusLabel(row.review_status)}
											</span>
											{#if row.review_status === 'ready_for_sync' || row.lyrics_sync_status || row.lyrics_synced_at}
												<span
													class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold {syncStatusClass(
														row
													)}"
												>
													{syncStatusLabel(row)}
												</span>
											{/if}
											{#if row.timeline_status || row.lyrics_sync_status || row.lyrics_synced_at}
												<span
													class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold {timelineStatusClass(
														row
													)}"
												>
													{row.timeline_status === 'published'
														? 'publiée'
														: row.timeline_status === 'draft'
															? 'brouillon'
															: 'timing'}
												</span>
											{/if}
										</div>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>

			{#if selectedRow}
				<aside
					class="overflow-hidden border border-stone-200/60 bg-white/40 xl:sticky xl:top-8 xl:self-start"
				>
					<div class="border-b border-stone-200/60 bg-white/35 p-5">
						<div class="flex items-start justify-between gap-3">
							<div>
								<p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">
									Chant sélectionné
								</p>
								<h2 class="mt-1 font-display text-2xl font-semibold leading-tight text-stone-800">
									{selectedRow.audio_title}
								</h2>
								<p class="mt-1 text-sm text-stone-500">
									{selectedRow.audio_book_full_name || selectedRow.audio_book} #{numberLabel(
										selectedRow
									)}
								</p>
							</div>
							<span class="rounded-full bg-stone-900 px-3 py-1 text-xs font-semibold text-white">
								{confidenceLabel(selectedRow.confidence)}
							</span>
						</div>

						<audio class="mt-4 w-full" controls src={selectedRow.audio_url}></audio>

						<div class="mt-4 border border-stone-200/70 bg-cream/60 p-3">
							<div class="flex flex-wrap items-center gap-2">
								<span
									class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold {syncStatusClass(
										selectedRow
									)}"
								>
									{syncStatusLabel(selectedRow)}
								</span>
								<span
									class="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold {timelineStatusClass(
										selectedRow
									)}"
								>
									{timelineStatusLabel(selectedRow)}
								</span>
								{#if timelineProgressLabel(selectedRow)}
									<span class="text-xs font-bold text-stone-500">
										{timelineProgressLabel(selectedRow)}
									</span>
								{/if}
							</div>

							{#if selectedRow.lyrics_synced_at}
								<p class="mt-2 text-xs font-semibold text-stone-500">
									Synced {selectedRow.lyrics_synced_at}{selectedRow.lyrics_synced_by
										? ` by ${selectedRow.lyrics_synced_by}`
										: ''}
								</p>
							{/if}
						</div>

						<div
							class="mt-4 grid gap-2 {canOpenTiming(selectedRow)
								? 'sm:grid-cols-3'
								: 'sm:grid-cols-2'}"
						>
							<button
								class="min-h-11 bg-blue-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
								disabled={selectedRow.saving}
								on:click={() => saveReview(selectedRow, 'approved')}
								type="button"
							>
								{selectedRow.review_status === 'approved' ||
								selectedRow.review_status === 'ready_for_sync'
									? 'Confirmé'
									: 'Confirmer'}
							</button>
							<button
								class="min-h-11 bg-emerald-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
								disabled={selectedRow.saving || !canPublishLyrics(selectedRow)}
								on:click={() => publishLyrics(selectedRow)}
								type="button"
							>
								{lyricsPublishLabel(selectedRow)}
							</button>
							{#if canOpenTiming(selectedRow)}
								<a
									class="inline-flex min-h-11 items-center justify-center border border-stone-300 bg-white/70 px-3 text-sm font-semibold text-stone-800 transition-colors hover:border-primary hover:text-primary"
									href={`/lyrics-review/timing/${selectedRow.audio_id}`}
								>
									Timing
								</a>
							{/if}
						</div>

						{#if !selectedManualLyrics.trim() && selectedRow.source_url && !canSyncLyrics(selectedRow)}
							<p class="mt-2 text-xs font-semibold text-stone-500">
								Confirmez d'abord la correspondance, puis publiez les paroles.
							</p>
						{/if}
					</div>

					<div class="p-5">
						<div class="flex items-start justify-between gap-3">
							<div>
								<p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">
									Paroles candidates
								</p>
								<h3 class="mt-1 font-display text-xl font-semibold text-stone-800">
									{selectedLyrics?.title || selectedRow.source_title}
								</h3>
								<p class="mt-1 text-sm text-stone-500">
									{selectedRow.source_book} #{selectedRow.source_number}
								</p>
							</div>
							<a
								class="border border-stone-300 bg-white/70 px-3 py-2 text-xs font-semibold text-stone-700 transition-colors hover:border-primary hover:text-primary"
								href={selectedRow.source_url}
								target="_blank"
								rel="noreferrer"
							>
								Source
							</a>
						</div>

						<label class="mt-4 block">
							<span class="admin-label">Remplacer les paroles</span>
							<textarea
								class="admin-input min-h-32 resize-y leading-7"
								value={selectedManualLyrics}
								on:input={(event) => setManualLyrics(selectedRow, event.currentTarget.value)}
								placeholder="Si la source ne correspond pas, collez les bonnes paroles ici puis publiez."
							></textarea>
						</label>
						<p class="mt-2 text-xs text-stone-500">
							Si ce champ reste vide, la publication utilise la source candidate ci-dessous.
						</p>

						<div class="mt-4 max-h-[48vh] overflow-auto border border-stone-200/70 bg-white/55 p-4">
							{#if selectedLyrics?.loading}
								<p class="text-sm font-semibold text-stone-500">Chargement des paroles...</p>
							{:else if selectedLyrics?.error}
								<p class="text-sm font-semibold text-red-700">{selectedLyrics.error}</p>
							{:else if selectedLyrics?.sections?.length}
								<div class="space-y-5 text-[15px] leading-7 text-stone-900">
									{#each selectedLyrics.sections as section}
										<section class="border-t border-stone-200 pt-4 first:border-t-0 first:pt-0">
											<p class="mb-2 text-xs font-black uppercase tracking-[0.14em] text-stone-500">
												{section.label}{section.title ? ` - ${section.title}` : ''}
											</p>
											<div class="space-y-3">
												{#each section.lines as line}
													<p>{getSourceLineText(line)}</p>
												{/each}
											</div>
										</section>
									{/each}
								</div>
							{:else if selectedLyrics?.lines?.length}
								<div class="space-y-3 text-[15px] leading-7 text-stone-900">
									{#each selectedLyrics.lines as line}
										<p>{line}</p>
									{/each}
								</div>
							{:else}
								<button
									class="admin-btn-secondary"
									on:click={() => loadLyrics(selectedRow)}
									type="button"
								>
									Charger les paroles
								</button>
							{/if}
						</div>
					</div>
				</aside>
			{/if}
		</section>
	{:else}
		<div
			class="border border-stone-200/60 bg-white/40 p-8 text-center text-sm font-semibold text-stone-500"
		>
			Aucune correspondance trouvée.
		</div>
	{/if}
</div>
