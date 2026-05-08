<script lang="ts">
	import SearchFilterBar from '$lib/components/SearchFilterBar.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import AudioPreviewPlayer from '$lib/components/AudioPreviewPlayer.svelte';
	import BulkActionBar from '$lib/components/BulkActionBar.svelte';
	import { selection } from '$lib/stores/selection';
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const perms = $derived($page.data.user?.permissions ?? { can_add: false, can_edit: false, can_delete: false });
	const canSelectAudio = $derived(perms.can_edit || perms.can_delete);

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
	}

	function formatDuration(seconds: number | null | undefined): string {
		if (!seconds) return '—';
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	function formatDate(date: string | Date): string {
		return new Date(date).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	const allIds = $derived(data.audioList.map((a) => a._id).filter((id): id is string => !!id));
	const allSelected = $derived($selection.size > 0 && allIds.every((id) => $selection.has(id)));
	const filterQuery = $derived($page.url.search);

	function toggleAll() {
		if (!canSelectAudio) return;
		if (allSelected) {
			selection.clear();
		} else {
			selection.selectAll(allIds);
		}
	}
</script>

<svelte:head>
	<title>Bibliothèque audio - Missionnaire Admin</title>
</svelte:head>

<!-- Header -->
<div class="mb-6 flex items-end justify-between">
	<div>
		<h1 class="font-display text-3xl font-semibold text-stone-800">Bibliothèque audio</h1>
		<p class="mt-1 text-sm text-stone-500">{data.total} piste{data.total !== 1 ? 's' : ''} au total</p>
	</div>
	{#if perms.can_add}
	<div class="flex gap-2">
		<a href="/audio/bulk-new" class="admin-btn-secondary">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M3 7l2-2h4l2 2h10a2 2 0 012 2v9a2 2 0 01-2 2H3a2 2 0 01-2-2V9a2 2 0 012-2z" />
			</svg>
			Importer en lot
		</a>
		<a href="/audio/new" class="admin-btn-primary">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
			</svg>
			Importer
		</a>
	</div>
	{/if}
</div>

<!-- Filters -->
<div class="mb-6">
	<SearchFilterBar categories={data.categories} artists={data.artists} />
</div>

<!-- Table -->
<div class="overflow-hidden border border-stone-200/60 bg-white/40">
	<div class="overflow-x-auto">
		<table class="w-full text-left text-sm">
			<thead>
				<tr class="border-b border-stone-100 bg-cream/50">
					{#if canSelectAudio}
						<th class="w-10 px-4 py-3">
							<input
								type="checkbox"
								checked={allSelected}
								onchange={toggleAll}
								class="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary/30"
							/>
						</th>
					{/if}
					<th class="w-10 px-2 py-3"></th>
					<th class="px-4 py-3 font-medium text-stone-500">Titre</th>
					<th class="px-4 py-3 font-medium text-stone-500">Artiste</th>
					<th class="px-4 py-3 font-medium text-stone-500">Catégorie</th>
					<th class="px-4 py-3 font-medium text-stone-500">Durée</th>
					<th class="px-4 py-3 font-medium text-stone-500">Taille</th>
					<th class="px-4 py-3 font-medium text-stone-500">Date</th>
				</tr>
			</thead>
			<tbody>
				{#each data.audioList as audio}
					{@const id = audio._id ?? ''}
					<tr class="border-b border-stone-50 transition-colors hover:bg-cream/40">
						{#if canSelectAudio}
							<td class="px-4 py-3">
								<input
									type="checkbox"
									checked={$selection.has(id)}
									onchange={() => selection.toggle(id)}
									class="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary/30"
								/>
							</td>
						{/if}
						<td class="px-2 py-3">
							<AudioPreviewPlayer src={audio.s3_url} />
						</td>
						<td class="max-w-[240px] px-4 py-3">
							{#if canSelectAudio}
								<a
									href="/audio/{id}{filterQuery}"
									class="block truncate font-medium text-stone-700 hover:text-primary"
								>
									{audio.title || 'Sans titre'}
								</a>
							{:else}
								<span class="block truncate font-medium text-stone-700">{audio.title || 'Sans titre'}</span>
							{/if}
							{#if audio.book}
								<span class="text-xs text-stone-400">{audio.book_full_name || audio.book}</span>
							{/if}
						</td>
						<td class="px-4 py-3 text-stone-600">{audio.artist || '—'}</td>
						<td class="px-4 py-3">
							<span class="inline-flex rounded-full bg-missionnaire-50 px-2.5 py-0.5 text-xs font-medium text-missionnaire-700">
								{audio.category}
							</span>
						</td>
						<td class="px-4 py-3 tabular-nums text-stone-500">{formatDuration(audio.duration)}</td>
						<td class="px-4 py-3 tabular-nums text-stone-500">{formatBytes(audio.file_size)}</td>
						<td class="px-4 py-3 text-stone-400">{formatDate(audio.uploaded_at)}</td>
					</tr>
				{/each}
				{#if data.audioList.length === 0}
					<tr>
						<td colspan={canSelectAudio ? 8 : 7} class="px-4 py-12 text-center text-stone-400">
							Aucun audio trouvé
						</td>
					</tr>
				{/if}
			</tbody>
		</table>
	</div>
</div>

<!-- Pagination -->
<div class="mt-4">
	<Pagination total={data.total} limit={data.pagination.limit} currentPage={data.pagination.pageNumber} />
</div>

<!-- Bulk actions -->
{#if perms.can_delete || perms.can_edit}
<BulkActionBar categories={data.categories} canDelete={perms.can_delete} canEdit={perms.can_edit} />
{/if}
