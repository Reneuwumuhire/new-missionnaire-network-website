<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from '$lib/stores/toast';
	import AudioPreviewPlayer from '$lib/components/AudioPreviewPlayer.svelte';
	import type { PageData } from './$types';

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

	let saving = $state(false);
	let confirmDelete = $state(false);
	let deleting = $state(false);

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	function formatDuration(seconds: number | null | undefined): string {
		if (!seconds) return 'Inconnue';
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

	async function saveChanges() {
		if (!data.canEdit) return;
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
			if (result.error) throw new Error(result.error);

			toast.success('Modifications enregistrées');
			await invalidateAll();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde');
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

			toast.success('Audio supprimé');
			goto('/audio');
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Erreur lors de la suppression');
		} finally {
			deleting = false;
		}
	}
</script>

<svelte:head>
	<title>{data.audio.title || 'Éditer'} - Missionnaire Admin</title>
</svelte:head>

<!-- Header -->
<div class="mb-8">
	<a href="/audio" class="mb-4 inline-flex items-center gap-1 text-sm text-stone-500 transition-colors hover:text-primary">
		<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
		</svg>
		Bibliothèque
	</a>
	<h1 class="font-display text-3xl font-semibold text-stone-800">
		{data.canEdit ? "Éditer l'audio" : "Détail de l'audio"}
	</h1>
</div>

<div class="mx-auto grid max-w-4xl gap-6 lg:grid-cols-3">
	<!-- Main form (2 cols) -->
	<div class="lg:col-span-2">
		<div class="border border-stone-200/60 bg-white/40 p-6">
			<h2 class="mb-5 font-display text-lg font-semibold text-stone-700">Métadonnées</h2>

			<div class="grid gap-5 sm:grid-cols-2">
				<div class="sm:col-span-2">
					<label for="title" class="admin-label">Titre</label>
					<input id="title" type="text" class="admin-input" bind:value={title} disabled={!data.canEdit} />
				</div>

				<div>
					<label for="artist" class="admin-label">Artiste</label>
					<input id="artist" type="text" class="admin-input" bind:value={artist} list="artist-list" disabled={!data.canEdit} />
					<datalist id="artist-list">
						{#each data.artists as a}
							<option value={a}></option>
						{/each}
					</datalist>
				</div>

				<div>
					<label for="category" class="admin-label">Catégorie</label>
					<select id="category" class="admin-input" bind:value={category} disabled={!data.canEdit}>
						{#each data.categories as cat}
							<option value={cat}>{cat}</option>
						{/each}
					</select>
				</div>

				<div>
					<label for="book" class="admin-label">Livre (abrégé)</label>
					<input id="book" type="text" class="admin-input" bind:value={book} disabled={!data.canEdit} />
				</div>

				<div>
					<label for="bookFullName" class="admin-label">Livre (nom complet)</label>
					<input id="bookFullName" type="text" class="admin-input" bind:value={bookFullName} disabled={!data.canEdit} />
				</div>

				<div>
					<label for="number" class="admin-label">Numéro</label>
					<input
						id="number"
						type="number"
						class="admin-input"
						value={number ?? ''}
						disabled={!data.canEdit}
						oninput={(e) => {
							const v = e.currentTarget.value;
							number = v ? Number.parseInt(v) : null;
						}}
					/>
				</div>
			</div>

			<div class="mt-6 flex items-center gap-3">
				{#if data.canEdit}
					<button onclick={saveChanges} disabled={saving} class="admin-btn-primary disabled:opacity-50">
						{#if saving}
							<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
							</svg>
						{/if}
						Enregistrer
					</button>
				{/if}
				<a href="/audio" class="admin-btn-secondary">Annuler</a>
			</div>
		</div>
	</div>

	<!-- Sidebar info (1 col) -->
	<div class="space-y-6">
		<!-- Audio preview -->
		<div class="border border-stone-200/60 bg-white/40 p-6">
			<h3 class="mb-4 text-sm font-medium text-stone-500 uppercase tracking-wider">Aperçu</h3>
			<div class="mb-4">
				<AudioPreviewPlayer src={data.audio.s3_url} />
			</div>
			<div class="ornament-line my-4">
				<span class="text-xs text-earth/40">&#8226;</span>
			</div>
			<dl class="space-y-3 text-sm">
				<div>
					<dt class="text-stone-400">Format</dt>
					<dd class="font-medium text-stone-700">{data.audio.format.toUpperCase()}</dd>
				</div>
				<div>
					<dt class="text-stone-400">Taille</dt>
					<dd class="font-medium text-stone-700">{formatBytes(data.audio.file_size)}</dd>
				</div>
				<div>
					<dt class="text-stone-400">Durée</dt>
					<dd class="font-medium text-stone-700">{formatDuration(data.audio.duration)}</dd>
				</div>
				<div>
					<dt class="text-stone-400">Clé S3</dt>
					<dd class="break-all font-mono text-xs text-stone-500">{data.audio.s3_key}</dd>
				</div>
				<div>
					<dt class="text-stone-400">Importé le</dt>
					<dd class="font-medium text-stone-700">{formatDate(data.audio.uploaded_at)}</dd>
				</div>
				{#if data.audio.updated_at}
					<div>
						<dt class="text-stone-400">Modifié le</dt>
						<dd class="font-medium text-stone-700">{formatDate(data.audio.updated_at)}</dd>
					</div>
				{/if}
				{#if data.audio.updated_by}
					<div>
						<dt class="text-stone-400">Modifié par</dt>
						<dd class="font-medium text-stone-700">{data.audio.updated_by}</dd>
					</div>
				{/if}
			</dl>
		</div>

		{#if data.canDelete}
			<!-- Danger zone -->
			<div class="border border-red-200/60 bg-white/40 p-6">
				<h3 class="mb-3 text-sm font-medium text-red-600 uppercase tracking-wider">Zone dangereuse</h3>
				<p class="mb-4 text-sm text-stone-500">
					Supprimer cet audio définitivement. Le fichier sera retiré du serveur et de la base de données.
				</p>
				{#if confirmDelete}
					<div class="flex items-center gap-2">
						<button onclick={deleteAudio} disabled={deleting} class="admin-btn-danger text-xs">
							{deleting ? 'Suppression...' : 'Confirmer la suppression'}
						</button>
						<button onclick={() => (confirmDelete = false)} class="text-xs text-stone-500 hover:text-stone-700">
							Annuler
						</button>
					</div>
				{:else}
					<button onclick={() => (confirmDelete = true)} class="admin-btn-danger w-full justify-center">
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
						</svg>
						Supprimer cet audio
					</button>
				{/if}
			</div>
		{/if}
	</div>
</div>
