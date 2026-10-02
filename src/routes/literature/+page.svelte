<script lang="ts">
	import Breadcrumbs from '$lib/components/+breadcrumbs.svelte';
	import { goto } from '$app/navigation';
	import { page, navigating } from '$app/stores';
	import type { Literature } from '$lib/models/literature';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsSearch from 'svelte-icons-pack/bs/BsSearch';
	import BsX from 'svelte-icons-pack/bs/BsX';
	import BsArrowUp from 'svelte-icons-pack/bs/BsArrowUp';
	import BsArrowDown from 'svelte-icons-pack/bs/BsArrowDown';
	import IoReload from 'svelte-icons-pack/io/IoReload';
	import AiOutlineDownload from 'svelte-icons-pack/ai/AiOutlineDownload';
	import BsChevronDown from 'svelte-icons-pack/bs/BsChevronDown';
	import IoBookOutline from 'svelte-icons-pack/io/IoBookOutline';
	import IoCreate from 'svelte-icons-pack/io/IoCreate';

	let { data } = $props();

	let literature = $derived(data.literature || []);
	let totalItems = $derived(data.total || 0);
	let currentAuthor = $derived(data.author);
	let currentType = $derived(data.category);
	let currentSearch = $derived(data.search);
	let currentSort = $derived(data.sort || 'release_date:desc');
	let currentLanguage = $derived(data.language);
	let currentSource = $derived(data.source || 'All');

	let expandedItems = $state(new Set<string>());

	function toggleDescription(id: string | undefined) {
		if (!id) return;
		if (expandedItems.has(id)) {
			expandedItems.delete(id);
		} else {
			expandedItems.add(id);
		}
		expandedItems = expandedItems; // trigger reactivity
	}

	const authors = ['Tous', 'William Marrion Branham', 'Ewald Frank'];
	const categories = ['All', 'book', 'circular_letter'];
	const sources = ['All', 'freie-volksmission', 'cmpp'];
	const languages = [
		{ id: 'french', name: 'Français' },
		{ id: 'english', name: 'English' }
	];

	function handleLanguageChange(lang: string) {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('language', lang);
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function handleAuthorChange(author: string) {
		const params = new URLSearchParams($page.url.searchParams);
		if (author === 'Tous') params.delete('author');
		else params.set('author', author);

		// Branham only has books, so reset category Filter if he is selected
		if (author === 'William Marrion Branham') {
			params.delete('category');
		}

		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function handleTypeChange(type: string) {
		const params = new URLSearchParams($page.url.searchParams);
		if (type === 'All') params.delete('category');
		else params.set('category', type);
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function handleSourceChange(source: string) {
		const params = new URLSearchParams($page.url.searchParams);
		if (source === 'All') params.delete('source');
		else params.set('source', source);
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function handleSortChange(property: string) {
		const params = new URLSearchParams($page.url.searchParams);
		const current = params.get('sort') || 'release_date:desc';
		const [currentProp, currentOrder] = current.split(':');

		let nextOrder = 'desc';
		if (currentProp === property) {
			nextOrder = currentOrder === 'desc' ? 'asc' : 'desc';
		} else {
			nextOrder = property === 'title' || property === 'author' ? 'asc' : 'desc';
		}

		params.set('sort', `${property}:${nextOrder}`);
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function handleSearch(e: Event) {
		const target = e.target as HTMLInputElement;
		const params = new URLSearchParams($page.url.searchParams);
		if (target.value) params.set('search', target.value);
		else params.delete('search');
		params.set('page', '1');
		goto(`?${params.toString()}`, { keepFocus: true });
	}

	function formatDate(dateStr: string | undefined) {
		if (!dateStr) return '-';
		try {
			const date = new Date(dateStr);
			return date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
		} catch (e) {
			return dateStr;
		}
	}
</script>

<!-- Title/description/og:*/canonical come from `meta` in this route's
     load — the root layout renders the single canonical tag set ($lib/seo). -->

<div class="container mx-auto max-w-7xl px-4 pb-12 pt-4 md:px-8 md:pt-6">
	<Breadcrumbs items={[{ label: 'Littérature' }]} />
	<header
		class="mb-7 flex flex-col gap-5 border-b border-stone-200 pb-7 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:pb-8"
	>
		<div>
			<h1 class="font-display text-5xl font-semibold leading-none text-stone-900 sm:text-6xl">
				Littérature
			</h1>
			<p class="mt-4 max-w-2xl text-base leading-relaxed text-stone-600">
				Découvrez les livres, brochures et lettres circulaires des serviteurs de Dieu pour
				l'édification du Corps de Christ.
			</p>
		</div>
		<div class="flex shrink-0 items-baseline gap-2 sm:block sm:text-right">
			<strong class="font-display text-4xl font-semibold leading-none text-missionnaire md:text-5xl"
				>{totalItems}</strong
			>
			<p class="text-sm text-stone-500">
				document{totalItems === 1 ? '' : 's'} disponible{totalItems === 1 ? '' : 's'}
			</p>
		</div>
	</header>

	<section class="mb-10 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
		<div class="flex flex-col gap-3 border-b border-stone-200 p-4 sm:flex-row sm:items-center">
			<label class="relative block min-w-0 flex-1">
				<span class="sr-only">Rechercher dans la littérature</span>
				<span
					class="pointer-events-none absolute inset-y-0 left-4 flex items-center text-stone-400"
				>
					<Icon src={BsSearch} size="17" />
				</span>
				<input
					type="search"
					placeholder="Rechercher par titre ou mot-clé"
					class="min-h-12 w-full rounded-lg border border-stone-200 bg-stone-50 py-3 pl-11 pr-4 text-base text-stone-800 outline-none transition-colors placeholder:text-stone-400 focus:border-missionnaire focus:bg-white focus:ring-2 focus:ring-orange-100"
					value={currentSearch}
					oninput={handleSearch}
				/>
			</label>

			{#if currentSearch || (currentAuthor && currentAuthor !== 'Tous') || (currentType && currentType !== 'All') || (currentSource && currentSource !== 'All')}
				<button
					class="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 px-3 text-sm font-semibold text-orange-700 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
					onclick={() => goto('?')}
				>
					<Icon src={BsX} size="18" />
					Effacer les filtres
				</button>
			{/if}
		</div>

		<div
			class="grid divide-y divide-stone-200 md:divide-x md:divide-y-0 {currentAuthor ===
			'William Marrion Branham'
				? 'md:grid-cols-[1fr_auto]'
				: 'md:grid-cols-[1.35fr_1fr_auto]'}"
		>
			<fieldset class="min-w-0 p-4">
				<legend class="mb-3 text-sm font-semibold text-stone-800">Auteur</legend>
				<div class="flex flex-wrap gap-2">
					{#each authors as author}
						<button
							class="min-h-11 shrink-0 rounded-md border px-3.5 py-2 text-sm font-medium transition-colors {(author ===
								'Tous' &&
								!currentAuthor) ||
							currentAuthor === author
								? 'border-orange-500 bg-orange-500 text-white'
								: 'border-stone-200 bg-white text-stone-600 hover:border-orange-300 hover:text-orange-700'}"
							aria-pressed={(author === 'Tous' && !currentAuthor) || currentAuthor === author}
							onclick={() => handleAuthorChange(author)}
						>
							{author === 'Tous' ? 'Tous les auteurs' : author}
						</button>
					{/each}
				</div>
			</fieldset>

			{#if currentAuthor !== 'William Marrion Branham'}
				<fieldset class="min-w-0 p-4">
					<legend class="mb-3 text-sm font-semibold text-stone-800">Format</legend>
					<div class="flex flex-wrap gap-2">
						{#each categories as cat}
							<button
								class="min-h-11 shrink-0 rounded-md border px-3.5 py-2 text-sm font-medium transition-colors {(cat ===
									'All' &&
									!currentType) ||
								currentType === cat
									? 'border-orange-500 bg-orange-500 text-white'
									: 'border-stone-200 bg-white text-stone-600 hover:border-orange-300 hover:text-orange-700'}"
								aria-pressed={(cat === 'All' && !currentType) || currentType === cat}
								onclick={() => handleTypeChange(cat)}
							>
								{#if cat === 'All'}
									Tous
								{:else if cat === 'book'}
									Livres et brochures
								{:else if cat === 'circular_letter'}
									Lettres circulaires
								{:else}
									{cat}
								{/if}
							</button>
						{/each}
					</div>
				</fieldset>
			{/if}

			<fieldset class="min-w-0 p-4">
				<legend class="mb-3 text-sm font-semibold text-stone-800">Langue</legend>
				<div class="flex flex-wrap gap-2">
					{#each languages as lang}
						<button
							class="min-h-11 shrink-0 rounded-md border px-3.5 py-2 text-sm font-medium transition-colors {currentLanguage ===
							lang.id
								? 'border-orange-500 bg-orange-500 text-white'
								: 'border-stone-200 bg-white text-stone-600 hover:border-orange-300 hover:text-orange-700'}"
							aria-pressed={currentLanguage === lang.id}
							onclick={() => handleLanguageChange(lang.id)}
						>
							{lang.name}
						</button>
					{/each}
				</div>
			</fieldset>
		</div>

		{#if currentAuthor === 'Ewald Frank' && currentType === 'circular_letter'}
			<fieldset class="border-t border-stone-200 p-4">
				<legend class="mb-3 text-sm font-semibold text-stone-800">Source</legend>
				<div class="flex flex-wrap gap-2">
					{#each sources as src}
						<button
							class="min-h-11 shrink-0 rounded-md border px-3.5 py-2 text-sm font-medium transition-colors {(src ===
								'All' &&
								currentSource === 'All') ||
							currentSource === src
								? 'border-orange-500 bg-orange-500 text-white'
								: 'border-stone-200 bg-white text-stone-600 hover:border-orange-300 hover:text-orange-700'}"
							aria-pressed={(src === 'All' && currentSource === 'All') || currentSource === src}
							onclick={() => handleSourceChange(src)}
						>
							{src === 'All'
								? 'Toutes les sources'
								: src === 'freie-volksmission'
									? 'Freie Volksmission'
									: src.toUpperCase()}
						</button>
					{/each}
				</div>
			</fieldset>
		{/if}
	</section>

	<div class="mb-4 flex items-end justify-between gap-4">
		<h2 class="font-display text-3xl font-semibold text-stone-900">Le catalogue</h2>
		<p class="text-sm text-stone-500">{totalItems} résultat{totalItems === 1 ? '' : 's'}</p>
	</div>

	<!-- Main List -->
	<div class="relative min-h-[400px]">
		{#if $navigating}
			<div
				class="absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-white/70 backdrop-blur-[1px]"
			>
				<div
					class="flex items-center gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 shadow-sm"
				>
					<div class="text-orange-600 animate-spin">
						<Icon src={IoReload} size="20" />
					</div>
					<span class="text-sm font-semibold text-stone-700">Chargement…</span>
				</div>
			</div>
		{/if}

		{#if currentAuthor === 'William Marrion Branham'}
			<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
				{#each literature as item}
					<div
						class="group flex h-full flex-col overflow-hidden rounded-lg border border-stone-200 bg-white transition-colors hover:border-orange-300"
					>
						<!-- Cover Image Area -->
						<div
							class="relative flex aspect-[2/3] items-center justify-center overflow-hidden bg-stone-100"
						>
							{#if item.cover_url}
								<img src={item.cover_url} alt={item.title} class="h-full w-full object-cover" />
							{:else}
								<div class="text-center p-6">
									<div
										class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-orange-600"
									>
										<Icon src={IoBookOutline} size="32" />
									</div>
									<span class="text-sm font-medium text-stone-400">Pas de couverture</span>
								</div>
							{/if}
						</div>

						<!-- Content -->
						<div class="flex flex-grow flex-col p-5">
							<h3
								class="mb-2 font-display text-2xl font-semibold leading-tight text-stone-900 transition-colors group-hover:text-orange-700"
							>
								{item.title}
							</h3>

							{#if item.description}
								<p class="mb-4 line-clamp-3 flex-grow text-sm leading-relaxed text-stone-600">
									{item.description}
								</p>
							{:else}
								<div class="flex-grow"></div>
							{/if}

							{#if item.parts.length}
								<details class="book-parts mb-4 border-y border-stone-200 py-1">
									<summary
										class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
									>
										<span>{item.parts.length} prédication{item.parts.length > 1 ? 's' : ''}</span>
										<span class="book-parts-chevron text-orange-600" aria-hidden="true">
											<Icon src={BsChevronDown} size="16" />
										</span>
									</summary>
									<ol class="max-h-72 space-y-1 overflow-y-auto pb-3 pt-1">
										{#each item.parts as part}
											<li
												class="grid grid-cols-[1.5rem_1fr_auto] items-start gap-2 rounded-lg px-2 py-2 hover:bg-orange-50"
											>
												<span class="pt-0.5 text-xs tabular-nums text-stone-400"
													>{part.position}</span
												>
												<span class="min-w-0">
													<span class="block text-sm font-semibold leading-snug text-stone-700"
														>{part.title}</span
													>
													{#if part.code}<span class="mt-0.5 block text-[11px] text-stone-400"
															>{part.code}</span
														>{/if}
												</span>
												<a
													href={part.url}
													target="_blank"
													rel="noopener noreferrer"
													class="inline-flex min-h-11 items-center px-2 text-xs font-bold text-orange-700 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
													>Lire</a
												>
											</li>
										{/each}
									</ol>
								</details>
							{/if}

							{#if item.pdf_url}
								<a
									href={item.pdf_url}
									target="_blank"
									rel="noopener noreferrer"
									class="mb-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
								>
									<Icon src={AiOutlineDownload} size="17" />
									{item.parts.length ? 'Télécharger le livre (.zip)' : 'Télécharger le PDF'}
								</a>
							{/if}

							<div
								class="flex items-center justify-between border-t border-stone-100 pt-4 text-xs font-medium text-stone-500"
							>
								<span>{item.language === 'english' ? 'English' : 'Français'}</span>
								{#if item.release_date}
									<span>{formatDate(item.release_date)}</span>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>

			<!-- Empty State for Grid -->
			{#if literature.length === 0}
				<div class="rounded-xl border border-stone-200 bg-white py-20 text-center">
					<div
						class="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-stone-100 text-stone-400"
					>
						<Icon src={BsSearch} size="26" />
					</div>
					<h3 class="font-display text-2xl font-semibold text-stone-800">Aucun livre trouvé</h3>
					<p class="mt-1 text-sm text-stone-500">
						Nous n'avons trouvé aucun livre correspondant à votre recherche.
					</p>
				</div>
			{/if}
		{:else}
			<!-- Standard List View -->
			<div class="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
				<div
					class="hidden grid-cols-[minmax(0,2fr)_minmax(8rem,0.8fr)_8rem_10rem] items-center gap-5 border-b border-stone-200 bg-stone-50 px-5 py-3 md:grid"
				>
					<button
						class="flex items-center gap-2 text-left text-xs font-semibold text-stone-500 transition-colors hover:text-orange-700"
						onclick={() => handleSortChange('title')}
					>
						Titre
						{#if currentSort.startsWith('title')}
							<Icon
								src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp}
								size="12"
								className="text-orange-600"
							/>
						{/if}
					</button>
					<button
						class="flex items-center gap-2 text-left text-xs font-semibold text-stone-500 transition-colors hover:text-orange-700"
						onclick={() => handleSortChange('author')}
					>
						Auteur
						{#if currentSort.startsWith('author')}
							<Icon
								src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp}
								size="12"
								className="text-orange-600"
							/>
						{/if}
					</button>
					<div class="text-left text-xs font-semibold text-stone-500">Format</div>
					<div class="text-right text-xs font-semibold text-stone-500">Document</div>
				</div>

				<div class="divide-y divide-stone-100">
					{#each literature as item}
						<div
							class="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-5 transition-colors hover:bg-orange-50/50 md:grid-cols-[minmax(0,2fr)_minmax(8rem,0.8fr)_8rem_10rem] md:gap-5 md:px-5"
						>
							<div class="flex flex-col min-w-0">
								<span
									class="line-clamp-2 text-base font-semibold leading-snug text-stone-900 transition-colors group-hover:text-orange-700"
								>
									{item.title || 'Sans titre'}
								</span>
								{#if item.description}
									<div class="mt-1">
										<p
											class="text-sm leading-relaxed text-stone-500 {expandedItems.has(
												item._id || ''
											)
												? ''
												: 'line-clamp-2 md:line-clamp-1'}"
										>
											{item.description}
										</p>
										{#if item.description.length > 100}
											<button
												class="mt-1 text-xs font-semibold text-orange-700 underline-offset-4 hover:underline"
												onclick={() => toggleDescription(item._id)}
											>
												{expandedItems.has(item._id || '') ? 'Voir moins' : 'Voir plus'}
											</button>
										{/if}
									</div>
								{/if}
								<div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 md:hidden">
									<span class="text-xs font-medium text-stone-500">{item.author}</span>
									<span class="text-stone-300">•</span>
									<span class="text-xs font-medium text-orange-700"
										>{item.type === 'book' ? 'Livre' : 'Lettre'}</span
									>
									{#if item.source}
										<span class="text-stone-300">•</span>
										<span class="text-xs text-stone-500">{item.source}</span>
									{/if}
								</div>
							</div>
							<div class="hidden text-sm text-stone-600 md:block">
								{item.author}
							</div>
							<div class="hidden md:block">
								<span
									class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold {item.type ===
									'book'
										? 'bg-blue-50 text-blue-700'
										: 'bg-emerald-50 text-emerald-700'}"
								>
									<Icon src={item.type === 'book' ? IoBookOutline : IoCreate} size="12" />
									{item.type === 'book' ? 'Livre' : 'Lettre'}
								</span>
							</div>
							<div class="flex justify-end">
								{#if item.pdf_url}
									<a
										href={item.pdf_url}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex min-h-11 items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-semibold text-stone-700 transition-colors hover:border-orange-500 hover:bg-orange-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
									>
										<Icon src={AiOutlineDownload} size="16" />
										<span class="hidden lg:inline">Télécharger</span><span class="lg:hidden"
											>PDF</span
										>
									</a>
								{:else}
									<span class="text-xs text-stone-400">Indisponible</span>
								{/if}
							</div>
						</div>
					{:else}
						<div class="py-20 text-center">
							<div
								class="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-full bg-stone-100 text-stone-400"
							>
								<Icon src={BsSearch} size="26" />
							</div>
							<h3 class="font-display text-2xl font-semibold text-stone-800">
								Aucun document trouvé
							</h3>
							<p class="mt-1 text-sm text-stone-500">
								Réessayez avec d'autres filtres ou vérifiez l'orthographe.
							</p>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.book-parts[open] .book-parts-chevron {
		transform: rotate(180deg);
	}

	.book-parts-chevron {
		transition: transform 150ms ease;
	}

	@media (prefers-reduced-motion: reduce) {
		.book-parts-chevron {
			transition: none;
		}
	}
</style>
