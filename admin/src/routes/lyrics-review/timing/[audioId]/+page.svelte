<script lang="ts">
	import { onMount } from 'svelte';

	type LyricsLine = {
		id: string;
		kind: 'heading' | 'line';
		order: number;
		role?: string;
		section_label: string;
		section_title: string;
		text: string;
		verse_number?: number | null;
	};

	type LyricsTiming = {
		line_id: string;
		start_ms: number;
	};

	type TimelineDetail = {
		audio: {
			_id: string;
			artist: string;
			book: string;
			book_full_name: string;
			duration: number | null;
			number: number | null;
			s3_url: string;
			title: string;
		} | null;
		lyrics: {
			audio_id: string;
			audio_url: string;
			lines: LyricsLine[];
			source_book: string;
			source_number: string;
			source_title: string;
			source_url: string;
			title: string;
			timeline_draft: LyricsTiming[];
			timeline_published: LyricsTiming[];
			timeline_status: string;
		} | null;
		reviewRow: Record<string, string> | null;
	};

	export let data: { audioId: string };

	let audioElement: HTMLAudioElement;
	let detail: TimelineDetail | null = null;
	let loading = true;
	let saving = false;
	let publishing = false;
	let syncing = false;
	let splitting = false;
	let resettingBreaks = false;
	let clearingTimeline = false;
	let error = '';
	let notice = '';
	let currentTimeMs = 0;
	let durationMs = 0;
	let isPlaying = false;
	let selectedLineId = '';
	let splitEditorLineId = '';
	let splitText = '';
	let cursorIndex = 0;
	let timings: Record<string, number> = {};
	let markHistory: string[] = [];

	$: lyrics = detail?.lyrics ?? null;
	$: audio = detail?.audio ?? null;
	$: audioUrl = lyrics?.audio_url || audio?.s3_url || detail?.reviewRow?.audio_url || '';
	$: lines = lyrics?.lines ?? [];
	$: timableLines = lines.filter((line) => line.kind === 'line');
	$: completedCount = timableLines.filter((line) => timings[line.id] !== undefined).length;
	$: hasAnyTiming = Object.keys(timings).length > 0;
	$: canPublish = timableLines.length > 0 && completedCount === timableLines.length;
	$: activeLineId = findActiveLineId(currentTimeMs);
	$: nextLine =
		timableLines[cursorIndex] ?? timableLines.find((line) => timings[line.id] === undefined);
	$: selectedLine = timableLines.find((line) => line.id === selectedLineId) ?? nextLine ?? null;

	onMount(() => {
		void loadDetail();
	});

	async function loadDetail() {
		loading = true;
		error = '';

		try {
			const response = await fetch(`/api/lyrics-review/timeline/${data.audioId}`);
			const payload = await response.json();
			if (!response.ok) {
				throw new Error(payload.error ?? 'Could not load timeline');
			}
			applyDetail(payload);
		} catch (caughtError) {
			error = caughtError instanceof Error ? caughtError.message : 'Could not load timeline';
		} finally {
			loading = false;
		}
	}

	function applyDetail(payload: TimelineDetail) {
		detail = payload;
		const draft = payload.lyrics?.timeline_draft ?? [];
		const published = payload.lyrics?.timeline_published ?? [];
		const source = draft.length > 0 ? draft : published;
		const nextTimings = Object.fromEntries(
			source.map((timing) => [timing.line_id, timing.start_ms])
		);
		const nextTimableLines = (payload.lyrics?.lines ?? []).filter((line) => line.kind === 'line');
		const nextMissingIndex = nextTimableLines.findIndex(
			(line) => nextTimings[line.id] === undefined
		);
		timings = nextTimings;
		markHistory = [];
		cursorIndex = nextMissingIndex >= 0 ? nextMissingIndex : 0;
		selectedLineId = nextTimableLines[cursorIndex]?.id ?? nextTimableLines[0]?.id ?? '';
		notice = '';
	}

	async function syncLyrics() {
		syncing = true;
		error = '';
		notice = '';

		try {
			const response = await fetch(`/api/lyrics-review/timeline/${data.audioId}`, {
				body: JSON.stringify({ action: 'sync' }),
				headers: { 'content-type': 'application/json' },
				method: 'POST'
			});
			const payload = await response.json();
			if (!response.ok) {
				throw new Error(payload.error ?? 'Could not sync lyrics');
			}
			applyDetail(payload);
			notice = `Lyrics synced. ${payload.sync?.timableLineCount ?? timableLines.length} lines are ready for timing.`;
		} catch (caughtError) {
			error = caughtError instanceof Error ? caughtError.message : 'Could not sync lyrics';
		} finally {
			syncing = false;
		}
	}

	async function saveTimeline(status: 'draft' | 'published') {
		if (status === 'published') publishing = true;
		else saving = true;
		error = '';
		notice = '';

		try {
			const response = await fetch(`/api/lyrics-review/timeline/${data.audioId}`, {
				body: JSON.stringify({
					action: 'save_timeline',
					status,
					timings: Object.entries(timings).map(([line_id, start_ms]) => ({ line_id, start_ms }))
				}),
				headers: { 'content-type': 'application/json' },
				method: 'POST'
			});
			const payload = await response.json();
			if (!response.ok) {
				throw new Error(payload.error ?? 'Could not save timeline');
			}
			applyDetail(payload);
			notice = status === 'published' ? 'Timeline published.' : 'Draft saved.';
		} catch (caughtError) {
			error = caughtError instanceof Error ? caughtError.message : 'Could not save timeline';
		} finally {
			saving = false;
			publishing = false;
		}
	}

	async function togglePlayback() {
		if (!audioElement) return;
		if (audioElement.paused) {
			await audioElement.play();
			return;
		}
		audioElement.pause();
	}

	function markSelectedLine() {
		const line = selectedLine;
		if (!line) return;

		timings = {
			...timings,
			[line.id]: Math.max(0, Math.round(currentTimeMs))
		};
		markHistory = [...markHistory, line.id];
		const nextIndex = timableLines.findIndex((item) => item.id === line.id) + 1;
		cursorIndex = Math.min(nextIndex, Math.max(0, timableLines.length - 1));
		selectedLineId = timableLines[cursorIndex]?.id ?? line.id;
	}

	function undoMark() {
		const lastLineId = markHistory.at(-1);
		if (!lastLineId) return;

		const nextTimings = { ...timings };
		delete nextTimings[lastLineId];
		timings = nextTimings;
		markHistory = markHistory.slice(0, -1);
		const index = timableLines.findIndex((line) => line.id === lastLineId);
		if (index >= 0) {
			cursorIndex = index;
			selectedLineId = lastLineId;
		}
	}

	function selectLine(line: LyricsLine) {
		if (line.kind !== 'line') return;
		selectedLineId = line.id;
		const index = timableLines.findIndex((item) => item.id === line.id);
		if (index >= 0) cursorIndex = index;
	}

	function seekToLine(line: LyricsLine) {
		const startMs = timings[line.id];
		if (!audioElement || startMs === undefined) return;
		audioElement.currentTime = startMs / 1000;
		currentTimeMs = startMs;
		selectLine(line);
	}

	function nudgeSelectedLine(deltaMs: number) {
		const line = selectedLine;
		if (!line) return;

		const current = timings[line.id] ?? currentTimeMs;
		const next = Math.max(0, Math.round(current + deltaMs));
		timings = {
			...timings,
			[line.id]: next
		};
	}

	function openSplitEditor(line = selectedLine) {
		if (!line || line.kind !== 'line') return;
		splitEditorLineId = line.id;
		splitText = suggestLineBreaks(line.text);
	}

	function closeSplitEditor() {
		splitEditorLineId = '';
		splitText = '';
	}

	async function saveLineSplit() {
		if (!splitEditorLineId) return;
		const parts = splitText
			.split(/\n+/)
			.map((part) => part.replace(/\s+/g, ' ').trim())
			.filter(Boolean);

		if (parts.length < 2) {
			error = 'Put each sung phrase on its own line before saving.';
			return;
		}

		splitting = true;
		error = '';
		notice = '';

		try {
			const response = await fetch(`/api/lyrics-review/timeline/${data.audioId}`, {
				body: JSON.stringify({
					action: 'split_line',
					lineId: splitEditorLineId,
					parts
				}),
				headers: { 'content-type': 'application/json' },
				method: 'POST'
			});
			const payload = await response.json();
			if (!response.ok) {
				throw new Error(payload.error ?? 'Could not split lyric line');
			}
			applyDetail(payload);
			closeSplitEditor();
			notice =
				'Line breaks saved. Review the new phrases, then save or publish the timeline again.';
		} catch (caughtError) {
			error = caughtError instanceof Error ? caughtError.message : 'Could not split lyric line';
		} finally {
			splitting = false;
		}
	}

	async function resetLineBreaks() {
		resettingBreaks = true;
		error = '';
		notice = '';

		try {
			const response = await fetch(`/api/lyrics-review/timeline/${data.audioId}`, {
				body: JSON.stringify({ action: 'reset_line_breaks' }),
				headers: { 'content-type': 'application/json' },
				method: 'POST'
			});
			const payload = await response.json();
			if (!response.ok) {
				throw new Error(payload.error ?? 'Could not reset lyric line breaks');
			}
			applyDetail(payload);
			closeSplitEditor();
			notice =
				'Line breaks restored from the original lyrics source. Review the timing, then save or publish again.';
		} catch (caughtError) {
			error =
				caughtError instanceof Error ? caughtError.message : 'Could not reset lyric line breaks';
		} finally {
			resettingBreaks = false;
		}
	}

	async function clearTimeline() {
		if (!hasAnyTiming) return;
		const confirmed = window.confirm(
			'Remove all timing for this audio? The lyrics text will stay, but published synced scrolling will be removed until you publish timing again.'
		);
		if (!confirmed) return;

		clearingTimeline = true;
		error = '';
		notice = '';

		try {
			const response = await fetch(`/api/lyrics-review/timeline/${data.audioId}`, {
				body: JSON.stringify({ action: 'clear_timeline' }),
				headers: { 'content-type': 'application/json' },
				method: 'POST'
			});
			const payload = await response.json();
			if (!response.ok) {
				throw new Error(payload.error ?? 'Could not clear timing');
			}
			applyDetail(payload);
			notice = 'All timing was removed. The lyrics text is still synced.';
		} catch (caughtError) {
			error = caughtError instanceof Error ? caughtError.message : 'Could not clear timing';
		} finally {
			clearingTimeline = false;
		}
	}

	function suggestLineBreaks(text: string) {
		const compact = text.replace(/\s+/g, ' ').trim();
		if (!compact) return '';

		const suggested = compact
			.replace(/([,;:!?])\s+/g, '$1\n')
			.replace(/\.\s+/g, '.\n')
			.split('\n')
			.map((part) => part.trim())
			.filter(Boolean);

		return suggested.length > 1 ? suggested.join('\n') : compact;
	}

	function updateTime() {
		if (!audioElement) return;
		currentTimeMs = Math.round(audioElement.currentTime * 1000);
		durationMs = Number.isFinite(audioElement.duration)
			? Math.round(audioElement.duration * 1000)
			: 0;
	}

	function findActiveLineId(timeMs: number) {
		const ordered = timableLines
			.map((line) => ({ line, startMs: timings[line.id] }))
			.filter((item): item is { line: LyricsLine; startMs: number } => item.startMs !== undefined)
			.sort((left, right) => left.startMs - right.startMs);

		let active = '';
		for (const item of ordered) {
			if (item.startMs <= timeMs + 120) active = item.line.id;
			else break;
		}
		return active;
	}

	function formatMs(value: number | undefined) {
		if (value === undefined || !Number.isFinite(value)) return '--:--';
		const totalSeconds = Math.max(0, Math.floor(value / 1000));
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		const tenths = Math.floor((value % 1000) / 100);
		return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
	}
