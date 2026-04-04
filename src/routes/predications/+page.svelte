<script lang="ts">
	import { goto } from '$app/navigation';
	import { page, navigating } from '$app/stores';
	import type { Sermon } from '$lib/models/sermon';
	import { basePlaylist, playlist, isShuffle } from '$lib/stores/global';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsSearch from 'svelte-icons-pack/bs/BsSearch';
	import BsX from 'svelte-icons-pack/bs/BsX';
	import BsArrowUp from 'svelte-icons-pack/bs/BsArrowUp';
	import BsArrowDown from 'svelte-icons-pack/bs/BsArrowDown';
	import BsShuffle from 'svelte-icons-pack/bs/BsShuffle';
	import SermonTableItem from '$lib/components/SermonTableItem.svelte';
	import IoPlayCircle from 'svelte-icons-pack/io/IoPlayCircle';
	import IoReload from 'svelte-icons-pack/io/IoReload';
	import { createPlayableSermon } from '../../utils/audioPlayback';

	export let data;

	$: sermons = data.sermons || [];
	$: totalSermons = data.total || 0;
	$: years = data.years || [];
	$: currentAuthor = data.author;
	$: currentSearch = data.search;
	$: currentAlpha = data.alpha;
	$: currentYear = data.year;
	$: currentHasAudio = data.hasAudio;
	$: currentSort = data.sort || 'iso_date:desc';
	$: currentPage = data.page;
	$: limit = data.limit;
	$: currentLanguage = data.language || 'french';
	$: totalPages = Math.ceil(totalSermons / limit);
	$: playlistSermons = sermons.map((sermon: Sermon) =>
		createPlayableSermon(sermon, currentLanguage === 'english' ? 'english' : 'french')
	);
	const desktopSermonGrid = 'md:grid-cols-[30px_minmax(0,2.5fr)_minmax(0,1.35fr)_110px_80px_120px]';

	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
	const authors = ['Tous', 'William Marrion Branham', 'Ewald Frank', 'Église Locale'];

	// Sync playlist when sermons are loaded
	$: if (playlistSermons.length > 0) {
		basePlaylist.set(playlistSermons);
		if (!$isShuffle) {
			playlist.set(playlistSermons);
		}
	}

	function handleAuthorChange(author: string) {
		const params = new URLSearchParams($page.url.searchParams);
		if (author === 'Tous') params.delete('author');
		else params.set('author', author);
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function handleAlphaChange(letter: string) {
		const params = new URLSearchParams($page.url.searchParams);
		if (currentAlpha === letter) params.delete('alpha');
		else params.set('alpha', letter);
		params.delete('search');
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function handleYearChange(year: string) {
		const params = new URLSearchParams($page.url.searchParams);
		if (currentYear === year) params.delete('year');
		else params.set('year', year);
		params.delete('search');
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function handleAudioFilterToggle() {
		const params = new URLSearchParams($page.url.searchParams);
		if (currentHasAudio) params.delete('hasAudio');
		else params.set('hasAudio', 'true');
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function handleLanguageChange(lang: string) {
		if (currentLanguage === lang) return;
		const params = new URLSearchParams($page.url.searchParams);
		params.set('language', lang);
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function handleSortChange(property: string) {
		const params = new URLSearchParams($page.url.searchParams);
		const current = params.get('sort') || 'iso_date:desc';
		const [currentProp, currentOrder] = current.split(':');

		let nextOrder = 'desc';
		if (currentProp === property) {
			nextOrder = currentOrder === 'desc' ? 'asc' : 'desc';
		} else {
			nextOrder = property === 'french_title' || property === 'author' ? 'asc' : 'desc';
		}

		params.set('sort', `${property}:${nextOrder}`);
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function goToPage(p: number) {
		if (p < 1 || p > totalPages) return;
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', p.toString());
		goto(`?${params.toString()}`);
	}

	$: paginationPages = (() => {
		const pages = [];
		const maxVisible = 5;
		let start = Math.max(1, currentPage - 2);
		let end = Math.min(totalPages, start + maxVisible - 1);
		if (end - start < maxVisible - 1) start = Math.max(1, end - maxVisible + 1);
		for (let i = start; i <= end; i++) pages.push(i);
		return pages;
	})();
</script>

<svelte:head>
	<title>Prédications - Missionnaire Network</title>
	<meta
		name="description"
		content="Explorez les prédications du Message par auteur, année, langue et thème. Lecture audio et recherche rapide sur Missionnaire Network."
	/>
	<meta property="og:title" content="Prédications - Missionnaire Network" />
	<meta
		property="og:description"
		content="Consultez les prédications de William Branham, Ewald Frank et de l'église locale."
	/>
</svelte:head>

<div class="max-w-6xl mx-auto px-6 py-8">
	<!-- Page Header -->
	<div class="mb-10">
		<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-3 font-body">Prédications</p>
		<h1 class="font-display text-3xl md:text-4xl font-semibold text-stone-900">Prédications</h1>
		<a href="/videos" class="inline-flex items-center gap-2 mt-2 text-[12px] font-semibold text-stone-400 hover:text-missionnaire uppercase tracking-[0.15em] font-body transition-colors">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
			Voir en vidéo →
		</a>
	</div>

	<!-- Top Filters (Alpha & Authors) -->
	<div class="flex flex-col gap-8 mb-12">
		<div>
			<h2
				class="text-[10px] md:text-xs font-bold text-missionnaire uppercase tracking-[0.35em] mb-4 text-center md:text-left font-body"
			>
				Par ordre alphabétique
			</h2>
			<div class="flex flex-wrap justify-center md:justify-start gap-x-4 gap-y-2">
				{#each alphabet as letter}
					<button
						class="text-[11px] font-body font-bold transition-all {currentAlpha === letter
							? 'text-missionnaire font-semibold'
							: 'text-stone-400 hover:text-missionnaire'}"
						on:click={() => handleAlphaChange(letter)}
					>
						{letter}
					</button>
				{/each}
			</div>
		</div>

		<div>
			<h2
				class="text-[10px] md:text-xs font-bold text-missionnaire uppercase tracking-[0.35em] mb-4 text-center md:text-left font-body"
			>
				Prédicateurs
			</h2>
			<div class="flex overflow-x-auto pb-2 gap-3 no-scrollbar justify-center md:justify-start">
				{#each authors as author}
					<button
						class="flex-shrink-0 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-all border {(author ===
							'Tous' &&
							!currentAuthor) ||
						currentAuthor === author
							? 'border-missionnaire text-missionnaire bg-missionnaire/5'
							: 'bg-white/40 text-stone-500 border-stone-200/60 hover:border-missionnaire hover:text-missionnaire'} {$navigating
							? 'opacity-50 cursor-not-allowed'
							: ''}"
						on:click={() => !$navigating && handleAuthorChange(author)}
						disabled={$navigating ? true : false}
					>
						{author === 'Tous' ? 'Tout Voir' : author}
					</button>
				{/each}
			</div>
		</div>

		<!-- Language and Audio Filters -->
		<div>
			<h2
				class="text-[10px] md:text-xs font-bold text-missionnaire uppercase tracking-[0.35em] mb-4 text-center md:text-left font-body"
			>
				Options
			</h2>
			<div
				class="flex flex-col md:flex-row gap-4 items-center justify-between bg-white/40 p-4 border border-stone-200/60"
			>
				<div class="flex items-center gap-4 w-full md:w-auto">
					<!-- Language Toggle -->
					<div class="flex bg-stone-100 rounded-lg p-1">
						<button
							class="px-3 py-1.5 rounded-md text-xs font-bold transition-all {currentLanguage ===
							'french'
								? 'bg-white text-missionnaire shadow-sm'
								: 'text-stone-500 hover:text-stone-700'}"
							on:click={() => handleLanguageChange('french')}
						>
							Français
						</button>
						<button
							class="px-3 py-1.5 rounded-md text-xs font-bold transition-all {currentLanguage ===
							'english'
								? 'bg-white text-missionnaire shadow-sm'
								: 'text-stone-500 hover:text-stone-700'}"
							on:click={() => handleLanguageChange('english')}
						>
							English
						</button>
					</div>

					<div class="h-6 w-px bg-stone-200" />

					<button
						class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all {currentHasAudio
							? 'bg-stone-100 text-missionnaire border border-stone-300'
							: 'bg-stone-50 text-stone-500 border border-transparent hover:bg-stone-100'}"
						on:click={() => !$navigating && handleAudioFilterToggle()}
						disabled={$navigating ? true : false}
					>
						<Icon src={IoPlayCircle} size="16" />
						Audio Uniquement
					</button>
				</div>
			</div>
		</div>
	</div>

	<div class="flex flex-col md:flex-row gap-8">
		<!-- Sidebar: Years -->
		{#if sermons.length > 0}
			<aside class="w-full md:w-56 flex-shrink-0">
				<div class="bg-white/40 border border-stone-200/60 p-5 md:sticky md:top-24">
					<h2
						class="text-xs font-bold text-stone-800 uppercase tracking-widest mb-6 pb-2 border-b border-stone-200/60 font-body"
					>
						Années
					</h2>
					<div class="grid grid-cols-3 gap-2 max-h-[70vh] overflow-y-auto no-scrollbar pr-1">
						{#each years as year}
							<button
								class="px-3 py-2 rounded-lg text-[11px] font-bold transition-all border text-center {currentYear ===
								year
									? 'border-missionnaire text-missionnaire bg-missionnaire/5'
									: 'bg-white/40 text-stone-400 border-stone-200/60 hover:border-missionnaire hover:text-missionnaire'} {$navigating
									? 'opacity-50 cursor-not-allowed'
									: ''}"
								on:click={() => !$navigating && handleYearChange(year)}
								disabled={$navigating ? true : false}
							>
								{year}
							</button>
						{/each}
					</div>
				</div>
			</aside>
		{/if}

		<!-- Main Content: Sermons List -->
		<div class="flex-1 min-w-0 relative">
			{#if $navigating}
				<div
					class="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-20 flex items-center justify-center transition-all duration-300"
				>
					<div class="flex flex-col items-center gap-4">
						<div class="text-missionnaire animate-spin">
							<Icon src={IoReload} size="32" />
						</div>
						<span
							class="text-[10px] font-semibold uppercase tracking-[0.25em] text-missionnaire animate-pulse"
							>Chargement...</span
						>
					</div>
				</div>
			{/if}
			<div class="bg-white/40 border border-stone-200/60 min-h-[500px] flex flex-col">
				<div
					class="relative grid grid-cols-[30px_1fr_auto_auto] {desktopSermonGrid} gap-2 md:gap-4 px-3 md:px-4 py-3 border-b border-stone-200/60 text-[10px] md:text-[11px] font-bold text-stone-400 uppercase tracking-widest bg-white/40 items-center"
				>
					<div class="text-center">#</div>
					<button
						class="text-left flex items-center gap-1.5 hover:text-missionnaire transition-colors"
						on:click={() => handleSortChange('french_title')}
					>
						{#if currentSort.startsWith('french_title')}
							<span class="text-missionnaire">
								<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
							</span>
						{/if}
						Titre
					</button>
					<button
						class="hidden md:flex text-left items-center gap-1.5 hover:text-missionnaire transition-colors"
						on:click={() => handleSortChange('author')}
					>
						{#if currentSort.startsWith('author')}
							<span class="text-missionnaire">
								<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
							</span>
						{/if}
						Prédicateur
					</button>
					<button
						class="hidden md:flex text-left items-center gap-1.5 hover:text-missionnaire transition-colors"
						on:click={() => handleSortChange('iso_date')}
					>
						{#if currentSort.startsWith('iso_date')}
							<span class="text-missionnaire">
								<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
							</span>
						{/if}
						Date
					</button>
					<button
						class="hidden md:flex text-center items-center justify-center gap-1.5 hover:text-missionnaire transition-colors"
						on:click={() => handleSortChange('duration')}
					>
						{#if currentSort.startsWith('duration')}
							<span class="text-missionnaire">
								<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
							</span>
						{/if}
						Durée
					</button>
					<div class="flex items-center justify-center text-center">
						{#if currentSearch || currentAlpha || currentYear || currentHasAudio || (currentAuthor && currentAuthor !== 'Tous')}
							<button
								class="absolute right-3 top-1/2 -translate-y-1/2 md:right-4 flex items-center gap-1.5 text-[9px] font-bold text-missionnaire bg-stone-100 px-2 py-1 rounded-full hover:bg-stone-200 transition-colors normal-case tracking-normal"
								on:click={() => goto('?')}
								title="Réinitialiser les filtres"
							>
								<Icon src={BsX} size="14" />
								<span class="hidden lg:inline">Réinitialiser</span>
							</button>
						{/if}
						<span>Actions</span>
					</div>
				</div>

				<div class="divide-y divide-stone-100 [&>*]:hover:bg-white/60">
					{#each sermons as sermon, i (sermon._id)}
						<SermonTableItem
							{sermon}
							index={i}
							absoluteIndex={i + 1 + (currentPage - 1) * limit}
							language={currentLanguage}
						/>
					{:else}
						<div class="py-24 text-center">
							<div
								class="bg-stone-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-stone-200"
							>
								<Icon src={BsSearch} size="32" />
							</div>
							<h3 class="text-xl font-bold text-stone-800 mb-2">Aucun sermon trouvé</h3>
							<p class="text-stone-400 text-sm">
								Essayez de modifier vos filtres ou votre recherche.
							</p>
						</div>
					{/each}
				</div>
			</div>

			<!-- Pagination -->
			{#if totalPages > 1}
				<div
					class="flex flex-col md:flex-row justify-between items-center mt-12 py-6 gap-6 text-[10px] md:text-xs font-bold text-stone-400 tracking-widest uppercase border-t border-stone-200/60"
				>
					<div class="hidden md:block">
						Affichage de {sermons.length} sur {totalSermons} prédications
					</div>

					<div class="flex flex-col md:flex-row items-center gap-6 md:gap-8 w-full md:w-auto">
						<div class="flex items-center gap-3">
							<span class="opacity-60">Lignes:</span>
							<select
								class="bg-stone-100 rounded-lg px-3 py-1.5 outline-none text-stone-800 focus:ring-2 focus:ring-missionnaire/20 transition-all cursor-pointer"
								value={limit}
								on:change={(e) => {
									const params = new URLSearchParams($page.url.searchParams);
									params.set('limit', e.currentTarget.value);
									params.set('page', '1');
									goto(`?${params.toString()}`);
								}}
							>
								<option value="10">10</option>
								<option value="20">20</option>
								<option value="50">50</option>
								<option value="100">100</option>
							</select>
						</div>

						<div class="flex items-center gap-2">
							<div
								class="flex items-center gap-1 bg-white/40 p-1 rounded-xl border border-stone-200/60"
							>
								<button
									class="px-3 py-1.5 rounded-lg hover:bg-stone-50 disabled:opacity-20 transition-all text-[10px] md:text-xs font-bold"
									disabled={currentPage === 1}
									on:click={() => goToPage(currentPage - 1)}
								>
									Précédent
								</button>

								{#each paginationPages as p}
									<button
										class="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-lg transition-all text-[10px] md:text-xs font-bold {currentPage ===
										p
											? 'bg-stone-900 text-white'
											: 'hover:bg-stone-50 text-stone-600'}"
										on:click={() => goToPage(p)}
									>
										{p}
									</button>
								{/each}

								<button
									class="px-3 py-1.5 rounded-lg hover:bg-stone-50 disabled:opacity-20 transition-all text-[10px] md:text-xs font-bold"
									disabled={currentPage === totalPages}
									on:click={() => goToPage(currentPage + 1)}
								>
									Suivant
								</button>
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}
	.no-scrollbar {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
