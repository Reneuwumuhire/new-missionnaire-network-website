<script lang="ts">
	/** Shared pulsing skeleton for initial data loads (mirrors the main site's
	 *  ListSkeleton). Variants:
	 *  - `rows`  — stacked list rows inside a bordered card (tables/lists)
	 *  - `cards` — stacked article cards (questions pending/reports)
	 *  - `stats` — 4-up stat card grid (dashboard)
	 *  - `panel` — bordered panel with a heading bar + content bars (dashboard) */
	interface Props {
		rows?: number;
		variant?: 'rows' | 'cards' | 'stats' | 'panel';
	}

	let { rows = 8, variant = 'rows' }: Props = $props();
</script>

{#if variant === 'stats'}
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
		{#each Array.from({ length: 4 }) as _}
			<div class="animate-pulse border border-stone-200/60 bg-white/40 p-5">
				<div class="mb-3 h-10 w-10 rounded-full bg-stone-200"></div>
				<div class="h-6 w-16 rounded-full bg-stone-200"></div>
				<div class="mt-2 h-3 w-28 rounded-full bg-stone-100"></div>
			</div>
		{/each}
	</div>
{:else if variant === 'panel'}
	<div class="animate-pulse border border-stone-200/60 bg-white/40 p-6" aria-hidden="true">
		<div class="mb-5 h-5 w-44 rounded-full bg-stone-200"></div>
		<div class="space-y-4">
			{#each Array.from({ length: rows }) as _, i}
				<div class="flex items-center gap-3">
					<div class="h-3 w-20 flex-shrink-0 rounded-full bg-stone-100"></div>
					<div class="h-4 flex-1 rounded-full {i % 2 ? 'bg-stone-100' : 'bg-stone-200'}"></div>
				</div>
			{/each}
		</div>
	</div>
{:else if variant === 'cards'}
	<div class="grid gap-4" aria-hidden="true">
		{#each Array.from({ length: rows }) as _}
			<div class="animate-pulse border border-stone-200/60 bg-white/50 p-5">
				<div class="h-3 w-40 rounded-full bg-stone-100"></div>
				<div class="mt-3 h-6 w-2/3 rounded-full bg-stone-200"></div>
				<div class="mt-3 h-3 w-full rounded-full bg-stone-100"></div>
				<div class="mt-2 h-3 w-5/6 rounded-full bg-stone-100"></div>
			</div>
		{/each}
	</div>
{:else}
	<div class="divide-y divide-stone-100 border border-stone-200/60 bg-white/40" aria-hidden="true">
		{#each Array.from({ length: rows }) as _}
			<div class="flex animate-pulse items-center gap-3 px-4 py-4">
				<div class="h-4 w-4 flex-shrink-0 rounded bg-stone-200"></div>
				<div class="min-w-0 flex-1 space-y-2">
					<div class="h-4 w-3/4 rounded-full bg-stone-200"></div>
					<div class="h-3 w-1/2 rounded-full bg-stone-100"></div>
				</div>
				<div class="hidden h-3 w-24 rounded-full bg-stone-100 md:block"></div>
				<div class="hidden h-3 w-16 rounded-full bg-stone-100 md:block"></div>
				<div class="h-7 w-7 flex-shrink-0 rounded-full bg-stone-200"></div>
			</div>
		{/each}
	</div>
{/if}