</script>

<svelte:head>
	<title>Lyrics Timing - Missionnaire Network</title>
</svelte:head>

<main class="min-h-screen bg-stone-50 px-4 py-8 text-stone-900 sm:px-6 lg:px-8">
	<div class="mx-auto flex max-w-7xl flex-col gap-6">
		<header
			class="flex flex-col gap-4 border-b border-stone-200 pb-5 lg:flex-row lg:items-end lg:justify-between"
		>
			<div>
				<a
					class="text-xs font-bold uppercase tracking-[0.18em] text-missionnaire hover:text-stone-900"
					href="/lyrics-review"
				>
					Back to lyrics review
				</a>
				<h1 class="mt-2 text-3xl font-black tracking-normal text-stone-950">Tap-to-sync lyrics</h1>
				<p class="mt-2 text-sm font-semibold text-stone-500">
					{audio?.title || detail?.reviewRow?.audio_title || 'Selected audio'}
				</p>
			</div>

			<div class="grid grid-cols-3 gap-2 lg:min-w-[420px]">
				<div class="rounded-md border border-stone-200 bg-white p-3">
					<p class="text-xs font-semibold uppercase text-stone-500">Lines</p>
					<p class="mt-1 text-2xl font-black">{completedCount}/{timableLines.length}</p>
				</div>
				<div class="rounded-md border border-stone-200 bg-white p-3">
					<p class="text-xs font-semibold uppercase text-stone-500">Status</p>
					<p class="mt-1 text-lg font-black capitalize">{lyrics?.timeline_status || 'None'}</p>
				</div>
				<div class="rounded-md border border-stone-200 bg-white p-3">
					<p class="text-xs font-semibold uppercase text-stone-500">Time</p>
					<p class="mt-1 text-lg font-black">
						{formatMs(currentTimeMs)}{durationMs ? ` / ${formatMs(durationMs)}` : ''}
					</p>
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

		{#if notice}
			<p
				class="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
			>
				{notice}
			</p>
		{/if}

		{#if loading}
			<div
				class="rounded-md border border-stone-200 bg-white p-8 text-center text-sm font-semibold text-stone-500"
			>
				Loading timing editor...
			</div>
		{:else if !lyrics}
			<section class="rounded-md border border-stone-200 bg-white p-6">
				<p class="text-xs font-bold uppercase text-stone-500">Lyrics not synced yet</p>
				<h2 class="mt-2 text-2xl font-black text-stone-950">
					{detail?.reviewRow?.audio_title || audio?.title || 'This audio'}
				</h2>
				<p class="mt-2 max-w-2xl text-sm font-semibold leading-6 text-stone-500">
					Syncing copies the approved source lyrics into your database as safe plain text. Public
					users can only see synced lyrics, and timing stays private until you publish it.
				</p>
				<button
					class="mt-5 min-h-11 rounded-md bg-stone-950 px-5 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
					disabled={syncing}
					on:click={syncLyrics}
					type="button"
				>
					{syncing ? 'Syncing...' : 'Sync lyrics'}
				</button>
			</section>
		{:else}
			<section class="grid gap-5 xl:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)]">
				<aside class="rounded-md border border-stone-200 bg-white">
					<div class="border-b border-stone-200 p-5">
						<p class="text-xs font-bold uppercase text-stone-500">Audio</p>
						<h2 class="mt-1 text-xl font-black text-stone-950">
							{audio?.title || detail?.reviewRow?.audio_title}
						</h2>
						<p class="mt-1 text-sm text-stone-500">
							{audio?.book_full_name ||
								detail?.reviewRow?.audio_book_full_name ||
								detail?.reviewRow?.source_book}
						</p>
						<audio
							bind:this={audioElement}
							class="mt-4 w-full"
							controls
							src={audioUrl}
							on:durationchange={updateTime}
							on:loadedmetadata={updateTime}
							on:pause={() => (isPlaying = false)}
							on:play={() => (isPlaying = true)}
							on:timeupdate={updateTime}
						></audio>
					</div>

					<div class="space-y-4 p-5">
						<div>
							<p class="text-xs font-bold uppercase text-stone-500">Current line</p>
							<p
								class="mt-1 min-h-14 rounded-md border border-stone-200 bg-stone-50 p-3 text-lg font-black leading-6 text-stone-950"
							>
								{selectedLine?.text || 'No lyric line selected'}
							</p>
							<div class="mt-2 grid gap-2 sm:grid-cols-2">
								<button
									class="min-h-9 rounded-md border border-stone-300 bg-white px-3 text-xs font-bold text-stone-700 hover:border-missionnaire hover:text-missionnaire disabled:cursor-not-allowed disabled:opacity-50"
									disabled={!selectedLine || selectedLine.kind !== 'line'}
									on:click={() => openSplitEditor()}
									type="button"
								>
									Break into sung phrases
								</button>
								<button
									class="min-h-9 rounded-md border border-stone-300 bg-white px-3 text-xs font-bold text-stone-700 hover:border-missionnaire hover:text-missionnaire disabled:cursor-wait disabled:opacity-50"
									disabled={!lyrics || resettingBreaks}
									on:click={resetLineBreaks}
									type="button"
								>
									{resettingBreaks ? 'Restoring...' : 'Restore source breaks'}
								</button>
							</div>
						</div>

						{#if splitEditorLineId}
							<div class="rounded-md border border-orange-200 bg-orange-50 p-3">
								<div class="flex items-start justify-between gap-3">
									<div>
										<p class="text-xs font-black uppercase tracking-[0.14em] text-orange-700">
											Line breaks
										</p>
										<p class="mt-1 text-xs font-semibold leading-5 text-stone-600">
											Put each breath or sung phrase on a separate line.
										</p>
									</div>
									<button
										class="rounded-md border border-orange-200 bg-white px-2 py-1 text-xs font-bold text-stone-600 hover:text-stone-900"
										on:click={closeSplitEditor}
										type="button"
									>
										Close
									</button>
								</div>
								<textarea
									class="mt-3 min-h-36 w-full rounded-md border border-orange-200 bg-white px-3 py-2 text-sm font-semibold leading-6 text-stone-900 outline-none focus:border-missionnaire"
									bind:value={splitText}
								></textarea>
								<button
									class="mt-3 min-h-10 w-full rounded-md bg-stone-950 px-3 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60"
									disabled={splitting}
									on:click={saveLineSplit}
									type="button"
								>
									{splitting ? 'Saving breaks...' : 'Save line breaks'}
								</button>
							</div>
						{/if}

						<div class="grid grid-cols-2 gap-2">
							<button
								class="min-h-11 rounded-md border border-stone-300 bg-white px-3 text-sm font-bold text-stone-800"
								on:click={togglePlayback}
								type="button"
							>
								{isPlaying ? 'Pause' : 'Play'}
							</button>
							<button
								class="min-h-11 rounded-md bg-missionnaire px-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
								disabled={!selectedLine}
								on:click={markSelectedLine}
								type="button"
							>
								Mark current line
							</button>
						</div>

						<div class="grid grid-cols-3 gap-2">
							<button
								class="min-h-10 rounded-md border border-stone-300 bg-white px-3 text-xs font-bold text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
								disabled={!selectedLine}
								on:click={() => nudgeSelectedLine(-100)}
								type="button"
							>
								-100ms
							</button>
							<button
								class="min-h-10 rounded-md border border-stone-300 bg-white px-3 text-xs font-bold text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
								disabled={!selectedLine || timings[selectedLine.id] === undefined}
								on:click={() => selectedLine && seekToLine(selectedLine)}
								type="button"
							>
								Replay
							</button>
							<button
								class="min-h-10 rounded-md border border-stone-300 bg-white px-3 text-xs font-bold text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
								disabled={!selectedLine}
								on:click={() => nudgeSelectedLine(100)}
								type="button"
							>
								+100ms
							</button>
						</div>

						<div class="grid grid-cols-3 gap-2 border-t border-stone-200 pt-4">
							<button
								class="min-h-10 rounded-md border border-stone-300 bg-white px-3 text-xs font-bold text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
								disabled={markHistory.length === 0}
								on:click={undoMark}
								type="button"
							>
								Undo
							</button>
							<button
								class="min-h-10 rounded-md bg-stone-950 px-3 text-xs font-bold text-white disabled:cursor-wait disabled:opacity-60"
								disabled={saving}
								on:click={() => saveTimeline('draft')}
								type="button"
							>
								{saving ? 'Saving...' : 'Save draft'}
							</button>
							<button
								class="min-h-10 rounded-md bg-emerald-600 px-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
								disabled={!canPublish || publishing}
								on:click={() => saveTimeline('published')}
								type="button"
							>
								{publishing ? 'Publishing...' : 'Publish'}
							</button>
						</div>

						<button
							class="min-h-10 w-full rounded-md border border-red-200 bg-white px-3 text-xs font-bold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
							disabled={!hasAnyTiming || clearingTimeline}
							on:click={clearTimeline}
							type="button"
						>
							{clearingTimeline ? 'Clearing timing...' : 'Clear all timing'}
						</button>
					</div>
				</aside>

				<div class="overflow-hidden rounded-md border border-stone-200 bg-white">
					<div
						class="flex flex-col gap-3 border-b border-stone-200 p-4 sm:flex-row sm:items-center sm:justify-between"
					>
						<div>
							<p class="text-xs font-bold uppercase text-stone-500">Lyrics</p>
							<h2 class="mt-1 text-xl font-black text-stone-950">{lyrics.title}</h2>
							<p class="mt-1 text-sm text-stone-500">
								{lyrics.source_book} #{lyrics.source_number}
							</p>
						</div>
						<a
							class="rounded-md border border-stone-300 px-3 py-2 text-xs font-bold text-stone-700 hover:border-missionnaire hover:text-missionnaire"
							href={lyrics.source_url}
							target="_blank"
							rel="noreferrer"
						>
							Source
						</a>
					</div>

					<div class="max-h-[72vh] overflow-auto p-4">
						<div class="space-y-2">
							{#each lines as line}
								<button
									class="w-full rounded-md px-4 py-3 text-left transition {line.kind === 'heading'
										? 'cursor-default bg-stone-100 text-xs font-black uppercase tracking-[0.14em] text-stone-500'
										: selectedLineId === line.id
											? 'bg-orange-50 ring-2 ring-missionnaire/40'
											: activeLineId === line.id
												? 'bg-emerald-50'
												: timings[line.id] !== undefined
													? 'bg-white hover:bg-stone-50'
													: 'bg-red-50/50 hover:bg-red-50'}"
									disabled={line.kind === 'heading'}
									on:dblclick={() => seekToLine(line)}
									on:click={() => selectLine(line)}
									type="button"
								>
									<span class="flex items-start gap-3">
										<span class="w-16 shrink-0 text-xs font-black text-stone-500">
											{line.kind === 'heading' ? '' : formatMs(timings[line.id])}
										</span>
										{#if line.kind !== 'heading' && line.verse_number}
											<span
												class="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[10px] font-black text-white"
											>
												{line.verse_number}
											</span>
										{/if}
										<span class="min-w-0 flex-1 text-[15px] font-semibold leading-7 text-stone-900">
											{line.text}
										</span>
									</span>
								</button>
							{/each}
						</div>
					</div>
				</div>
			</section>
		{/if}
	</div>
</main>
