<script lang="ts">
	/** Shared pulsing skeleton for list pages. `table` renders stacked rows
	 *  (matches the inline skeletons previously duplicated on /musique,
	 *  /predications and /transcriptions); `cards` renders a thumbnail grid
	 *  for card-based pages like /videos. */
	interface Props {
		rows?: number;
		variant?: 'table' | 'cards';
	}

	let { rows = 8, variant = 'table' }: Props = $props();
</script>

{#if variant === 'cards'}
	<div
		class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"
		aria-hidden="true"
	>
		{#each Array.from({ length: rows }) as _}
			<div class="animate-pulse">
				<div class="aspect-video w-full skeleton-shimmer"></div>
				<div class="mt-3 h-4 w-3/4 rounded-full bg-stone-200"></div>
				<div class="mt-2 h-3 w-1/2 rounded-full bg-stone-100"></div>
			</div>
		{/each}
	</div>
{:else}
	<div class="divide-y divide-stone-100" aria-hidden="true">
		{#each Array.from({ length: rows }) as _}
			<div class="flex items-center gap-3 px-3 md:px-4 py-3 md:py-4 animate-pulse">
				<div class="h-3 w-4 flex-shrink-0 rounded-full bg-stone-200"></div>
				<div class="flex-1 min-w-0 space-y-2">
					<div class="h-4 w-3/4 rounded-full bg-stone-200"></div>
					<div class="h-3 w-1/2 rounded-full bg-stone-100"></div>
				</div>
				<div class="hidden md:block h-3 w-24 rounded-full bg-stone-100"></div>
				<div class="hidden md:block h-3 w-16 rounded-full bg-stone-100"></div>
				<div class="h-7 w-7 flex-shrink-0 rounded-full bg-stone-200"></div>
			</div>
		{/each}
	</div>
{/if}
