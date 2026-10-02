<script lang="ts">
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
	import Pagination from '$lib/components/Pagination.svelte';

	let { data } = $props();

	let literature = $derived(data.literature || []);
	let totalItems = $derived(data.total || 0);
	let currentAuthor = $derived(data.author);
	let currentType = $derived(data.category);
	let currentSearch = $derived(data.search);
	let currentSort = $derived(data.sort || 'release_date:desc');
	let currentPage = $derived(data.page);
	let limit = $derived(data.limit);
	let currentLanguage = $derived(data.language);
	let currentSource = $derived(data.source || 'All');
	let totalPages = $derived(Math.ceil(totalItems / limit));
	let summaryFrom = $derived(totalItems === 0 ? 0 : (currentPage - 1) * limit + 1);
	let summaryTo = $derived(Math.min(currentPage * limit, totalItems));
	let activeFilterCount = $derived(
		(currentType && currentType !== 'All' ? 1 : 0) +
			(currentLanguage !== 'french' ? 1 : 0) +
			(currentSource && currentSource !== 'All' ? 1 : 0)
	);

	let expandedItems = $state(new Set<string>());

	function toggleDescription(id: string | undefined) {
		if (!id) return;
		const next = new Set(expandedItems);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		expandedItems = next;
	}

	function readingUrl(item: Literature) {
		return item.parts[0]?.url || item.pdf_url;
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

<header class="literature-band relative border-b border-stone-200/80">
	<div class="literature-band-overlay">
		<div
			class="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:gap-8 md:px-6 md:py-8"
		>
			<div class="min-w-0">
				<p
					class="font-body text-[9px] font-bold uppercase tracking-[0.35em] text-missionnaire md:text-[10px]"
				>
					Bibliothèque du Message
				</p>
				<div class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
					<h1 class="font-display text-[26px] font-semibold leading-none text-white md:text-4xl">
						Littérature
					</h1>
					<span class="font-body text-[11px] text-white/50 md:text-xs">
						Livres, brochures et lettres circulaires
					</span>
				</div>
			</div>

			<label
				class="hidden h-11 w-72 shrink-0 items-center border border-stone-200/60 bg-white md:flex lg:w-96"
			>
				<span class="sr-only">Rechercher dans la littérature</span>
				<span class="ml-3 shrink-0 text-stone-400"><Icon src={BsSearch} size="14" /></span>
				<input
					type="search"
					class="min-w-0 flex-1 bg-transparent px-2.5 font-body text-sm text-stone-800 outline-none placeholder:text-stone-400"
					placeholder="Rechercher par titre ou mot-clé"
					value={currentSearch}
					oninput={handleSearch}
				/>
			</label>
		</div>
	</div>
</header>

<div class="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 md:px-6 md:pt-8">
	<div
		class="mb-4 flex items-center overflow-x-auto border-b border-stone-200/60"
		role="tablist"
		aria-label="Auteur"
	>
		{#each authors as author}
			<button
				role="tab"
				aria-selected={currentAuthor === author}
				class="-mb-px min-h-11 shrink-0 border-b-2 px-4 py-3 font-body text-[11px] font-bold uppercase tracking-[0.12em] transition-colors md:px-6 md:text-[12px] {currentAuthor ===
				author
					? 'border-missionnaire text-missionnaire'
					: 'border-transparent text-stone-400 hover:text-stone-600'}"
				onclick={() => handleAuthorChange(author)}
			>
				{author === 'Tous'
					? 'Tous'
					: author === 'William Marrion Branham'
						? 'W. M. Branham'
						: author}
			</button>
		{/each}
	</div>

	<div class="mb-3 flex flex-wrap items-start justify-end gap-2">
		<label class="relative min-w-0 flex-1 md:hidden">
			<span class="sr-only">Rechercher dans la littérature</span>
			<span class="pointer-events-none absolute inset-y-0 left-3 flex items-center text-stone-400">
				<Icon src={BsSearch} size="14" />
			</span>
			<input
				type="search"
				class="h-11 w-full border border-stone-200 bg-white/70 pl-9 pr-3 text-base text-stone-800 outline-none placeholder:text-stone-400 focus:border-missionnaire"
				placeholder="Rechercher un document"
				value={currentSearch}
				oninput={handleSearch}
			/>
		</label>

		<details class="literature-filters w-full md:w-auto">
			<summary
				class="ml-auto inline-flex h-11 cursor-pointer list-none items-center gap-2 border border-stone-200 bg-white/70 px-4 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500 hover:border-missionnaire hover:text-missionnaire"
			>
				<svg
					viewBox="0 0 24 24"
					width="13"
					height="13"
					fill="none"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					aria-hidden="true"
				>
					<line x1="4" y1="6" x2="20" y2="6" />
					<line x1="7" y1="12" x2="17" y2="12" />
					<line x1="10" y1="18" x2="14" y2="18" />
				</svg>
				Filtres
				{#if activeFilterCount > 0}
					<span
						class="flex h-4 min-w-4 items-center justify-center rounded-full bg-missionnaire px-1 text-[9px] text-white"
					>
						{activeFilterCount}
					</span>
				{/if}
			</summary>
			<div class="mt-3 grid gap-5 border border-stone-200 bg-white p-4 md:w-[42rem] md:grid-cols-2">
				{#if currentAuthor !== 'William Marrion Branham'}
					<fieldset>
						<legend class="mb-2 text-xs font-bold uppercase tracking-widest text-stone-400"
							>Format</legend
						>
						<div class="flex flex-wrap gap-2">
							{#each categories as cat}
								<button
									class="min-h-11 border px-3 text-xs font-semibold {currentType === cat
										? 'border-missionnaire bg-missionnaire text-white'
										: 'border-stone-200 text-stone-600 hover:border-missionnaire'}"
									onclick={() => handleTypeChange(cat)}
								>
									{cat === 'All'
										? 'Tous'
										: cat === 'book'
											? 'Livres et brochures'
											: 'Lettres circulaires'}
								</button>
							{/each}
						</div>
					</fieldset>
				{/if}

				<fieldset>
					<legend class="mb-2 text-xs font-bold uppercase tracking-widest text-stone-400"
						>Langue</legend
					>
					<div class="flex flex-wrap gap-2">
						{#each languages as lang}
							<button
								class="min-h-11 border px-3 text-xs font-semibold {currentLanguage === lang.id
									? 'border-missionnaire bg-missionnaire text-white'
									: 'border-stone-200 text-stone-600 hover:border-missionnaire'}"
								onclick={() => handleLanguageChange(lang.id)}
							>
								{lang.name}
							</button>
						{/each}
					</div>
				</fieldset>

				{#if currentAuthor === 'Ewald Frank' && currentType === 'circular_letter'}
					<fieldset class="md:col-span-2">
						<legend class="mb-2 text-xs font-bold uppercase tracking-widest text-stone-400"
							>Source</legend
						>
						<div class="flex flex-wrap gap-2">
							{#each sources as src}
								<button
									class="min-h-11 border px-3 text-xs font-semibold {currentSource === src
										? 'border-missionnaire bg-missionnaire text-white'
										: 'border-stone-200 text-stone-600 hover:border-missionnaire'}"
									onclick={() => handleSourceChange(src)}
								>
									{src === 'All'
										? 'Toutes'
										: src === 'freie-volksmission'
											? 'Freie Volksmission'
											: src.toUpperCase()}
								</button>
							{/each}
						</div>
					</fieldset>
				{/if}
			</div>
		</details>
	</div>

	{#if currentSearch || currentAuthor !== 'Tous' || activeFilterCount > 0}
		<div class="mb-3 flex justify-end">
			<button
				class="inline-flex items-center gap-1.5 border border-stone-200 bg-white/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-stone-500 hover:border-missionnaire hover:text-missionnaire"
				onclick={() => goto('?')}
			>
				<Icon src={BsX} size="14" />
				Réinitialiser
			</button>
		</div>
	{/if}

	<p class="mb-2 text-xs text-stone-500">
		Affichage de {summaryFrom}–{summaryTo} sur {totalItems}
	</p>

	<!-- Main List -->
	<div class="relative min-h-[400px]">
		{#if $navigating}
			<div
				class="absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-[1px]"
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
			<div class="flex min-h-[500px] flex-col border border-stone-200/60 bg-white/40">
				<div
					class="grid grid-cols-[30px_1fr_auto] items-center gap-2 border-b border-stone-200/60 bg-white/40 px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 md:grid-cols-[30px_minmax(0,2fr)_minmax(8rem,0.8fr)_8rem_10rem] md:gap-4 md:text-[11px]"
				>
					<div class="text-center">#</div>
					<button
						class="flex items-center gap-1.5 text-left transition-colors hover:text-missionnaire"
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
						class="hidden items-center gap-1.5 text-left transition-colors hover:text-missionnaire md:flex"
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
					<div class="hidden text-left md:block">Format</div>
					<div class="text-center"><span class="hidden md:inline">Document</span></div>
				</div>

				<div class="divide-y divide-stone-100 [&>*]:hover:bg-white/60">
					{#each literature as item, i}
						<div
							class="group relative grid grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2 px-4 py-4 transition-colors md:grid-cols-[30px_minmax(0,2fr)_minmax(8rem,0.8fr)_8rem_10rem] md:gap-4 {readingUrl(
								item
							)
								? 'cursor-pointer'
								: ''}"
						>
							<div class="text-center text-xs font-semibold text-stone-300">
								{i + 1 + (currentPage - 1) * limit}
							</div>
							<div class="flex flex-col min-w-0">
								{#if readingUrl(item)}
									<a
										href={readingUrl(item)}
										target="_blank"
										rel="noopener noreferrer"
										class="row-read-link line-clamp-2 text-sm font-semibold leading-snug text-stone-800 transition-colors group-hover:text-missionnaire focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
									>
										{item.title || 'Sans titre'}
									</a>
								{:else}
									<span class="line-clamp-2 text-sm font-semibold leading-snug text-stone-800">
										{item.title || 'Sans titre'}
									</span>
								{/if}
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
												class="relative z-10 mt-1 text-xs font-semibold text-orange-700 underline-offset-4 hover:underline"
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
							<div class="hidden text-xs font-medium text-stone-500 md:block">
								{item.author}
							</div>
							<div class="hidden md:block">
								<span
									class="inline-flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider {item.type ===
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
										class="relative z-10 inline-flex min-h-10 items-center gap-2 border border-stone-200 bg-white px-3 py-2 text-xs font-bold text-stone-600 transition-colors hover:border-missionnaire hover:text-missionnaire focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
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

	{#if totalPages > 1}
		<div class="mt-12 border-t border-stone-200/60 py-6">
			<Pagination
				current={currentPage}
				total={totalPages}
				getHref={(pageNumber) => {
					const params = new URLSearchParams($page.url.searchParams);
					params.set('page', String(pageNumber));
					return `?${params.toString()}`;
				}}
			/>
		</div>
	{/if}
</div>

<style>
	.literature-band {
		background-image: url('/img/predications_header.jpg');
		background-color: #1c1917;
		background-position: center 30%;
		background-repeat: no-repeat;
		background-size: cover;
	}

	.literature-band-overlay {
		background-color: rgba(16, 14, 12, 0.84);
	}

	.literature-filters > summary::-webkit-details-marker {
		display: none;
	}

	.row-read-link::after {
		position: absolute;
		inset: 0;
		content: '';
	}

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
