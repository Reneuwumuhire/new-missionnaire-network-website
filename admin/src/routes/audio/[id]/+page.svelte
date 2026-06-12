<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { toast } from '$lib/stores/toast';
	import { audioPreview } from '$lib/stores/audio-preview';
	import { t } from '$lib/i18n';
	import AudioPreviewPlayer from '$lib/components/AudioPreviewPlayer.svelte';
	import type { PageData } from './$types';

	type PublishedLyrics = {
		lyrics_status?: string;
		lines?: unknown[];
		source_book?: string;
		source_number?: string;
		source_title?: string;
		source_url?: string;
		synced_at?: string;
		synced_by?: string;
		timeline_status?: string;
	};

	type ExtractedSection = {
		label: string;
		title: string;
		lines: Array<string | { role?: string; text?: string; verse_number?: number | null }>;
	};

	let { data }: { data: PageData } = $props();

	// Editable fields — reset when data changes (e.g. after invalidateAll)
	let title = $state(data.audio.title ?? '');
	let artist = $state(data.audio.artist ?? '');
	let category = $state(data.audio.category);
	let book = $state(data.audio.book ?? '');
	let bookFullName = $state(data.audio.book_full_name ?? '');
	let number: number | null = $state(data.audio.number ?? null);

	$effect(() => {
		title = data.audio.title ?? '';
		artist = data.audio.artist ?? '';
		category = data.audio.category;
		book = data.audio.book ?? '';
		bookFullName = data.audio.book_full_name ?? '';
		number = data.audio.number ?? null;
	});

	// Stop the shared inline preview when leaving the page.
	onDestroy(() => audioPreview.stop());

	// Field-level validation feedback (inline, aria-invalid). Server errors
	// without a field keep using the generic toast.
	let fieldErrors = $state<Partial<Record<'title' | 'number', string>>>({});

	function validateFields(): boolean {
		const errors: typeof fieldErrors = {};
		if (!title.trim()) errors.title = $t('audio.edit.titleRequired');
		if (number !== null && (!Number.isInteger(number) || number < 0)) {
			errors.number = $t('audio.edit.numberInvalid');
		}
		fieldErrors = errors;
		return Object.keys(errors).length === 0;
	}

	let saving = $state(false);
	let confirmDelete = $state(false);
	let deleting = $state(false);
	let lyricsTextOverride = $state<string | null>(null);
	let lyricsSaving = $state(false);
	let lyrics = $derived((data.lyrics as PublishedLyrics | null) ?? null);
	let lyricsText = $derived(lyricsTextOverride ?? buildLyricsText(lyrics?.lines));
	let lyricsSourceUrl = $state(data.lyrics?.source_url ?? '');
	let lyricsUrlLoading = $state(false);

	$effect(() => {
		lyricsSourceUrl = data.lyrics?.source_url ?? '';
	});

	const backHref = $derived(`/audio${$page.url.search}`);

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	function formatDuration(seconds: number | null | undefined): string {
		if (!seconds) return $t('audio.edit.unknownDuration');
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	function formatDate(date: string | Date): string {
		return new Date(date).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function lineText(line: unknown) {
		if (typeof line === 'string') return line.trim();
		if (!line || typeof line !== 'object') return '';
		const record = line as { kind?: string; text?: unknown };
		if (record.kind === 'heading') return '';
		return String(record.text ?? '').trim();
	}

	function lineRole(line: unknown) {
		if (!line || typeof line !== 'object') return '';
		return String((line as { role?: unknown }).role ?? '');
	}

	function formatLineForEditing(line: unknown) {
		const text = lineText(line);
		if (!text || typeof line !== 'object' || line === null) return text;
		const verseNumber = Number((line as { verse_number?: unknown }).verse_number);
		return Number.isFinite(verseNumber) && verseNumber > 0 ? `${verseNumber}. ${text}` : text;
	}

	function buildLyricsText(lines: unknown[] | undefined) {
		const blocks: string[][] = [];
		let inRefrain = false;

		for (const line of lines ?? []) {
			const text = formatLineForEditing(line);
			if (!text) continue;

			if (lineRole(line) === 'refrain') {
				if (!inRefrain) {
					blocks.push(['Refrain']);
					inRefrain = true;
				}
				blocks[blocks.length - 1].push(text);
				continue;
			}

			blocks.push([text]);
			inRefrain = false;
		}

		return blocks.map((block) => block.join('\n')).join('\n\n');
	}

	function lyricLineCount(lines: unknown[] | undefined) {
		return (lines ?? []).filter((line) => lineText(line)).length;
	}

	function lyricsSourceLabel(currentLyrics: PublishedLyrics | null) {
		if (!currentLyrics) return '';
		return [
			currentLyrics.source_book,
			currentLyrics.source_number ? `#${currentLyrics.source_number}` : ''
		]
			.filter(Boolean)
			.join(' ');
	}

	async function saveChanges() {
		if (!data.canEdit) return;
		if (!validateFields()) return;
		saving = true;
		try {
			const res = await fetch(`/api/audio/${data.audio._id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: title || null,
					artist: artist || null,
					category,
					book: book || null,
					book_full_name: bookFullName || null,
					number
				})
			});
			const result = await res.json();
			if (result.error) {
				// Validation errors carry a `field` → show them inline instead
				// of a toast.
				if (res.status === 400 && (result.field === 'title' || result.field === 'number')) {
					fieldErrors = { [result.field]: String(result.error) };
					return;
				}
				throw new Error(result.error);
			}

			fieldErrors = {};
			toast.success($t('audio.edit.saved'));
			await invalidateAll();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : $t('audio.edit.saveError'));
		} finally {
			saving = false;
		}
	}

	async function deleteAudio() {
		if (!data.canDelete) return;
		deleting = true;
		try {
			const res = await fetch(`/api/audio/${data.audio._id}`, { method: 'DELETE' });
			const result = await res.json();
			if (result.error) throw new Error(result.error);

			toast.success($t('audio.edit.deleted'));
			goto(backHref);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : $t('audio.edit.deleteError'));
		} finally {
			deleting = false;
		}
	}

	async function loadLyricsFromUrl() {
		const url = lyricsSourceUrl.trim();
		if (!url) {
			toast.error($t('audio.lyrics.pasteUrlFirst'));
			return;
		}

		try {
			const parsed = new URL(url);
			if (parsed.hostname !== 'indirimbo-zikundwa.bi') {
				toast.error($t('audio.lyrics.unsupportedUrl'));
				return;
			}
		} catch {
			toast.error($t('audio.lyrics.invalidUrl'));
			return;
		}

		lyricsUrlLoading = true;
		try {
			const params = new URLSearchParams({
				url,
				audioTitle: title || data.audio.title || ''
			});
			const res = await fetch(`/api/lyrics-review/lyrics?${params.toString()}`);
			const result = await res.json();
			if (!res.ok) throw new Error(result.error ?? $t('audio.lyrics.loadFailed'));

			const formatted = formatExtractedLyrics(result.sections, result.lines);
			if (!formatted.trim()) {
				toast.error($t('audio.lyrics.noneFound'));
				return;
			}

			lyricsTextOverride = formatted;
			toast.success($t('audio.lyrics.loadedFromUrl'));
		} catch (err) {
			toast.error(err instanceof Error ? err.message : $t('audio.lyrics.loadError'));
		} finally {
			lyricsUrlLoading = false;
		}
	}

	function formatExtractedLyrics(sections: ExtractedSection[] | undefined, lines: string[] | undefined) {
		if (sections && sections.length > 0) {
			const blocks: string[][] = [];
			let inRefrain = false;

			for (const section of sections) {
				for (const sourceLine of section.lines ?? []) {
					const text =
						typeof sourceLine === 'string' ? sourceLine.trim() : (sourceLine.text ?? '').trim();
					if (!text) continue;
					const role = typeof sourceLine === 'string' ? '' : (sourceLine.role ?? '');
					const verseNumber =
						typeof sourceLine === 'string' ? null : (sourceLine.verse_number ?? null);
					const formatted =
						typeof verseNumber === 'number' && verseNumber > 0 ? `${verseNumber}. ${text}` : text;

					if (role === 'refrain') {
						if (!inRefrain) {
							blocks.push(['Refrain']);
							inRefrain = true;
						}
						blocks[blocks.length - 1].push(formatted);
						continue;
					}

					blocks.push([formatted]);
					inRefrain = false;
				}
			}

			return blocks.map((block) => block.join('\n')).join('\n\n');
		}

		return (lines ?? []).filter(Boolean).join('\n\n');
	}

	async function publishLyrics() {
		if (!data.canPublishLyrics || !data.audio._id) return;
		if (!lyricsText.trim()) {
			toast.error($t('audio.lyrics.addBeforePublish'));
			return;
		}

		lyricsSaving = true;
		try {
			const res = await fetch(`/api/audio/${data.audio._id}/lyrics`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					lyricsText,
					sourceBook: bookFullName || book || category,
					sourceNumber: number ? String(number) : '',
					sourceTitle: title || data.audio.title || '',
					sourceUrl: lyricsSourceUrl.trim(),
					title: title || data.audio.title || ''
				})
			});
			const result = await res.json();
			if (result.error) throw new Error(result.error);

			toast.success($t('audio.lyrics.published'));
			await invalidateAll();
			lyricsTextOverride = null;
		} catch (err) {
			toast.error(err instanceof Error ? err.message : $t('audio.lyrics.publishError'));
		} finally {
			lyricsSaving = false;
		}
	}
</script>

<svelte:head>
	<title>{data.audio.title || $t('audio.edit.fallbackTitle')} - Missionnaire Admin</title>
</svelte:head>

<!-- Header -->
<div class="mb-8">
	<a
		href={backHref}
		class="mb-4 inline-flex items-center gap-1 text-sm text-stone-500 transition-colors hover:text-primary"
	>
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
		</svg>
		{$t('audio.backToLibrary')}
	</a>
	<h1 class="font-display text-3xl font-semibold text-stone-800">
		{data.canEdit ? $t('audio.edit.title') : $t('audio.edit.titleReadonly')}
	</h1>
</div>

<div class="mx-auto grid max-w-4xl gap-6 lg:grid-cols-3">
	<!-- Main form (2 cols) -->
	<div class="lg:col-span-2">
		<div class="border border-stone-200/60 bg-white/40 p-6">
			<h2 class="mb-5 font-display text-lg font-semibold text-stone-700">{$t('audio.edit.metadata')}</h2>

			<div class="grid gap-5 sm:grid-cols-2">
				<div class="sm:col-span-2">
					<label for="title" class="admin-label">{$t('audio.fields.title')}</label>
					<input
						id="title"
						type="text"
						class="admin-input {fieldErrors.title ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''}"
						bind:value={title}
						disabled={!data.canEdit}
						aria-invalid={fieldErrors.title ? 'true' : undefined}
						aria-describedby={fieldErrors.title ? 'title-error' : undefined}
					/>
					{#if fieldErrors.title}
						<p id="title-error" class="mt-1.5 text-xs text-red-600">{fieldErrors.title}</p>
					{/if}
				</div>

				<div>
					<label for="artist" class="admin-label">{$t('audio.fields.artist')}</label>
					<input
						id="artist"
						type="text"
						class="admin-input"
						bind:value={artist}
						list="artist-list"
						disabled={!data.canEdit}
					/>
					<datalist id="artist-list">
						{#each data.artists as a}
							<option value={a}></option>
						{/each}
					</datalist>
				</div>

				<div>
					<label for="category" class="admin-label">{$t('audio.fields.category')}</label>
					<select id="category" class="admin-input" bind:value={category} disabled={!data.canEdit}>
						{#each data.categories as cat}
							<option value={cat}>{cat}</option>
						{/each}
					</select>
				</div>

				<div>
					<label for="book" class="admin-label">{$t('audio.fields.book')}</label>
					<input
						id="book"
						type="text"
						class="admin-input"
						bind:value={book}
						disabled={!data.canEdit}
					/>
				</div>

				<div>
					<label for="bookFullName" class="admin-label">{$t('audio.fields.bookFullName')}</label>
					<input
						id="bookFullName"
						type="text"
						class="admin-input"
						bind:value={bookFullName}
						disabled={!data.canEdit}
					/>
				</div>

				<div>
					<label for="number" class="admin-label">{$t('audio.fields.number')}</label>
					<input
						id="number"
						type="number"
						class="admin-input {fieldErrors.number ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : ''}"
						value={number ?? ''}
						disabled={!data.canEdit}
						aria-invalid={fieldErrors.number ? 'true' : undefined}
						aria-describedby={fieldErrors.number ? 'number-error' : undefined}
						oninput={(e) => {
							const v = e.currentTarget.value;
							number = v ? Number.parseInt(v) : null;
						}}
					/>
					{#if fieldErrors.number}
						<p id="number-error" class="mt-1.5 text-xs text-red-600">{fieldErrors.number}</p>
					{/if}
				</div>
			</div>

			<div class="mt-6 flex items-center gap-3">
				{#if data.canEdit}
					<button
						onclick={saveChanges}
						disabled={saving}
						class="admin-btn-primary disabled:opacity-50"
					>
						{#if saving}
							<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								/>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
								/>
							</svg>
						{/if}
						{$t('audio.edit.save')}
					</button>
				{/if}
				<a href={backHref} class="admin-btn-secondary">{$t('audio.common.cancel')}</a>
			</div>
		</div>

		<div class="mt-6 border border-stone-200/60 bg-white/40 p-6">
			<div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
				<div>
					<p class="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">{$t('audio.lyrics.eyebrow')}</p>
					<h2 class="mt-1 font-display text-lg font-semibold text-stone-700">
						{$t('audio.lyrics.publishHeading')}
					</h2>
					{#if lyrics}
						<p class="mt-1 text-sm text-stone-500">
							{$t('audio.lyrics.linesPublished', { count: lyricLineCount(lyrics.lines) })}{lyrics.synced_at
								? $t('audio.lyrics.onDate', { date: formatDate(lyrics.synced_at) })
								: ''}{lyrics.synced_by ? $t('audio.lyrics.byUser', { user: lyrics.synced_by }) : ''}
						</p>
					{:else}
						<p class="mt-1 text-sm text-stone-500">
							{$t('audio.lyrics.emptyHint')}
						</p>
					{/if}
				</div>
				{#if lyrics}
					<span
						class="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800"
					>
						{$t('audio.lyrics.publishedBadge')}
					</span>
				{/if}
			</div>

			{#if data.canPublishLyrics}
				<div class="mb-5 rounded border border-stone-200/70 bg-stone-50/60 p-4">
					<label for="lyricsSourceUrl" class="admin-label">
						{$t('audio.lyrics.importFromSite')}
					</label>
					<div class="flex flex-col gap-2 sm:flex-row">
						<input
							id="lyricsSourceUrl"
							type="url"
							class="admin-input flex-1"
							bind:value={lyricsSourceUrl}
							placeholder="https://indirimbo-zikundwa.bi/..."
							disabled={lyricsUrlLoading}
						/>
						<button
							type="button"
							onclick={loadLyricsFromUrl}
							disabled={lyricsUrlLoading || !lyricsSourceUrl.trim()}
							class="admin-btn-secondary disabled:opacity-50"
						>
							{lyricsUrlLoading ? $t('audio.lyrics.loading') : $t('audio.lyrics.loadFromUrl')}
						</button>
					</div>
					<p class="mt-2 text-xs text-stone-500">
						{$t('audio.lyrics.urlHelp')}
					</p>
				</div>
			{/if}

			<label for="lyricsText" class="admin-label">{$t('audio.lyrics.textLabel')}</label>
			<textarea
				id="lyricsText"
				class="admin-input min-h-72 resize-y leading-7"
				bind:value={lyricsText}
				disabled={!data.canPublishLyrics}
				placeholder={$t('audio.lyrics.pastePlaceholder', { title: title || $t('audio.lyrics.thisAudio') })}
			></textarea>
			<p class="mt-2 text-xs text-stone-500">
				{$t('audio.lyrics.formatHelp')}
			</p>

			<div class="mt-5 flex flex-wrap items-center gap-3">
				{#if data.canPublishLyrics}
					<button
						onclick={publishLyrics}
						disabled={lyricsSaving || !lyricsText.trim()}
						class="admin-btn-primary disabled:opacity-50"
					>
						{lyricsSaving
							? $t('audio.lyrics.publishing')
							: lyrics
								? $t('audio.lyrics.republish')
								: $t('audio.lyrics.publish')}
					</button>
				{/if}
				{#if lyrics && data.canReviewLyrics && data.audio._id}
					<a href={`/lyrics-review/timing/${data.audio._id}`} class="admin-btn-secondary">
						{$t('audio.lyrics.addTiming')}
					</a>
				{/if}
				{#if lyricsSourceLabel(lyrics)}
					<span class="text-xs font-semibold text-stone-500">
						{$t('audio.lyrics.sourceLabel', { source: lyricsSourceLabel(lyrics) })}
					</span>
				{/if}
			</div>
		</div>
	</div>

	<!-- Sidebar info (1 col) -->
	<div class="space-y-6">
		<!-- Audio preview -->
		<div class="border border-stone-200/60 bg-white/40 p-6">
			<h3 class="mb-4 text-sm font-medium text-stone-500 uppercase tracking-wider">{$t('audio.edit.preview')}</h3>
			<div class="mb-4">
				<AudioPreviewPlayer src={data.audio.s3_url} />
			</div>
			<div class="ornament-line my-4">
				<span class="text-xs text-earth/40">&#8226;</span>
			</div>
			<dl class="space-y-3 text-sm">
				<div>
					<dt class="text-stone-400">{$t('audio.edit.format')}</dt>
					<dd class="font-medium text-stone-700">{data.audio.format.toUpperCase()}</dd>
				</div>
				<div>
					<dt class="text-stone-400">{$t('audio.edit.size')}</dt>
					<dd class="font-medium text-stone-700">{formatBytes(data.audio.file_size)}</dd>
				</div>
				<div>
					<dt class="text-stone-400">{$t('audio.edit.duration')}</dt>
					<dd class="font-medium text-stone-700">{formatDuration(data.audio.duration)}</dd>
				</div>
				<div>
					<dt class="text-stone-400">{$t('audio.edit.s3Key')}</dt>
					<dd class="break-all font-mono text-xs text-stone-500">{data.audio.s3_key}</dd>
				</div>
				<div>
					<dt class="text-stone-400">{$t('audio.edit.uploadedAt')}</dt>
					<dd class="font-medium text-stone-700">{formatDate(data.audio.uploaded_at)}</dd>
				</div>
				{#if data.audio.updated_at}
					<div>
						<dt class="text-stone-400">{$t('audio.edit.updatedAt')}</dt>
						<dd class="font-medium text-stone-700">{formatDate(data.audio.updated_at)}</dd>
					</div>
				{/if}
				{#if data.audio.updated_by}
					<div>
						<dt class="text-stone-400">{$t('audio.edit.updatedBy')}</dt>
						<dd class="font-medium text-stone-700">{data.audio.updated_by}</dd>
					</div>
				{/if}
			</dl>
		</div>

		{#if data.canDelete}
			<!-- Danger zone -->
			<div class="border border-red-200/60 bg-white/40 p-6">
				<h3 class="mb-3 text-sm font-medium text-red-600 uppercase tracking-wider">
					{$t('audio.edit.dangerZone')}
				</h3>
				<p class="mb-4 text-sm text-stone-500">
					{$t('audio.edit.deleteWarning')}
				</p>
				{#if confirmDelete}
					<div class="flex items-center gap-2">
						<button onclick={deleteAudio} disabled={deleting} class="admin-btn-danger admin-btn-compact">
							{deleting ? $t('audio.edit.deleting') : $t('audio.edit.confirmDelete')}
						</button>
						<button
							onclick={() => (confirmDelete = false)}
							class="text-xs text-stone-500 hover:text-stone-700"
						>
							{$t('audio.common.cancel')}
						</button>
					</div>
				{:else}
					<button
						onclick={() => (confirmDelete = true)}
						class="admin-btn-danger w-full justify-center"
					>
						<svg
							class="h-4 w-4"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
							/>
						</svg>
						{$t('audio.edit.deleteButton')}
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
