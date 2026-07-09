<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from '$lib/stores/toast';
	import { t } from '$lib/i18n';
	import FileDropZone from '$lib/components/FileDropZone.svelte';
	import { formatExtractedLyrics } from '$lib/lyricsFormat';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// File state
	let file: File | null = $state(null);
	let uploadProgress = $state(0);
	let uploading = $state(false);
	let uploaded = $state(false);
	let s3Key = $state('');
	let s3Url = $state('');

	// Metadata
	let title = $state('');
	let artist = $state('');
	let category = $state('');
	let book = $state('');
	let bookFullName = $state('');
	let number: number | null = $state(null);
	let lyricsText = $state('');
	let lyricsSourceUrl = $state('');
	let lyricsUrlLoading = $state(false);
	let saving = $state(false);

	function onFileSelected(f: File) {
		file = f;
		uploaded = false;
		s3Key = '';
		s3Url = '';
		uploadProgress = 0;

		// Auto-fill title from filename
		const nameWithoutExt = f.name.replace(/\.[^/.]+$/, '');
		if (!title) {
			title = nameWithoutExt.replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();
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
				audioTitle: title || ''
			});
			const res = await fetch(`/api/lyrics-review/lyrics?${params.toString()}`);
			const result = await res.json();
			if (!res.ok) throw new Error(result.error ?? $t('audio.lyrics.loadFailed'));

			const formatted = formatExtractedLyrics(result.sections, result.lines);
			if (!formatted.trim()) {
				toast.error($t('audio.lyrics.noneFound'));
				return;
			}

			lyricsText = formatted;
			if (!title && typeof result.title === 'string' && result.title.trim()) {
				title = result.title.trim();
			}
			toast.success($t('audio.lyrics.loadedFromUrl'));
		} catch (err) {
			toast.error(err instanceof Error ? err.message : $t('audio.lyrics.loadError'));
		} finally {
			lyricsUrlLoading = false;
		}
	}

	async function uploadToS3() {
		if (!file || !category) return;
		uploading = true;
		uploadProgress = 0;

		try {
			// 1. Get presigned URL
			const urlRes = await fetch('/api/audio/upload-url', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					fileName: file.name,
					contentType: file.type || 'audio/mpeg',
					category
				})
			});
			const urlData = await urlRes.json();
			if (urlData.error) throw new Error(urlData.error);

			s3Key = urlData.data.s3Key;
			s3Url = urlData.data.s3Url;

			// 2. Upload to S3 with progress
			await new Promise<void>((resolve, reject) => {
				const xhr = new XMLHttpRequest();
				xhr.upload.addEventListener('progress', (e) => {
					if (e.lengthComputable) {
						uploadProgress = Math.round((e.loaded / e.total) * 100);
					}
				});
				xhr.addEventListener('load', () => {
					if (xhr.status >= 200 && xhr.status < 300) {
						resolve();
					} else {
						reject(new Error(`Upload failed with status ${xhr.status}`));
					}
				});
				xhr.addEventListener('error', () => reject(new Error('Upload failed')));
				xhr.open('PUT', urlData.data.uploadUrl);
				xhr.setRequestHeader('Content-Type', file!.type || 'audio/mpeg');
				xhr.send(file);
			});

			uploaded = true;
			toast.success($t('audio.new.uploadedToServer'));
		} catch (err) {
			toast.error(err instanceof Error ? err.message : $t('audio.new.uploadError'));
			s3Key = '';
			s3Url = '';
		} finally {
			uploading = false;
		}
	}

	async function saveRecord() {
		if (!uploaded || !file) return;
		saving = true;

		try {
			// Try to get duration from browser
			let duration: number | null = null;
			try {
				const audioEl = new Audio();
				audioEl.preload = 'metadata';
				const objectUrl = URL.createObjectURL(file);
				duration = await new Promise<number | null>((resolve) => {
					audioEl.onloadedmetadata = () => {
						URL.revokeObjectURL(objectUrl);
						resolve(isFinite(audioEl.duration) ? audioEl.duration : null);
					};
					audioEl.onerror = () => {
						URL.revokeObjectURL(objectUrl);
						resolve(null);
					};
					audioEl.src = objectUrl;
				});
			} catch {
				// Duration extraction failed, continue without it
			}

			const format = file.name.split('.').pop()?.toLowerCase() ?? 'mp3';

			const res = await fetch('/api/audio/complete-upload', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: title || file.name,
					artist: artist || null,
					category,
					book: book || null,
					book_full_name: bookFullName || null,
					number,
					s3_key: s3Key,
					s3_url: s3Url,
					file_size: file.size,
					duration,
					format
				})
			});

			const result = await res.json();
			if (result.error) throw new Error(result.error);

			if (result.data.duplicateWarning) {
				toast.info(result.data.duplicateWarning);
			}

			const audioId = result.data._id;
			if (lyricsText.trim()) {
				const lyricsRes = await fetch(`/api/audio/${audioId}/lyrics`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						lyricsText,
						sourceBook: bookFullName || book || category,
						sourceNumber: number ? String(number) : '',
						sourceTitle: title || file.name,
						sourceUrl: lyricsSourceUrl.trim(),
						title: title || file.name
					})
				});
				const lyricsResult = await lyricsRes.json();
				if (lyricsResult.error) {
					toast.error(lyricsResult.error);
				} else {
					toast.success($t('audio.new.savedWithLyrics'));
				}
			} else {
				toast.success($t('audio.new.saved'));
			}

			goto(`/audio/${audioId}`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : $t('audio.new.saveError'));
		} finally {
			saving = false;
		}
	}

	const canUpload = $derived(!!file && !!category && !uploading && !uploaded);
	const canSave = $derived(uploaded && !!title && !!category && !saving);
