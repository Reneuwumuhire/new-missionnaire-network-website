<script lang="ts">
	import { onDestroy } from 'svelte';
	import SearchFilterBar from '$lib/components/SearchFilterBar.svelte';
	import Pagination from '$lib/components/Pagination.svelte';
	import AudioPreviewPlayer from '$lib/components/AudioPreviewPlayer.svelte';
	import BulkActionBar from '$lib/components/BulkActionBar.svelte';
	import SkeletonRows from '$lib/components/SkeletonRows.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { selection } from '$lib/stores/selection';
	import { audioPreview } from '$lib/stores/audio-preview';
	import { page } from '$app/stores';
	import { invalidateAll } from '$app/navigation';
	import { t } from '$lib/i18n';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const perms = $derived($page.data.user?.permissions ?? { can_add: false, can_edit: false, can_delete: false });
	const canSelectAudio = $derived(perms.can_edit || perms.can_delete);

	// ── Streamed list: resolve into local state with a loaded flag ────
	// data.listPromise is streamed from the server load, so the page (header,
	// filter bar) renders instantly with skeleton rows until it settles. The
	// effect re-runs on every navigation/filter change (new promise).
	type AudioList = Awaited<PageData['listPromise']>['data'];
	let audioList = $state<AudioList>([]);
	let total = $state(0);
	let listLoaded = $state(false);
	let listError = $state(false);

	$effect(() => {
		const promise = data.listPromise;
		listLoaded = false;
		listError = false;
		promise.then(
			(result) => {
				if (promise !== data.listPromise) return; // stale navigation
				audioList = result.data;
				total = result.total;
				listLoaded = true;
			},
			() => {
				if (promise !== data.listPromise) return;
				listError = true;
				listLoaded = true;
			}
		);
	});

	// Stop the shared inline preview when leaving the page.
	onDestroy(() => audioPreview.stop());

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

	const allIds = $derived(audioList.map((a) => a._id).filter((id): id is string => !!id));
	const allSelected = $derived($selection.size > 0 && allIds.every((id) => $selection.has(id)));
	const filterQuery = $derived($page.url.search);
	const hasFilters = $derived(
		Boolean(data.filters.search || data.filters.category || data.filters.artist || data.filters.lyrics)
	);
	const columnCount = $derived(canSelectAudio ? 8 : 7);

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
	<title>{$t('audio.pageTitle')}</title>
</svelte:head>

<!-- Header -->
<div class="mb-6 flex items-end justify-between">
	<div>
		<h1 class="font-display text-3xl font-semibold text-stone-800">{$t('audio.title')}</h1>
		{#if listLoaded && !listError}
			<p class="mt-1 text-sm text-stone-500">{$t(total !== 1 ? 'audio.totalCountMany' : 'audio.totalCountOne', { count: total })}</p>
		{:else}
			<div class="mt-2 h-3.5 w-32 animate-pulse rounded-full bg-stone-200" aria-hidden="true"></div>
		{/if}
	</div>
	{#if perms.can_add}
	<div class="flex gap-2">
		<a href="/audio/bulk-new" class="admin-btn-secondary">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M3 7l2-2h4l2 2h10a2 2 0 012 2v9a2 2 0 01-2 2H3a2 2 0 01-2-2V9a2 2 0 012-2z" />
			</svg>
			{$t('common.bulkImport')}
		</a>
		<a href="/audio/new" class="admin-btn-primary">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
			</svg>
			{$t('audio.import')}
		</a>
	</div>
	{/if}
</div>

<!-- Filters -->
<div class="mb-6">
	<SearchFilterBar categories={data.categories} artists={data.artists} />
</div>

{#if listLoaded && listError}
	<div class="border border-red-200 bg-red-50/80 p-8 text-center">
		<p class="text-sm text-red-700">{$t('common.loadError')}</p>
		<button class="admin-btn-secondary admin-btn-compact mt-4" onclick={() => invalidateAll()}>
			{$t('errors.retry')}
		</button>
	</div>
{:else if listLoaded && audioList.length === 0}
	<EmptyState
		icon="music"
		message={$t('audio.noResults')}
		actionLabel={hasFilters ? $t('common.resetFilters') : undefined}
		actionHref={hasFilters ? '/audio' : undefined}
	/>
{:else}
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
									disabled={!listLoaded}
									class="h-4 w-4 rounded border-stone-300 text-primary focus:ring-primary/30"
								/>
							</th>
						{/if}
						<th class="w-10 px-2 py-3"></th>
						<th class="px-4 py-3 font-medium text-stone-500">{$t('common.title')}</th>
						<th class="px-4 py-3 font-medium text-stone-500">{$t('common.artist')}</th>
						<th class="px-4 py-3 font-medium text-stone-500">{$t('common.category')}</th>
						<th class="px-4 py-3 font-medium text-stone-500">{$t('common.duration')}</th>
						<th class="px-4 py-3 font-medium text-stone-500">{$t('common.size')}</th>
						<th class="px-4 py-3 font-medium text-stone-500">{$t('common.date')}</th>
					</tr>
				</thead>
				<tbody>
					{#if !listLoaded}
						<SkeletonRows rows={10} cols={columnCount} />
					{:else}
						{#each audioList as audio}
							{@const id = audio._id ?? ''}
							{@const isPreviewing = $audioPreview.src === audio.s3_url}
							<tr class="border-b border-stone-50 transition-colors {isPreviewing ? 'bg-missionnaire-50/60' : 'hover:bg-cream/40'}">
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
									<div class="flex items-center gap-2">
										{#if isPreviewing && $audioPreview.playing}
											<!-- Playing indicator: tiny animated equalizer -->
											<span class="flex h-3 shrink-0 items-end gap-[2px]" aria-hidden="true">
												<span class="w-[2px] animate-pulse rounded-full bg-primary [animation-duration:0.8s]" style="height: 60%"></span>
												<span class="w-[2px] animate-pulse rounded-full bg-primary [animation-duration:1.1s]" style="height: 100%"></span>
												<span class="w-[2px] animate-pulse rounded-full bg-primary [animation-duration:0.9s]" style="height: 40%"></span>
											</span>
										{/if}
										{#if canSelectAudio}
											<a
												href="/audio/{id}{filterQuery}"
												class="block truncate font-medium text-stone-700 hover:text-primary"
											>
												{audio.title || $t('common.untitled')}
											</a>
										{:else}
											<span class="block truncate font-medium text-stone-700">{audio.title || $t('common.untitled')}</span>
										{/if}
									</div>
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
					{/if}
				</tbody>
			</table>
		</div>
	</div>

	<!-- Pagination -->
	{#if listLoaded}
		<div class="mt-4">
			<Pagination {total} limit={data.pagination.limit} currentPage={data.pagination.pageNumber} />
		</div>
	{/if}
{/if}

<!-- Bulk actions -->
{#if perms.can_delete || perms.can_edit}
<BulkActionBar categories={data.categories} canDelete={perms.can_delete} canEdit={perms.can_edit} />
{/if}
