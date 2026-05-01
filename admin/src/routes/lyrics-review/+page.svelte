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
		saving?: boolean;
	};

	type LyricsState = {
		error?: string;
		lines?: string[];
		loading?: boolean;
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
	let lyricsByUrl: Record<string, LyricsState> = {};
	let exporting = false;

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
			row.review_status === reviewFilter;

		return matchesSearch && matchesMatchFilter && matchesReviewFilter;
	});
	$: selectedLyrics = selectedRow ? lyricsByUrl[selectedRow.source_url] : null;

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

	async function loadLyrics(row: ReviewRow) {
		if (
			!row.source_url ||
			lyricsByUrl[row.source_url]?.lines ||
			lyricsByUrl[row.source_url]?.loading
		) {
			return;
		}

		lyricsByUrl = {
			...lyricsByUrl,
			[row.source_url]: { loading: true }
		};

		try {
			const response = await fetch(
				`/api/lyrics-review/lyrics?url=${encodeURIComponent(row.source_url)}`
			);
			const payload = await response.json();

			if (!response.ok) {
				throw new Error(payload.error ?? 'Could not load lyrics');
			}

			lyricsByUrl = {
				...lyricsByUrl,
				[row.source_url]: {
					lines: payload.lines ?? [],
					title: payload.title ?? row.source_title
				}
			};
		} catch (caughtError) {
			lyricsByUrl = {
				...lyricsByUrl,
				[row.source_url]: {
					error: caughtError instanceof Error ? caughtError.message : 'Could not load lyrics'
				}
			};
		}
	}

	function setReviewNotes(row: ReviewRow, value: string) {
		rows = rows.map((item) =>
			item.audio_id === row.audio_id ? { ...item, review_notes: value } : item
		);
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
			}
		} catch (caughtError) {
			error = caughtError instanceof Error ? caughtError.message : 'Could not save review';
			rows = rows.map((item) =>
				item.audio_id === row.audio_id ? { ...item, saving: false } : item
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
		if (status === 'approved') return 'Approved';
		if (status === 'rejected') return 'Rejected';
		if (status === 'ready_for_sync') return 'Ready';
		return 'Pending';
	}

	function matchLabel(status: string) {
		if (status === 'likely') return 'Likely';
		if (status === 'candidate') return 'Candidate';
		return 'Needs review';
	}
</script>

<svelte:head>
	<title>Lyrics Review - Missionnaire Network</title>
</svelte:head>

<main class="min-h-screen bg-stone-50 px-4 py-8 text-stone-900 sm:px-6 lg:px-8">
	<div class="mx-auto flex max-w-7xl flex-col gap-6">
		<header
			class="flex flex-col gap-4 border-b border-stone-200 pb-5 lg:flex-row lg:items-end lg:justify-between"
		>
			<div>
				<p class="text-xs font-bold uppercase tracking-[0.18em] text-missionnaire">Lyrics Review</p>
				<h1 class="mt-2 text-3xl font-black tracking-normal text-stone-950">
					Music lyrics matches
				</h1>
			</div>

			<div class="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[560px]">
				<div class="rounded-md border border-stone-200 bg-white p-3">
					<p class="text-xs font-semibold uppercase text-stone-500">Reviewed</p>
					<p class="mt-1 text-2xl font-black">{summary.reviewed}/{summary.total}</p>
				</div>
				<div class="rounded-md border border-stone-200 bg-white p-3">
					<p class="text-xs font-semibold uppercase text-stone-500">Matched</p>
					<p class="mt-1 text-2xl font-black">{summary.matched}</p>
				</div>
				<div class="rounded-md border border-stone-200 bg-white p-3">
					<p class="text-xs font-semibold uppercase text-stone-500">Ready</p>
					<p class="mt-1 text-2xl font-black">{summary.readyForSync}</p>
				</div>
				<div class="rounded-md border border-stone-200 bg-white p-3">
					<p class="text-xs font-semibold uppercase text-stone-500">Pending</p>
					<p class="mt-1 text-2xl font-black">{summary.pending}</p>
				</div>
			</div>
		</header>

		{#if error}
			<p
				class="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
			>
				{error}
			</p>
		{/if}

		<section class="grid gap-3 border-b border-stone-200 pb-5 lg:grid-cols-[1fr_auto] lg:items-end">
			<div class="grid gap-3 md:grid-cols-[1fr_170px_190px_220px]">
				<label class="flex flex-col gap-1 text-xs font-bold uppercase text-stone-500">
					Search
					<input
						class="min-h-11 rounded-md border border-stone-300 bg-white px-3 text-sm normal-case text-stone-900 outline-none focus:border-missionnaire"
						bind:value={search}
						placeholder="Song, book, number, lyrics title"
					/>
				</label>

				<label class="flex flex-col gap-1 text-xs font-bold uppercase text-stone-500">
					Match
					<select
						class="min-h-11 rounded-md border border-stone-300 bg-white px-3 text-sm normal-case text-stone-900 outline-none focus:border-missionnaire"
						bind:value={matchFilter}
					>
						<option value="all">All</option>
						<option value="likely">Likely</option>
						<option value="candidate">Candidate</option>
						<option value="needs_review">Needs review</option>
					</select>
				</label>

				<label class="flex flex-col gap-1 text-xs font-bold uppercase text-stone-500">
					Review
					<select
						class="min-h-11 rounded-md border border-stone-300 bg-white px-3 text-sm normal-case text-stone-900 outline-none focus:border-missionnaire"
						bind:value={reviewFilter}
					>
						<option value="all">All</option>
						<option value="pending">Pending</option>
						<option value="approved">Approved</option>
						<option value="rejected">Rejected</option>
						<option value="ready_for_sync">Ready</option>
					</select>
				</label>

				<label class="flex flex-col gap-1 text-xs font-bold uppercase text-stone-500">
					Reviewer
					<input
						class="min-h-11 rounded-md border border-stone-300 bg-white px-3 text-sm normal-case text-stone-900 outline-none focus:border-missionnaire"
						value={reviewerName}
						on:input={(event) => setReviewerName(event.currentTarget.value)}
						placeholder="Name"
					/>
				</label>
			</div>

			<button
				class="min-h-11 rounded-md border border-stone-900 bg-stone-950 px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
				disabled={exporting}
				on:click={downloadCsv}
				type="button"
			>
				{exporting ? 'Exporting...' : 'Export CSV'}
			</button>
		</section>

		{#if loading}
			<div
				class="rounded-md border border-stone-200 bg-white p-8 text-center text-sm font-semibold text-stone-500"
			>
				Loading review data...
			</div>
		{:else if rows.length > 0}
			<section class="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(380px,0.8fr)]">
				<div class="overflow-hidden rounded-md border border-stone-200 bg-white">
					<div class="flex items-center justify-between border-b border-stone-200 px-4 py-3">
						<p class="text-sm font-bold text-stone-700">{filteredRows.length} songs</p>
						<p class="text-xs font-semibold text-stone-500">
							{summary.likely} likely / {summary.candidate} candidate / {summary.needsReview} needs review
						</p>
					</div>

					<div class="max-h-[72vh] overflow-auto">
						<table class="w-full border-collapse text-left text-sm">
							<thead class="sticky top-0 z-10 bg-stone-100 text-xs uppercase text-stone-500">
								<tr>
									<th class="w-24 px-4 py-3">Score</th>
									<th class="min-w-[260px] px-4 py-3">Audio</th>
									<th class="min-w-[260px] px-4 py-3">Lyrics match</th>
									<th class="w-28 px-4 py-3">Review</th>
								</tr>
							</thead>
							<tbody>
								{#each filteredRows as row (row.audio_id)}
									<tr
										class="cursor-pointer border-t border-stone-100 transition {selectedAudioId ===
										row.audio_id
											? 'bg-orange-50'
											: 'hover:bg-stone-50'}"
										on:click={() => selectRow(row)}
									>
										<td class="px-4 py-3 align-top">
											<div class="font-black text-stone-950">{confidenceLabel(row.confidence)}</div>
											<div class="mt-1 text-xs font-semibold text-stone-500">
												{matchLabel(row.match_status)}
											</div>
										</td>
										<td class="px-4 py-3 align-top">
											<div class="font-bold text-stone-950">{row.audio_title}</div>
											<div class="mt-1 text-xs text-stone-500">
												{row.audio_book_full_name || row.audio_book} #{row.audio_number}
											</div>
										</td>
										<td class="px-4 py-3 align-top">
											<div class="font-bold text-stone-900">{row.source_title}</div>
											<div class="mt-1 text-xs text-stone-500">
												{row.source_book} #{row.source_number}
											</div>
										</td>
										<td class="px-4 py-3 align-top">
											<span
												class="inline-flex rounded-full px-2.5 py-1 text-xs font-black {row.review_status ===
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
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>

				{#if selectedRow}
					<aside class="rounded-md border border-stone-200 bg-white">
						<div class="border-b border-stone-200 p-5">
							<div class="flex items-start justify-between gap-3">
								<div>
									<p class="text-xs font-bold uppercase text-stone-500">Selected song</p>
									<h2 class="mt-1 text-xl font-black text-stone-950">{selectedRow.audio_title}</h2>
									<p class="mt-1 text-sm text-stone-500">
										{selectedRow.audio_book_full_name || selectedRow.audio_book} #{selectedRow.audio_number}
									</p>
								</div>
								<span class="rounded-full bg-stone-950 px-3 py-1 text-xs font-black text-white">
									{confidenceLabel(selectedRow.confidence)}
								</span>
							</div>

							<audio class="mt-4 w-full" controls src={selectedRow.audio_url}></audio>

							<div class="mt-4 grid grid-cols-2 gap-2">
								<button
									class="min-h-10 rounded-md bg-blue-600 px-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
									disabled={selectedRow.saving}
									on:click={() => saveReview(selectedRow, 'approved')}
									type="button"
								>
									Approved
								</button>
								<button
									class="min-h-10 rounded-md bg-emerald-600 px-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
									disabled={selectedRow.saving}
									on:click={() => saveReview(selectedRow, 'ready_for_sync')}
									type="button"
								>
									Ready
								</button>
								<button
									class="min-h-10 rounded-md bg-red-600 px-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
									disabled={selectedRow.saving}
									on:click={() => saveReview(selectedRow, 'rejected')}
									type="button"
								>
									Rejected
								</button>
								<button
									class="min-h-10 rounded-md border border-stone-300 bg-white px-3 text-sm font-bold text-stone-800 disabled:cursor-wait disabled:opacity-60"
									disabled={selectedRow.saving}
									on:click={() => saveReview(selectedRow, '')}
									type="button"
								>
									Clear
								</button>
							</div>

							<label class="mt-4 flex flex-col gap-1 text-xs font-bold uppercase text-stone-500">
								Notes
								<textarea
									class="min-h-20 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm normal-case text-stone-900 outline-none focus:border-missionnaire"
									value={selectedRow.review_notes}
									on:input={(event) => setReviewNotes(selectedRow, event.currentTarget.value)}
								></textarea>
							</label>
						</div>

						<div class="p-5">
							<div class="flex items-start justify-between gap-3">
								<div>
									<p class="text-xs font-bold uppercase text-stone-500">Lyrics candidate</p>
									<h3 class="mt-1 text-lg font-black text-stone-950">{selectedRow.source_title}</h3>
									<p class="mt-1 text-sm text-stone-500">
										{selectedRow.source_book} #{selectedRow.source_number}
									</p>
								</div>
								<a
									class="rounded-md border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:border-missionnaire hover:text-missionnaire"
									href={selectedRow.source_url}
									target="_blank"
									rel="noreferrer"
								>
									Source
								</a>
							</div>

							<div
								class="mt-4 max-h-[48vh] overflow-auto rounded-md border border-stone-200 bg-stone-50 p-4"
							>
								{#if selectedLyrics?.loading}
									<p class="text-sm font-semibold text-stone-500">Loading lyrics...</p>
								{:else if selectedLyrics?.error}
									<p class="text-sm font-semibold text-red-700">{selectedLyrics.error}</p>
								{:else if selectedLyrics?.lines?.length}
									<div class="space-y-3 text-[15px] leading-7 text-stone-900">
										{#each selectedLyrics.lines as line}
											<p>{line}</p>
										{/each}
									</div>
								{:else}
									<button
										class="min-h-10 rounded-md bg-stone-950 px-4 text-sm font-bold text-white"
										on:click={() => loadLyrics(selectedRow)}
										type="button"
									>
										Load lyrics
									</button>
								{/if}
							</div>
						</div>
					</aside>
				{/if}
			</section>
		{:else}
			<div
				class="rounded-md border border-stone-200 bg-white p-8 text-center text-sm font-semibold text-stone-500"
			>
				No review rows found.
			</div>
		{/if}
	</div>
</main>
