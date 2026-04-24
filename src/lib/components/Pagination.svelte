<script lang="ts">
	/** Shared pagination used by /live/rediffusions and /predications so both
	 *  lists render with identical navigation UX. Anchors-based (works with
	 *  non-JS, right-click open-in-new-tab, and SvelteKit client-side nav).
	 *
	 *  Two layouts, CSS-switched by breakpoint to fit whatever screen is in
	 *  front of the user:
	 *
	 *    Mobile (< sm, ~640px):  ‹  [n / total]  ›
	 *      Just prev/next + a pill showing the current position. No
	 *      horizontal wrap possible, fits any phone width.
	 *
	 *    Desktop (sm+):          ‹  1  2  3  …  n-2  n-1  n  ›
	 *      Always shows the first 3 pages, the last 3 pages, and the current
	 *      page with 2 siblings on each side. Gaps collapse into "…".
	 */
	export let current: number;
	export let total: number;
	export let getHref: (page: number) => string;

	// Desktop budget: first 3 + last 3 + current ± 2.
	// Mobile budget: first + last + current ± 1. Still shows structure
	// ("I'm on 2 of 13, I can jump to 13") without overflowing phone width.
	function buildPageList(
		cur: number,
		tot: number,
		edgeCount: number,
		siblings: number
	): Array<number | '…'> {
		if (tot <= 1) return [];
		const flatThreshold = edgeCount * 2 + siblings * 2 + 1;
		if (tot <= flatThreshold) {
			return Array.from({ length: tot }, (_, i) => i + 1);
		}
		const anchors = new Set<number>();
		for (let i = 1; i <= edgeCount; i++) anchors.add(i);
		for (let i = tot - edgeCount + 1; i <= tot; i++) anchors.add(i);
		for (let o = -siblings; o <= siblings; o++) anchors.add(cur + o);
		const sorted = [...anchors].filter((p) => p >= 1 && p <= tot).sort((a, b) => a - b);
		const result: Array<number | '…'> = [];
		for (let i = 0; i < sorted.length; i++) {
			if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push('…');
			result.push(sorted[i]);
		}
		return result;
	}

	$: desktopList = buildPageList(current, total, 3, 2);
	$: mobileList = buildPageList(current, total, 1, 1);
	$: hasPrev = current > 1;
	$: hasNext = current < total;
</script>

{#if total > 1}
	<!-- Mobile compact layout: first + current±1 + last, ellipses for gaps. -->
	<nav
		class="flex sm:hidden flex-nowrap items-center justify-center gap-1 text-sm font-body"
		aria-label="Pagination"
	>
		{#if hasPrev}
			<a
				href={getHref(current - 1)}
				data-sveltekit-preload-data="hover"
				class="inline-flex items-center justify-center h-9 min-w-9 px-2 border border-stone-200/80 text-stone-600 hover:border-missionnaire hover:text-missionnaire transition-colors"
				aria-label="Page précédente">‹</a
			>
		{:else}
			<span
				class="inline-flex items-center justify-center h-9 min-w-9 px-2 border border-stone-100 text-stone-300"
				aria-hidden="true">‹</span
			>
		{/if}
		{#each mobileList as item}
			{#if item === '…'}
				<span
					class="inline-flex items-center justify-center h-9 min-w-9 px-1 text-stone-400"
					aria-hidden="true">…</span
				>
			{:else if item === current}
				<span
					aria-current="page"
					class="inline-flex items-center justify-center h-9 min-w-9 px-2 border border-missionnaire bg-missionnaire text-white font-semibold tabular-nums"
				>
					{item}
				</span>
			{:else}
				<a
					href={getHref(item)}
					class="inline-flex items-center justify-center h-9 min-w-9 px-2 border border-stone-200/80 text-stone-600 hover:border-missionnaire hover:text-missionnaire transition-colors tabular-nums"
					aria-label="Page {item}"
				>
					{item}
				</a>
			{/if}
		{/each}
		{#if hasNext}
			<a
				href={getHref(current + 1)}
				data-sveltekit-preload-data="hover"
				class="inline-flex items-center justify-center h-9 min-w-9 px-2 border border-stone-200/80 text-stone-600 hover:border-missionnaire hover:text-missionnaire transition-colors"
				aria-label="Page suivante">›</a
			>
		{:else}
			<span
				class="inline-flex items-center justify-center h-9 min-w-9 px-2 border border-stone-100 text-stone-300"
				aria-hidden="true">›</span
			>
		{/if}
	</nav>

	<!-- Desktop full layout -->
	<nav
		class="hidden sm:flex flex-nowrap items-center justify-center gap-1 text-sm font-body"
		aria-label="Pagination"
	>
		{#if hasPrev}
			<a
				href={getHref(current - 1)}
				data-sveltekit-preload-data="hover"
				class="inline-flex items-center justify-center h-9 min-w-9 px-3 border border-stone-200/80 text-stone-600 hover:border-missionnaire hover:text-missionnaire transition-colors"
				aria-label="Page précédente">‹</a
			>
		{:else}
			<span
				class="inline-flex items-center justify-center h-9 min-w-9 px-3 border border-stone-100 text-stone-300 cursor-not-allowed"
				aria-hidden="true">‹</span
			>
		{/if}

		{#each desktopList as item}
			{#if item === '…'}
				<span
					class="inline-flex items-center justify-center h-9 min-w-9 px-2 text-stone-400"
					aria-hidden="true">…</span
				>
			{:else if item === current}
				<span
					aria-current="page"
					class="inline-flex items-center justify-center h-9 min-w-9 px-3 border border-missionnaire bg-missionnaire text-white font-semibold tabular-nums"
				>
					{item}
				</span>
			{:else}
				<a
					href={getHref(item)}
					class="inline-flex items-center justify-center h-9 min-w-9 px-3 border border-stone-200/80 text-stone-600 hover:border-missionnaire hover:text-missionnaire transition-colors tabular-nums"
					aria-label="Page {item}"
				>
					{item}
				</a>
			{/if}
		{/each}

		{#if hasNext}
			<a
				href={getHref(current + 1)}
				data-sveltekit-preload-data="hover"
				class="inline-flex items-center justify-center h-9 min-w-9 px-3 border border-stone-200/80 text-stone-600 hover:border-missionnaire hover:text-missionnaire transition-colors"
				aria-label="Page suivante">›</a
			>
		{:else}
			<span
				class="inline-flex items-center justify-center h-9 min-w-9 px-3 border border-stone-100 text-stone-300 cursor-not-allowed"
				aria-hidden="true">›</span
			>
		{/if}
	</nav>
{/if}
