<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { toast } from '$lib/stores/toast';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const ALLOWED_EXTENSIONS = ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'];
	const MAX_SIZE = 500 * 1024 * 1024; // 500MB
	const CONTENT_TYPE_BY_EXT: Record<string, string> = {
		mp3: 'audio/mpeg',
		wav: 'audio/wav',
		flac: 'audio/flac',
		ogg: 'audio/ogg',
		m4a: 'audio/x-m4a',
		aac: 'audio/aac'
	};

	type RowStatus = 'pending' | 'uploading' | 'saving' | 'done' | 'error' | 'skipped';

	type Row = {
		id: string;
		file: File;
		relativePath: string;
		title: string;
		artist: string;
		category: string;
		book: string;
		bookFullName: string;
		number: number | null;
		progress: number;
		status: RowStatus;
		error: string;
		duplicateWarning: string;
	};

	let rows: Row[] = $state([]);
	let categories: string[] = $state([...data.categories]);
	let dragover = $state(false);
	let fileInputEl: HTMLInputElement | undefined = $state(undefined);
	let folderInputEl: HTMLInputElement | undefined = $state(undefined);
	let processing = $state(false);

	// Apply-to-all controls
	let bulkCategory = $state('');
	let bulkNewCategory = $state('');
	let bulkArtist = $state('');
	let bulkBook = $state('');
	let bulkBookFullName = $state('');

	let nextRowId = 0;

	onMount(() => {
		// `webkitdirectory` / `directory` / `mozdirectory` are non-standard attributes.
		// Set them via JS so they're reliably applied across browsers.
		if (folderInputEl) {
			folderInputEl.setAttribute('webkitdirectory', '');
			folderInputEl.setAttribute('directory', '');
			folderInputEl.setAttribute('mozdirectory', '');
		}
	});

	const totalFiles = $derived(rows.length);
	const readyCount = $derived(rows.filter((r) => r.title && r.category).length);
	const doneCount = $derived(rows.filter((r) => r.status === 'done').length);
	const errorCount = $derived(rows.filter((r) => r.status === 'error').length);
	const allReady = $derived(totalFiles > 0 && readyCount === totalFiles);
	const hasPending = $derived(rows.some((r) => r.status === 'pending' || r.status === 'error'));

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	function titleFromFilename(name: string): string {
		return name
			.replace(/\.[^/.]+$/, '')
			.replace(/[-_]/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}

	function extOf(name: string): string {
		return name.split('.').pop()?.toLowerCase() ?? '';
	}

	function validateFile(file: File): string | null {
		const ext = extOf(file.name);
		if (!ALLOWED_EXTENSIONS.includes(ext)) {
			return `Format non supporté (.${ext})`;
		}
		if (file.size > MAX_SIZE) {
			return `Trop volumineux (${(file.size / 1024 / 1024).toFixed(0)} MB)`;
		}
		return null;
	}

	function addFiles(files: Array<{ file: File; relativePath: string }>) {
		const skipped: string[] = [];
		const newRows: Row[] = [];

		for (const { file, relativePath } of files) {
			const error = validateFile(file);
			if (error) {
				skipped.push(`${file.name}: ${error}`);
				continue;
			}
			// Deduplicate by name + size against existing rows
			const isDup = rows.some((r) => r.file.name === file.name && r.file.size === file.size);
			if (isDup) continue;

			newRows.push({
				id: `row-${nextRowId++}`,
				file,
				relativePath,
				title: titleFromFilename(file.name),
				artist: bulkArtist,
				category: bulkCategory === '__new' ? bulkNewCategory : bulkCategory,
				book: bulkBook,
				bookFullName: bulkBookFullName,
				number: null,
				progress: 0,
				status: 'pending',
				error: '',
				duplicateWarning: ''
			});
		}

		if (newRows.length > 0) {
			rows = [...rows, ...newRows];
			toast.success(`${newRows.length} fichier${newRows.length > 1 ? 's' : ''} ajouté${newRows.length > 1 ? 's' : ''}`);
		}
		if (skipped.length > 0) {
			toast.error(`${skipped.length} fichier(s) ignoré(s): ${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? '…' : ''}`);
		}
	}

	async function readEntriesAsync(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
		return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
	}

	async function traverseEntry(entry: FileSystemEntry, basePath: string, out: Array<{ file: File; relativePath: string }>): Promise<void> {
		if (entry.isFile) {
			const fileEntry = entry as FileSystemFileEntry;
			await new Promise<void>((resolve, reject) => {
				fileEntry.file((f) => {
					out.push({ file: f, relativePath: `${basePath}${f.name}` });
					resolve();
				}, reject);
			});
		} else if (entry.isDirectory) {
			const dirEntry = entry as FileSystemDirectoryEntry;
			const reader = dirEntry.createReader();
			let batch: FileSystemEntry[];
			do {
				batch = await readEntriesAsync(reader);
				for (const child of batch) {
					await traverseEntry(child, `${basePath}${entry.name}/`, out);
				}
			} while (batch.length > 0);
		}
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragover = false;
		const items = e.dataTransfer?.items;
		if (!items) return;

		const collected: Array<{ file: File; relativePath: string }> = [];
		const entries: FileSystemEntry[] = [];
		for (let i = 0; i < items.length; i++) {
			const entry = items[i].webkitGetAsEntry?.();
			if (entry) entries.push(entry);
		}

		if (entries.length > 0) {
			for (const entry of entries) {
				await traverseEntry(entry, '', collected);
			}
		} else if (e.dataTransfer?.files) {
			// Fallback: plain files without directory support
			for (const file of Array.from(e.dataTransfer.files)) {
				collected.push({ file, relativePath: file.name });
			}
		}

		addFiles(collected);
	}

	function handleFileInput(e: Event) {
		const target = e.target as HTMLInputElement;
		if (!target.files) return;
		const collected = Array.from(target.files).map((file) => ({
			file,
			// webkitRelativePath is set when webkitdirectory is used
			relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
		}));
		addFiles(collected);
		target.value = '';
	}

	function removeRow(id: string) {
		rows = rows.filter((r) => r.id !== id);
	}

	function clearAll() {
		if (processing) return;
		rows = [];
	}

	function applyToAll() {
		const cat = bulkCategory === '__new' ? bulkNewCategory.trim() : bulkCategory;
		rows = rows.map((r) => ({
			...r,
			category: cat || r.category,
			artist: bulkArtist || r.artist,
			book: bulkBook || r.book,
			bookFullName: bulkBookFullName || r.bookFullName
		}));
		if (cat && !categories.includes(cat)) {
			categories = [...categories, cat];
		}
		toast.success('Valeurs appliquées à toutes les lignes');
	}

	function updateRow(id: string, patch: Partial<Row>) {
		rows = rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
	}

	async function extractDuration(file: File): Promise<number | null> {
		try {
			const audioEl = new Audio();
			audioEl.preload = 'metadata';
			const objectUrl = URL.createObjectURL(file);
			const duration = await new Promise<number | null>((resolve) => {
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
			return duration;
		} catch {
			return null;
		}
	}

	async function uploadRow(row: Row): Promise<void> {
		updateRow(row.id, { status: 'uploading', progress: 0, error: '' });

		const ext = extOf(row.file.name);
		const contentType = row.file.type || CONTENT_TYPE_BY_EXT[ext] || 'audio/mpeg';

		// 1. Presigned URL
		const urlRes = await fetch('/api/audio/upload-url', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				fileName: row.file.name,
				contentType,
				category: row.category
			})
		});
		const urlData = await urlRes.json();
		if (urlData.error) throw new Error(urlData.error);

		const { uploadUrl, s3Key, s3Url } = urlData.data;

		// 2. S3 PUT with progress
		await new Promise<void>((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.upload.addEventListener('progress', (e) => {
				if (e.lengthComputable) {
					updateRow(row.id, { progress: Math.round((e.loaded / e.total) * 100) });
				}
			});
			xhr.addEventListener('load', () => {
				if (xhr.status >= 200 && xhr.status < 300) resolve();
				else reject(new Error(`Upload S3 a échoué (${xhr.status})`));
			});
			xhr.addEventListener('error', () => reject(new Error('Erreur réseau durant l\'upload')));
			xhr.open('PUT', uploadUrl);
			xhr.setRequestHeader('Content-Type', contentType);
			xhr.send(row.file);
		});

		// 3. Save record
		updateRow(row.id, { status: 'saving', progress: 100 });
		const duration = await extractDuration(row.file);
		const format = ext || 'mp3';

		const res = await fetch('/api/audio/complete-upload', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				title: row.title || row.file.name,
				artist: row.artist || null,
				category: row.category,
				book: row.book || null,
				book_full_name: row.bookFullName || null,
				number: row.number,
				s3_key: s3Key,
				s3_url: s3Url,
				file_size: row.file.size,
				duration,
				format
			})
		});
		const result = await res.json();
		if (result.error) throw new Error(result.error);

		updateRow(row.id, {
			status: 'done',
			duplicateWarning: result.data.duplicateWarning || ''
		});
	}

	async function startBulkUpload() {
		if (!allReady || processing) return;

		// Validate everything has title + category
		const invalid = rows.filter((r) => !r.title || !r.category);
		if (invalid.length > 0) {
			toast.error(`${invalid.length} ligne(s) sans titre ou catégorie`);
			return;
		}

		processing = true;
		const toProcess = rows.filter((r) => r.status === 'pending' || r.status === 'error');

		// Upload with limited concurrency
		const CONCURRENCY = 3;
		let cursor = 0;
		async function worker() {
			while (cursor < toProcess.length) {
				const idx = cursor++;
				const row = toProcess[idx];
				try {
					await uploadRow(row);
				} catch (err) {
					updateRow(row.id, {
						status: 'error',
						error: err instanceof Error ? err.message : 'Erreur inconnue'
					});
				}
			}
		}
		await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toProcess.length) }, worker));

		processing = false;

		const finalDone = rows.filter((r) => r.status === 'done').length;
		const finalErr = rows.filter((r) => r.status === 'error').length;
		if (finalErr === 0) {
			toast.success(`${finalDone} audio${finalDone > 1 ? 's' : ''} importé${finalDone > 1 ? 's' : ''} avec succès`);
			setTimeout(() => goto('/audio'), 1000);
		} else {
			toast.error(`${finalErr} erreur(s), ${finalDone} réussi(s)`);
		}
	}

	function statusLabel(status: RowStatus): string {
		switch (status) {
			case 'pending':
				return 'En attente';
			case 'uploading':
				return 'Import…';
			case 'saving':
				return 'Enregistrement…';
			case 'done':
				return 'Terminé';
			case 'error':
				return 'Erreur';
			case 'skipped':
				return 'Ignoré';
		}
	}
