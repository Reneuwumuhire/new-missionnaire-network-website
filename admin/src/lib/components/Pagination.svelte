<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let {
		total,
		limit,
		currentPage
	}: {
		total: number;
		limit: number;
		currentPage: number;
	} = $props();

	const totalPages = $derived(Math.ceil(total / limit));

	function goToPage(p: number) {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('pageNumber', p.toString());
		goto(`?${params.toString()}`, { replaceState: true });
	}

	const visiblePages = $derived.by(() => {
		const pages: number[] = [];
		const start = Math.max(1, currentPage - 2);
		const end = Math.min(totalPages, currentPage + 2);
		for (let i = start; i <= end; i++) pages.push(i);
		return pages;
	});
</script>

{#if totalPages > 1}
	<div class="flex items-center justify-between">
		<p class="text-sm text-stone-500">
			{(currentPage - 1) * limit + 1}–{Math.min(currentPage * limit, total)} sur {total}
		</p>
		<div class="flex items-center gap-1">
			<button
				disabled={currentPage <= 1}
				onclick={() => goToPage(currentPage - 1)}
				class="rounded-none px-3 py-1.5 text-sm text-stone-600 transition-colors hover:bg-cream-dark disabled:opacity-40"
			>
				&larr;
			</button>

			{#if visiblePages[0] > 1}
				<button onclick={() => goToPage(1)} class="rounded-none px-3 py-1.5 text-sm text-stone-600 hover:bg-cream-dark">
					1
				</button>
				{#if visiblePages[0] > 2}
					<span class="px-1 text-stone-400">&hellip;</span>
				{/if}
			{/if}

			{#each visiblePages as p}
				<button
					onclick={() => goToPage(p)}
					class="rounded-none px-3 py-1.5 text-sm font-medium transition-colors
					{p === currentPage ? 'bg-primary text-white' : 'text-stone-600 hover:bg-cream-dark'}"
				>
					{p}
				</button>
			{/each}

			{#if visiblePages[visiblePages.length - 1] < totalPages}
				{#if visiblePages[visiblePages.length - 1] < totalPages - 1}
					<span class="px-1 text-stone-400">&hellip;</span>
				{/if}
				<button onclick={() => goToPage(totalPages)} class="rounded-none px-3 py-1.5 text-sm text-stone-600 hover:bg-cream-dark">
					{totalPages}
				</button>
			{/if}

			<button
				disabled={currentPage >= totalPages}
				onclick={() => goToPage(currentPage + 1)}
				class="rounded-none px-3 py-1.5 text-sm text-stone-600 transition-colors hover:bg-cream-dark disabled:opacity-40"
			>
				&rarr;
			</button>
		</div>
	</div>
{/if}
