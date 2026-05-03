<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from '$lib/stores/toast';
	import FileDropZone from '$lib/components/FileDropZone.svelte';
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
			toast.success('Fichier importé sur le serveur');
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erreur lors de l'import");
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
						title: title || file.name
					})
				});
				const lyricsResult = await lyricsRes.json();
				if (lyricsResult.error) {
					toast.error(lyricsResult.error);
				} else {
					toast.success('Audio et paroles enregistrés avec succès');
				}
			} else {
				toast.success('Audio enregistré avec succès');
			}

			goto(`/audio/${audioId}`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Erreur lors de l'enregistrement");
		} finally {
			saving = false;
		}
	}

	const canUpload = $derived(!!file && !!category && !uploading && !uploaded);
	const canSave = $derived(uploaded && !!title && !!category && !saving);
</script>

<svelte:head>
	<title>Importer un audio - Missionnaire Admin</title>
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
		Bibliothèque
	</a>
	<div class="flex items-end justify-between gap-4">
		<h1 class="font-display text-3xl font-semibold text-stone-800">Importer un audio</h1>
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
			Plusieurs fichiers ? Importer en lot
		</a>
	</div>
</div>

<div class="mx-auto max-w-2xl">
	<!-- Step 1: File selection -->
	<div class="mb-8">
		<h2 class="mb-3 font-display text-lg font-semibold text-stone-700">1. Fichier audio</h2>
		<FileDropZone onfileselected={onFileSelected} />
	</div>

	<!-- Step 2: Metadata -->
	<div class="mb-8 border border-stone-200/60 bg-white/40 p-6">
		<h2 class="mb-5 font-display text-lg font-semibold text-stone-700">2. Métadonnées</h2>

		<div class="grid gap-5 sm:grid-cols-2">
			<div class="sm:col-span-2">
				<label for="title" class="admin-label">Titre *</label>
				<input
					id="title"
					type="text"
					class="admin-input"
					bind:value={title}
					placeholder="Titre du cantique"
				/>
			</div>

			<div>
				<label for="artist" class="admin-label">Artiste</label>
				<input
					id="artist"
					type="text"
					class="admin-input"
					bind:value={artist}
					list="artist-list"
					placeholder="Nom de l'artiste"
				/>
				<datalist id="artist-list">
					{#each data.artists as a}
						<option value={a}></option>
					{/each}
				</datalist>
			</div>

			<div>
				<label for="category" class="admin-label">Catégorie *</label>
				<select id="category" class="admin-input" bind:value={category}>
					<option value="">Sélectionner...</option>
					{#each data.categories as cat}
						<option value={cat}>{cat}</option>
					{/each}
					<option value="__new">+ Nouvelle catégorie</option>
				</select>
				{#if category === '__new'}
					<input
						type="text"
						class="admin-input mt-2"
						placeholder="Nom de la catégorie"
						onchange={(e) => (category = e.currentTarget.value)}
					/>
				{/if}
			</div>

			<div>
				<label for="book" class="admin-label">Livre (abrégé)</label>
				<input id="book" type="text" class="admin-input" bind:value={book} placeholder="Ex: CAN" />
			</div>

			<div>
				<label for="bookFullName" class="admin-label">Livre (nom complet)</label>
				<input
					id="bookFullName"
					type="text"
					class="admin-input"
					bind:value={bookFullName}
					placeholder="Ex: Cantiques"
				/>
			</div>

			<div>
				<label for="number" class="admin-label">Numéro</label>
				<input
					id="number"
					type="number"
					class="admin-input"
					value={number ?? ''}
					oninput={(e) => {
						const v = e.currentTarget.value;
						number = v ? Number.parseInt(v) : null;
					}}
					placeholder="N°"
				/>
			</div>
		</div>
	</div>

	<!-- Step 3: Optional lyrics -->
	<div class="mb-8 border border-stone-200/60 bg-white/40 p-6">
		<h2 class="mb-3 font-display text-lg font-semibold text-stone-700">
			3. Paroles <span class="text-sm font-normal text-stone-400">(optionnel)</span>
		</h2>
		<label for="lyricsText" class="admin-label">Texte des paroles</label>
		<textarea
			id="lyricsText"
			class="admin-input min-h-64 resize-y leading-7"
			bind:value={lyricsText}
			placeholder="Collez les paroles ici si vous les avez déjà..."
		></textarea>
		<p class="mt-2 text-xs text-stone-500">
			Vous pourrez aussi ajouter ou corriger les paroles après l'import depuis la fiche audio.
		</p>
	</div>

	<!-- Step 4: Upload & Save -->
	<div class="mb-8 border border-stone-200/60 bg-white/40 p-6">
		<h2 class="mb-5 font-display text-lg font-semibold text-stone-700">4. Import</h2>

		{#if !uploaded}
			<!-- Upload progress -->
			{#if uploading}
				<div class="mb-4">
					<div class="mb-2 flex justify-between text-sm">
						<span class="text-stone-600">Import en cours...</span>
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
					Import en cours...
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
					Importer le fichier sur le serveur
				{/if}
			</button>

			{#if !file}
				<p class="mt-2 text-center text-xs text-stone-400">
					Sélectionnez un fichier et une catégorie d'abord
				</p>
			{/if}
		{:else}
			<!-- Save record -->
			<div class="mb-4 border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
				Fichier importé avec succès. Enregistrez les métadonnées pour finaliser.
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
					Enregistrement...
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
					Enregistrer l'audio
				{/if}
			</button>
		{/if}
	</div>
</div>
