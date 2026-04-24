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
	import RetransmissionTableItem from '$lib/components/RetransmissionTableItem.svelte';
	import Pagination from '$lib/components/Pagination.svelte';

	export let data;

	$: sermons = data.sermons || [];
	$: recordings = data.recordings || [];
	$: filterType = data.filterType || 'sermon';
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
	// True when we're on a sermon-view filter but the sermons query returned
	// nothing AND the blended retransmissions preview has results — in that
	// case we hide the sermon-specific chrome (empty table, alphabet scroller,
	// language/audio options) and let the retransmission section be the page.
	$: blendedOnly =
		filterType === 'sermon' &&
		sermons.length === 0 &&
		Boolean(data.showBlendedRetransmissions) &&
		recordings.length > 0;
	// Only sermons participate in the sermon-playback playlist sync. Retransmission
	// playback is self-contained via the RetransmissionTableItem's own selectAudio
	// dispatch, so the playlist stays as whatever the previous sermon view set.
	$: playlistSermons =
		filterType === 'sermon'
			? sermons.map((sermon: Sermon) =>
					createPlayableSermon(sermon, currentLanguage === 'english' ? 'english' : 'french')
				)
			: [];
	const desktopSermonGrid = 'md:grid-cols-[30px_minmax(0,2.5fr)_minmax(0,1.35fr)_110px_80px_120px]';

	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
	// Only show author filters that have sermons in the DB (computed in the
	// page loader). "Tous" always leads, "Retransmissions" always trails —
	// it's a type filter, not an author filter.
	$: authors = ['Tous', ...(data.availableAuthors ?? []), 'Retransmissions'];

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
	<div class="mb-5 md:mb-6">
		<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-3 font-body">Prédications</p>
		<h1 class="font-display text-3xl md:text-4xl font-semibold text-stone-900">Prédications</h1>
		<a href="/videos" class="inline-flex items-center gap-2 mt-2 text-[12px] font-semibold text-stone-400 hover:text-missionnaire uppercase tracking-[0.15em] font-body transition-colors">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
			Voir en vidéo →
		</a>
	</div>

	<!-- Top Filters (Alpha & Authors) -->
	<div class="flex flex-col gap-5 md:gap-6 mb-6 md:mb-8">
		{#if !blendedOnly}
			<div>
				<h2
					class="text-[10px] md:text-xs font-bold text-missionnaire uppercase tracking-[0.35em] mb-2 md:mb-3 text-center md:text-left font-body"
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
		{/if}

		<div>
			<h2
				class="text-[10px] md:text-xs font-bold text-missionnaire uppercase tracking-[0.35em] mb-2 md:mb-3 text-center md:text-left font-body"
			>
				Prédicateurs
			</h2>
			<div
				class="flex flex-wrap justify-center gap-2 pb-2 md:flex-nowrap md:overflow-x-auto md:gap-3 md:justify-start no-scrollbar"
			>
				{#each authors as author}
					<button
						class="flex-shrink-0 px-3 py-2 md:px-5 md:py-2.5 text-[10px] md:text-[11px] font-bold uppercase tracking-wider transition-all border {(author ===
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

		<!-- Language and Audio Filters — hidden on the Retransmissions view
		     because recordings are kinyarwanda-only and always have audio,
		     so the toggles have no effect. Shown for every sermon filter. -->
		{#if currentAuthor !== 'Retransmissions' && !blendedOnly}
			<div>
				<h2
					class="text-[10px] md:text-xs font-bold text-missionnaire uppercase tracking-[0.35em] mb-2 md:mb-3 text-center md:text-left font-body"
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

						<div class="h-6 w-px bg-stone-200"></div>

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
		{/if}
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
			{#if currentSearch || currentAlpha || currentYear || currentHasAudio || (currentAuthor && currentAuthor !== 'Tous')}
				<div class="mb-3 flex justify-end">
					<button
						class="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1.5 text-[10px] font-bold text-missionnaire hover:bg-stone-200 transition-colors"
						on:click={() => goto('?')}
						title="Réinitialiser les filtres"
					>
						<Icon src={BsX} size="14" />
						Réinitialiser
					</button>
				</div>
			{/if}
			{#if !blendedOnly}
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
						<span class="hidden md:inline">Actions</span>
					</div>
				</div>

				<div class="divide-y divide-stone-100 [&>*]:hover:bg-white/60">
					{#if filterType === 'retransmission'}
						{#each recordings as recording, i (recording.id)}
							<RetransmissionTableItem
								{recording}
								index={i}
								absoluteIndex={i + 1 + (currentPage - 1) * limit}
							/>
						{:else}
							<div class="py-24 text-center">
								<div
									class="bg-stone-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-stone-200"
								>
									<Icon src={BsSearch} size="32" />
								</div>
								<h3 class="text-xl font-bold text-stone-800 mb-2">Aucune retransmission trouvée</h3>
								<p class="text-stone-400 text-sm">
									Essayez de modifier vos filtres ou votre recherche.
								</p>
							</div>
						{/each}
					{:else}
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
					{/if}
				</div>
			</div>
			{/if}

			<!-- Pagination (shared component across /predications and
			     /live/rediffusions so users get the same ‹ 1 2 3 … 12 13 14 ›
			     shape everywhere on the site). The Lignes selector + count stay
			     as sermon-list chrome; pagination itself is unified. -->
			{#if totalPages > 1}
				<div class="mt-12 py-6 border-t border-stone-200/60 flex flex-col gap-6">
					<!-- Row 1: count (desktop only) + Lignes selector. -->
					<div
						class="flex flex-col sm:flex-row items-center sm:justify-between gap-4 text-[10px] md:text-xs font-bold text-stone-400 tracking-widest uppercase"
					>
						<div class="hidden md:block">
							Affichage de {sermons.length} sur {totalSermons} prédications
						</div>
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
					</div>
					<!-- Row 2: Pagination gets its own full-width row so the
					     ‹ 1 2 3 … n-2 n-1 n › sequence never wraps mid-list. -->
					<Pagination
						current={currentPage}
						total={totalPages}
						getHref={(p) => {
							const params = new URLSearchParams($page.url.searchParams);
							params.set('page', String(p));
							return `?${params.toString()}`;
						}}
					/>
				</div>
			{/if}

			<!-- Blended search: when the user searches on "Tout Voir" the server
			     also hits the recordings collection so results from retransmissions
			     aren't hidden behind a filter switch. Preview is capped at 12; a
			     "voir tout" link switches to the Retransmissions filter with the
			     same query to show the full paginated list. -->
			{#if data.showBlendedRetransmissions && recordings.length > 0}
				<section class="mt-12">
					<div class="mb-4 flex items-baseline justify-between gap-4">
						<h2
							class="text-[10px] md:text-xs font-bold text-missionnaire uppercase tracking-[0.35em] font-body"
						>
							Retransmissions correspondant à « {currentSearch} »
							<span class="ml-2 normal-case tracking-normal text-stone-400 font-normal"
								>{data.recordingsTotal ?? recordings.length}</span
							>
						</h2>
						{#if (data.recordingsTotal ?? 0) > recordings.length}
							<a
								href={(() => {
									const p = new URLSearchParams($page.url.searchParams);
									p.set('author', 'Retransmissions');
									p.set('page', '1');
									return `?${p.toString()}`;
								})()}
								class="text-[10px] md:text-[11px] font-bold uppercase tracking-[0.15em] text-missionnaire hover:underline"
							>
								Voir tout →
							</a>
						{/if}
					</div>
					<div class="divide-y divide-stone-100 border border-stone-200/60 bg-white/40">
						{#each recordings as recording, i (recording.id)}
							<RetransmissionTableItem
								{recording}
								index={i}
								absoluteIndex={i + 1}
							/>
						{/each}
					</div>
				</section>
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
