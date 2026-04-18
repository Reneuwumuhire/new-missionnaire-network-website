<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	let {
		categories = [],
		artists = []
	}: {
		categories: string[];
		artists: string[];
	} = $props();

	let searchValue = $state($page.url.searchParams.get('search') ?? '');
	let debounceTimer: ReturnType<typeof setTimeout>;

	function updateParam(key: string, value: string) {
		const params = new URLSearchParams($page.url.searchParams);
		if (value) {
			params.set(key, value);
		} else {
			params.delete(key);
		}
		params.set('pageNumber', '1');
		goto(`?${params.toString()}`, { replaceState: true, keepFocus: true });
	}

	function handleSearch() {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			updateParam('search', searchValue);
		}, 300);
	}

	function clearFilters() {
		searchValue = '';
		goto('/audio', { replaceState: true });
	}

	const hasFilters = $derived(
		$page.url.searchParams.has('search') ||
			$page.url.searchParams.has('category') ||
			$page.url.searchParams.has('artist')
	);

	const activeCategory = $derived($page.url.searchParams.get('category') ?? '');
	const activeArtist = $derived($page.url.searchParams.get('artist') ?? '');
	const activeSort = $derived($page.url.searchParams.get('sort') ?? 'uploaded_at:desc');
</script>

<div class="border border-stone-200/60 bg-white/40 p-4">
	<!-- Top row: search + clear -->
	<div class="relative">
		<svg
			class="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width="2"
		>
			<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
		</svg>
		<input
			type="text"
			placeholder="Rechercher titre, artiste, livre..."
			class="w-full rounded-none border border-stone-200/60 bg-white/60 px-4 py-3 pl-10 text-sm text-stone-800 transition-all placeholder:text-stone-400 focus:border-primary focus:bg-white focus:ring-2 focus:ring-primary/20 focus:outline-none"
			bind:value={searchValue}
			oninput={handleSearch}
		/>
		{#if searchValue}
			<button
				onclick={() => { searchValue = ''; updateParam('search', ''); }}
				class="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-stone-400 transition-colors hover:text-stone-600"
				aria-label="Effacer la recherche"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		{/if}
	</div>

	<!-- Bottom row: filters inline -->
	<div class="mt-3 flex items-center gap-2">
		<span class="mr-1 text-xs font-medium tracking-wide text-stone-400 uppercase">Filtres</span>

		<select
			class="rounded-none border border-stone-200/60 bg-white/60 px-3 py-1.5 text-xs font-medium text-stone-600 transition-all hover:border-stone-300 focus:border-primary focus:ring-1 focus:ring-primary/20 focus:outline-none {activeCategory ? 'border-primary/40 bg-missionnaire-50 text-primary' : ''}"
			value={activeCategory}
			onchange={(e) => updateParam('category', e.currentTarget.value)}
		>
			<option value="">Catégorie</option>
			{#each categories as cat}
				<option value={cat}>{cat}</option>
			{/each}
		</select>

		<select
			class="rounded-none border border-stone-200/60 bg-white/60 px-3 py-1.5 text-xs font-medium text-stone-600 transition-all hover:border-stone-300 focus:border-primary focus:ring-1 focus:ring-primary/20 focus:outline-none {activeArtist ? 'border-primary/40 bg-missionnaire-50 text-primary' : ''}"
			value={activeArtist}
			onchange={(e) => updateParam('artist', e.currentTarget.value)}
		>
			<option value="">Artiste</option>
			{#each artists as art}
				<option value={art}>{art}</option>
			{/each}
		</select>

		<div class="h-4 w-px bg-stone-200"></div>

		<select
			class="rounded-none border border-stone-200/60 bg-white/60 px-3 py-1.5 text-xs font-medium text-stone-600 transition-all hover:border-stone-300 focus:border-primary focus:ring-1 focus:ring-primary/20 focus:outline-none"
			value={activeSort}
			onchange={(e) => updateParam('sort', e.currentTarget.value)}
		>
			<option value="uploaded_at:desc">Plus récent</option>
			<option value="uploaded_at:asc">Plus ancien</option>
			<option value="title:asc">Titre A-Z</option>
			<option value="title:desc">Titre Z-A</option>
			<option value="artist:asc">Artiste A-Z</option>
		</select>

		{#if hasFilters}
			<button
				onclick={clearFilters}
				class="ml-auto flex items-center gap-1 rounded-none px-2.5 py-1.5 text-xs font-medium text-stone-500 transition-colors hover:bg-red-50 hover:text-red-600"
			>
				<svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
				Effacer
			</button>
		{/if}
	</div>
</div>