</script>

<svelte:head>
	<title>Importer en lot - Missionnaire Admin</title>
</svelte:head>

<!-- Header -->
<div class="mb-8">
	<a href="/audio" class="mb-4 inline-flex items-center gap-1 text-sm text-stone-500 transition-colors hover:text-primary">
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
		</svg>
		Bibliothèque
	</a>
	<h1 class="font-display text-3xl font-semibold text-stone-800">Importer en lot</h1>
	<p class="mt-1 text-sm text-stone-500">Déposez plusieurs fichiers ou un dossier entier. Vérifiez les métadonnées avant de confirmer l'import.</p>
</div>

<!-- Drop zone -->
<div class="mb-6">
	<div
		role="region"
		aria-label="Zone de dépôt des fichiers audio"
		class="relative w-full rounded-none border-2 border-dashed transition-all duration-200
		{dragover ? 'border-primary bg-missionnaire-50/50' : 'border-stone-200 bg-white/40'}"
		ondragover={(e) => { e.preventDefault(); dragover = true; }}
		ondragleave={() => (dragover = false)}
		ondrop={handleDrop}
	>
		<input
			bind:this={fileInputEl}
			type="file"
			multiple
			accept=".mp3,.wav,.flac,.ogg,.m4a,.aac"
			class="hidden"
			onchange={handleFileInput}
		/>
		<input
			bind:this={folderInputEl}
			type="file"
			multiple
			class="hidden"
			onchange={handleFileInput}
		/>

		<div class="flex flex-col items-center justify-center px-6 py-10">
			<div class="mb-3 flex h-14 w-14 items-center justify-center rounded-full {dragover ? 'bg-missionnaire-100' : 'bg-cream-dark'}">
				<svg class="h-7 w-7 {dragover ? 'text-primary' : 'text-stone-400'}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3 7l2-2h4l2 2h10a2 2 0 012 2v9a2 2 0 01-2 2H3a2 2 0 01-2-2V9a2 2 0 012-2z" />
				</svg>
			</div>
			<p class="text-sm font-medium text-stone-600">Glissez plusieurs fichiers audio ou un dossier ici</p>
			<p class="mt-1 text-xs text-stone-400">MP3, WAV, FLAC, OGG, M4A, AAC &middot; Max 500 MB par fichier</p>
			<div class="mt-5 flex flex-wrap justify-center gap-3">
				<button type="button" class="admin-btn-secondary" onclick={() => fileInputEl?.click()}>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
					</svg>
					Choisir des fichiers
				</button>
				<button type="button" class="admin-btn-primary" onclick={() => folderInputEl?.click()}>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M3 7l2-2h4l2 2h10a2 2 0 012 2v9a2 2 0 01-2 2H3a2 2 0 01-2-2V9a2 2 0 012-2z" />
					</svg>
					Choisir un dossier
				</button>
			</div>
		</div>
	</div>