</script>

<svelte:head>
	<title>{$t('audio.new.pageTitle')}</title>
</svelte:head>

<!-- Header -->
<div class="mb-8">
	<a
		href="/audio"
		class="mb-4 inline-flex items-center gap-1 text-sm text-stone-500 transition-colors hover:text-primary"
	>
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
		</svg>
		{$t('audio.backToLibrary')}
	</a>
	<div class="flex items-end justify-between gap-4">
		<h1 class="font-display text-3xl font-semibold text-stone-800">{$t('audio.new.title')}</h1>
		<a
			href="/audio/bulk-new"
			class="inline-flex items-center gap-1 text-sm text-primary hover:underline"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M3 7l2-2h4l2 2h10a2 2 0 012 2v9a2 2 0 01-2 2H3a2 2 0 01-2-2V9a2 2 0 012-2z"
				/>
			</svg>
			{$t('audio.new.bulkLink')}
		</a>
	</div>
</div>

<div class="mx-auto max-w-2xl">
	<!-- Step 1: File selection -->
	<div class="mb-8">
		<h2 class="mb-3 font-display text-lg font-semibold text-stone-700">{$t('audio.new.step1')}</h2>
		<FileDropZone onfileselected={onFileSelected} />
	</div>

	<!-- Step 2: Metadata -->
	<div class="mb-8 border border-stone-200/60 bg-white/40 p-6">
		<h2 class="mb-5 font-display text-lg font-semibold text-stone-700">{$t('audio.new.step2')}</h2>

		<div class="grid gap-5 sm:grid-cols-2">
			<div class="sm:col-span-2">
				<label for="title" class="admin-label">{$t('audio.fields.title')} *</label>
				<input
					id="title"
					type="text"
					class="admin-input"
					bind:value={title}
					placeholder={$t('audio.new.titlePlaceholder')}
				/>
			</div>

			<div>
				<label for="artist" class="admin-label">{$t('audio.fields.artist')}</label>
				<input
					id="artist"
					type="text"
					class="admin-input"
					bind:value={artist}
					list="artist-list"
					placeholder={$t('audio.new.artistPlaceholder')}
				/>
				<datalist id="artist-list">
					{#each data.artists as a}
						<option value={a}></option>
					{/each}
				</datalist>
			</div>

			<div>
				<label for="category" class="admin-label">{$t('audio.fields.category')} *</label>
				<select id="category" class="admin-input" bind:value={category}>
					<option value="">{$t('audio.new.selectPlaceholder')}</option>
					{#each data.categories as cat}
						<option value={cat}>{cat}</option>
					{/each}
					<option value="__new">{$t('audio.fields.newCategory')}</option>
				</select>
				{#if category === '__new'}
					<input
						type="text"
						class="admin-input mt-2"
						placeholder={$t('audio.fields.newCategoryPlaceholder')}
						onchange={(e) => (category = e.currentTarget.value)}
					/>
				{/if}
			</div>

			<div>
				<label for="book" class="admin-label">{$t('audio.fields.book')}</label>
				<input id="book" type="text" class="admin-input" bind:value={book} placeholder={$t('audio.fields.bookPlaceholder')} />
			</div>

			<div>
				<label for="bookFullName" class="admin-label">{$t('audio.fields.bookFullName')}</label>
				<input
					id="bookFullName"
					type="text"
					class="admin-input"
					bind:value={bookFullName}
					placeholder={$t('audio.fields.bookFullNamePlaceholder')}
				/>
			</div>

			<div>
				<label for="number" class="admin-label">{$t('audio.fields.number')}</label>
				<input
					id="number"
					type="number"
					class="admin-input"
					value={number ?? ''}
					oninput={(e) => {
						const v = e.currentTarget.value;
						number = v ? Number.parseInt(v) : null;
					}}
					placeholder={$t('audio.new.numberPlaceholder')}
				/>
			</div>
		</div>
	</div>

	<!-- Step 3: Optional lyrics -->
	<div class="mb-8 border border-stone-200/60 bg-white/40 p-6">
		<h2 class="mb-3 font-display text-lg font-semibold text-stone-700">
			{$t('audio.new.step3')} <span class="text-sm font-normal text-stone-400">{$t('audio.new.optional')}</span>
		</h2>

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
					onpaste={(e) => {
						const pasted = e.clipboardData?.getData('text')?.trim();
						if (!pasted) return;
						lyricsSourceUrl = pasted;
						queueMicrotask(loadLyricsFromUrl);
					}}
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

		<label for="lyricsText" class="admin-label">{$t('audio.lyrics.textLabel')}</label>
		<textarea
			id="lyricsText"
			class="admin-input min-h-64 resize-y leading-7"
			bind:value={lyricsText}
			placeholder={$t('audio.new.lyricsPlaceholder')}
		></textarea>
		<p class="mt-2 text-xs text-stone-500">
			{$t('audio.new.lyricsHelp')}
		</p>
	</div>

	<!-- Step 4: Upload & Save -->
	<div class="mb-8 border border-stone-200/60 bg-white/40 p-6">
		<h2 class="mb-5 font-display text-lg font-semibold text-stone-700">{$t('audio.new.step4')}</h2>

		{#if !uploaded}
			<!-- Upload progress -->
			{#if uploading}
				<div class="mb-4">
					<div class="mb-2 flex justify-between text-sm">
						<span class="text-stone-600">{$t('audio.new.uploading')}</span>
						<span class="font-medium text-primary">{uploadProgress}%</span>
					</div>
					<div class="h-3 overflow-hidden rounded-full bg-cream-dark">
						<div
							class="h-full rounded-full bg-gradient-to-r from-primary to-missionnaire-400 transition-all duration-300"
							style="width: {uploadProgress}%"
						></div>
					</div>
				</div>
			{/if}

			<button
				onclick={uploadToS3}
				disabled={!canUpload}
				class="admin-btn-primary w-full justify-center disabled:opacity-50"
			>
				{#if uploading}
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
					{$t('audio.new.uploading')}
				{:else}
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
							d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
						/>
					</svg>
					{$t('audio.new.uploadButton')}
				{/if}
			</button>

			{#if !file}
				<p class="mt-2 text-center text-xs text-stone-400">
					{$t('audio.new.selectFileFirst')}
				</p>
			{/if}
		{:else}
			<!-- Save record -->
			<div class="mb-4 border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
				{$t('audio.new.uploadSuccessHint')}
			</div>

			<button
				onclick={saveRecord}
				disabled={!canSave}
				class="admin-btn-primary w-full justify-center disabled:opacity-50"
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
					{$t('audio.new.savingButton')}
				{:else}
					<svg
						class="h-4 w-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
					{$t('audio.new.saveButton')}
				{/if}
			</button>
		{/if}
	</div>
</div>