</div>

{#if rows.length > 0}
	<!-- Bulk controls -->
	<div class="mb-6 border border-stone-200/60 bg-white/40 p-5">
		<h2 class="mb-4 font-display text-base font-semibold text-stone-700">Appliquer à toutes les lignes</h2>
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<div>
				<label for="bulk-category" class="admin-label">Catégorie</label>
				<select id="bulk-category" class="admin-input" bind:value={bulkCategory}>
					<option value="">—</option>
					{#each categories as cat}
						<option value={cat}>{cat}</option>
					{/each}
					<option value="__new">+ Nouvelle catégorie</option>
				</select>
				{#if bulkCategory === '__new'}
					<input type="text" class="admin-input mt-2" placeholder="Nom de la catégorie" bind:value={bulkNewCategory} />
				{/if}
			</div>
			<div>
				<label for="bulk-artist" class="admin-label">Artiste</label>
				<input id="bulk-artist" type="text" class="admin-input" bind:value={bulkArtist} list="bulk-artist-list" placeholder="Artiste" />
				<datalist id="bulk-artist-list">
					{#each data.artists as a}
						<option value={a}></option>
					{/each}
				</datalist>
			</div>
			<div>
				<label for="bulk-book" class="admin-label">Livre (abrégé)</label>
				<input id="bulk-book" type="text" class="admin-input" bind:value={bulkBook} placeholder="Ex: CAN" />
			</div>
			<div>
				<label for="bulk-book-full" class="admin-label">Livre (nom complet)</label>
				<input id="bulk-book-full" type="text" class="admin-input" bind:value={bulkBookFullName} placeholder="Ex: Cantiques" />
			</div>
		</div>
		<div class="mt-4 flex justify-end">
			<button type="button" onclick={applyToAll} class="admin-btn-secondary text-sm" disabled={processing}>
				Appliquer à toutes les lignes
			</button>
		</div>
	</div>

	<!-- Preview table -->
	<div class="mb-6 border border-stone-200/60 bg-white/40">
		<div class="flex items-center justify-between border-b border-stone-100 px-5 py-3">
			<div class="text-sm text-stone-600">
				<span class="font-semibold text-stone-800">{totalFiles}</span> fichier{totalFiles > 1 ? 's' : ''} détecté{totalFiles > 1 ? 's' : ''}
				{#if readyCount < totalFiles}
					&middot; <span class="text-amber-600">{totalFiles - readyCount} sans titre ou catégorie</span>
				{/if}
				{#if doneCount > 0}
					&middot; <span class="text-green-600">{doneCount} importé{doneCount > 1 ? 's' : ''}</span>
				{/if}
				{#if errorCount > 0}
					&middot; <span class="text-red-600">{errorCount} erreur{errorCount > 1 ? 's' : ''}</span>
				{/if}
			</div>
			<button type="button" onclick={clearAll} class="text-xs text-stone-500 hover:text-red-600 disabled:opacity-50" disabled={processing}>
				Tout effacer
			</button>
		</div>
		<div class="overflow-x-auto">
			<table class="w-full text-left text-sm">
				<thead>
					<tr class="border-b border-stone-100 bg-cream/50 text-xs uppercase tracking-wide text-stone-500">
						<th class="px-3 py-2">Fichier</th>
						<th class="px-3 py-2">Titre *</th>
						<th class="px-3 py-2">Artiste</th>
						<th class="px-3 py-2">Catégorie *</th>
						<th class="px-3 py-2">N°</th>
						<th class="px-3 py-2">Statut</th>
						<th class="px-3 py-2"></th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row (row.id)}
						<tr class="border-b border-stone-100 last:border-b-0 {row.status === 'error' ? 'bg-red-50/40' : row.status === 'done' ? 'bg-green-50/40' : ''}">
							<td class="px-3 py-2 align-top">
								<div class="max-w-[220px] truncate text-xs font-medium text-stone-700" title={row.relativePath}>
									{row.file.name}
								</div>
								<div class="text-[11px] text-stone-400">
									{formatBytes(row.file.size)}
									{#if row.relativePath !== row.file.name}
										&middot; {row.relativePath.split('/').slice(0, -1).join('/')}
									{/if}
								</div>
							</td>
							<td class="px-3 py-2 align-top">
								<input
									type="text"
									class="admin-input !py-1 !text-xs"
									value={row.title}
									oninput={(e) => updateRow(row.id, { title: e.currentTarget.value })}
									disabled={row.status === 'uploading' || row.status === 'saving' || row.status === 'done'}
								/>
							</td>
							<td class="px-3 py-2 align-top">
								<input
									type="text"
									class="admin-input !py-1 !text-xs"
									value={row.artist}
									oninput={(e) => updateRow(row.id, { artist: e.currentTarget.value })}
									list="bulk-artist-list"
									disabled={row.status === 'uploading' || row.status === 'saving' || row.status === 'done'}
								/>
							</td>
							<td class="px-3 py-2 align-top">
								<select
									class="admin-input !py-1 !text-xs"
									value={row.category}
									onchange={(e) => updateRow(row.id, { category: e.currentTarget.value })}
									disabled={row.status === 'uploading' || row.status === 'saving' || row.status === 'done'}
								>
									<option value="">—</option>
									{#each categories as cat}
										<option value={cat}>{cat}</option>
									{/each}
									{#if row.category && !categories.includes(row.category)}
										<option value={row.category}>{row.category}</option>
									{/if}
								</select>
							</td>
							<td class="px-3 py-2 align-top">
								<input
									type="number"
									class="admin-input !w-16 !py-1 !text-xs"
									value={row.number ?? ''}
									oninput={(e) => {
										const v = e.currentTarget.value;
										updateRow(row.id, { number: v ? Number.parseInt(v) : null });
									}}
									disabled={row.status === 'uploading' || row.status === 'saving' || row.status === 'done'}
								/>
							</td>
							<td class="px-3 py-2 align-top">
								<div class="flex flex-col gap-1">
									<span class="text-xs font-medium
										{row.status === 'done' ? 'text-green-700' :
										 row.status === 'error' ? 'text-red-700' :
										 row.status === 'uploading' || row.status === 'saving' ? 'text-primary' :
										 'text-stone-500'}">
										{statusLabel(row.status)}
									</span>
									{#if row.status === 'uploading'}
										<div class="h-1.5 w-24 overflow-hidden rounded-full bg-cream-dark">
											<div class="h-full bg-primary transition-all" style="width: {row.progress}%"></div>
										</div>
										<span class="text-[10px] text-stone-400">{row.progress}%</span>
									{/if}
									{#if row.error}
										<span class="max-w-[160px] text-[11px] text-red-600" title={row.error}>{row.error}</span>
									{/if}
									{#if row.duplicateWarning}
										<span class="text-[11px] text-amber-600" title={row.duplicateWarning}>Doublon possible</span>
									{/if}
								</div>
							</td>
							<td class="px-3 py-2 align-top">
								<button
									type="button"
									onclick={() => removeRow(row.id)}
									disabled={row.status === 'uploading' || row.status === 'saving'}
									class="text-xs text-stone-400 hover:text-red-600 disabled:opacity-30"
									title="Retirer"
								>
									<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Action bar -->
	<div class="sticky bottom-4 z-10 flex items-center justify-between border border-stone-200/60 bg-white/90 px-5 py-3 shadow-sm backdrop-blur">
		<div class="text-sm text-stone-600">
			{#if !allReady}
				<span class="text-amber-600">
					{totalFiles - readyCount} ligne{totalFiles - readyCount > 1 ? 's' : ''} à compléter (titre + catégorie requis)
				</span>
			{:else if processing}
				<span class="text-primary">Import en cours…</span>
			{:else if doneCount === totalFiles}
				<span class="text-green-700">Tous les fichiers ont été importés</span>
			{:else}
				<span>Prêt à importer {hasPending ? rows.filter((r) => r.status === 'pending' || r.status === 'error').length : 0} fichier(s)</span>
			{/if}
		</div>
		<button
			type="button"
			onclick={startBulkUpload}
			disabled={!allReady || processing || !hasPending}
			class="admin-btn-primary disabled:opacity-50"
		>
			{#if processing}
				<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
				</svg>
				Import en cours…
			{:else}
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
				Confirmer et tout importer
			{/if}
		</button>
	</div>
{/if}
