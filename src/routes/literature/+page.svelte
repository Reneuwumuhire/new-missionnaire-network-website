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
	import IoCloudDownloadOutline from 'svelte-icons-pack/io/IoCloudDownloadOutline';
	import IoBookOutline from 'svelte-icons-pack/io/IoBookOutline';
	import IoCreate from 'svelte-icons-pack/io/IoCreate';

	export let data;

	$: literature = data.literature || [];
	$: totalItems = data.total || 0;
	$: currentAuthor = data.author;
	$: currentType = data.category;
	$: currentSearch = data.search;
	$: currentSort = data.sort || 'release_date:desc';
	$: currentPage = data.page;
	$: limit = data.limit;
	$: currentLanguage = data.language;

	const authors = ['Tous', 'William Marrion Branham', 'Ewald Frank'];
	const categories = ['All', 'book', 'circular_letter'];
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

	function handleSortChange(property: string) {
		const params = new URLSearchParams($page.url.searchParams);
		const current = params.get('sort') || 'release_date:desc';
		const [currentProp, currentOrder] = current.split(':');
		
		let nextOrder = 'desc';
		if (currentProp === property) {
			nextOrder = currentOrder === 'desc' ? 'asc' : 'desc';
		} else {
			nextOrder = (property === 'title' || property === 'author') ? 'asc' : 'desc';
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

<svelte:head>
	<title>Littérature - Missionnaire Network</title>
</svelte:head>

<div class="container mx-auto px-4 md:px-8 py-10 max-w-7xl">
	<!-- Hero Section -->
	<div class="mb-12 text-left">
		<h1 class="text-4xl md:text-5xl font-black text-gray-900 mb-4">Littérature</h1>
		<p class="text-gray-500 max-w-2xl">Découvrez les livres, brochures et lettres circulaires des serviteurs de Dieu pour l'édification du Corps de Christ.</p>
	</div>

	<!-- Filters Section -->
	<div class="flex flex-col gap-10 mb-12 bg-gray-50/30 p-4 md:p-6 rounded-2xl border border-gray-100/50">
		<!-- Authors Filter -->
		<div>
			<h2 class="text-[10px] md:text-xs font-black text-orange-500 uppercase tracking-[0.2em] mb-4 text-left">Auteurs</h2>
			<div class="flex overflow-x-auto pb-2 gap-3 no-scrollbar justify-start">
				{#each authors as author}
					<button 
						class="flex-shrink-0 px-5 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all border {(author === 'Tous' && !currentAuthor) || currentAuthor === author ? 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-500/20' : 'bg-white text-gray-500 border-gray-100 hover:border-orange-200 hover:text-orange-500'}"
						on:click={() => handleAuthorChange(author)}
					>
						{author === 'Tous' ? 'Tout le monde' : author}
					</button>
				{/each}
			</div>
		</div>

		<!-- Types Filter -->
		<div>
			<h2 class="text-[10px] md:text-xs font-black text-orange-500 uppercase tracking-[0.2em] mb-4 text-left">Types</h2>
			<div class="flex overflow-x-auto pb-2 gap-3 no-scrollbar justify-start">
				{#each categories as cat}
					<button 
						class="flex-shrink-0 px-5 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all border {(cat === 'All' && !currentType) || currentType === cat ? 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-500/20' : 'bg-white text-gray-500 border-gray-100 hover:border-orange-200 hover:text-orange-500'}"
						on:click={() => handleTypeChange(cat)}
					>
						{#if cat === 'All'}
							Tout
						{:else if cat === 'book'}
							Livres & Brochures
						{:else if cat === 'circular_letter'}
							Lettres Circulaires
						{:else}
							{cat}
						{/if}
					</button>
				{/each}
			</div>
		</div>

		<!-- Language Filter -->
		<div>
			<h2 class="text-[10px] md:text-xs font-black text-orange-500 uppercase tracking-[0.2em] mb-4 text-left">Langues</h2>
			<div class="flex overflow-x-auto pb-2 gap-3 no-scrollbar justify-start">
				{#each languages as lang}
					<button 
						class="flex-shrink-0 px-5 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all border {currentLanguage === lang.id ? 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-500/20' : 'bg-white text-gray-500 border-gray-100 hover:border-orange-200 hover:text-orange-500'}"
						on:click={() => handleLanguageChange(lang.id)}
					>
						{lang.name}
					</button>
				{/each}
			</div>
		</div>

		<!-- Search & Sort Row -->
		<div class="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
			<div class="w-full md:w-96 relative">
				<div class="absolute inset-y-0 left-4 flex items-center pointer-events-none">
					<Icon src={BsSearch} size="14" color="#9ca3af" />
				</div>
				<input 
					type="text" 
					placeholder="Rechercher un livre..." 
					class="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-xl shadow-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none transition-all text-sm"
					value={currentSearch}
					on:input={handleSearch}
				/>
			</div>
			
			{#if currentSearch || (currentAuthor && currentAuthor !== 'Tous') || (currentType && currentType !== 'All')}
				<button 
					class="flex items-center gap-2 text-orange-500 font-bold text-xs uppercase tracking-widest hover:text-orange-600 transition-colors"
					on:click={() => goto('?')}
				>
					<Icon src={BsX} size="18" />
					Réinitialiser les filtres
				</button>
			{/if}
		</div>
	</div>

	<!-- Main List -->
	<div class="relative min-h-[400px]">
		{#if $navigating}
			<div class="absolute inset-0 bg-white/60 backdrop-blur-[1px] z-20 flex items-center justify-center rounded-xl transition-all duration-300">
				<div class="flex flex-col items-center gap-4">
					<div class="text-orange-500 animate-spin">
						<Icon src={IoReload} size="32" />
					</div>
					<span class="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600 animate-pulse">Chargement...</span>
				</div>
			</div>
		{/if}

		<div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
			<div class="grid grid-cols-[50px_1fr_150px_auto] md:grid-cols-[60px_2fr_1fr_1fr_120px] gap-4 px-4 py-4 bg-gray-50/50 border-b border-gray-100 items-center">
				<div class="text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">#</div>
				<button class="text-left flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-orange-500 transition-colors" on:click={() => handleSortChange('title')}>
					TITRE
					{#if currentSort.startsWith('title')}
						<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" className="text-orange-500" />
					{/if}
				</button>
				<button class="hidden md:flex text-left items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-orange-500 transition-colors" on:click={() => handleSortChange('author')}>
					AUTEUR
					{#if currentSort.startsWith('author')}
						<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" className="text-orange-500" />
					{/if}
				</button>
				<div class="hidden md:block text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">CATÉGORIE</div>
				<div class="text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">ACTIONS</div>
			</div>

			<div class="divide-y divide-gray-50">
				{#each literature as item, i}
					<div class="grid grid-cols-[50px_1fr_150px_auto] md:grid-cols-[60px_2fr_1fr_1fr_120px] gap-4 px-4 py-5 items-center hover:bg-orange-50/30 transition-colors group">
						<div class="text-center text-xs font-bold text-gray-300 group-hover:text-orange-300">
							{i + 1 + (currentPage - 1) * limit}
						</div>
						<div class="flex flex-col min-w-0">
							<span class="text-sm font-bold text-gray-800 group-hover:text-orange-600 transition-colors line-clamp-2 leading-snug">
								{item.title || 'Sans titre'}
							</span>
							<div class="flex items-center gap-2 mt-1 md:hidden">
								<span class="text-[10px] font-medium text-gray-400">{item.author}</span>
								<span class="text-gray-200">•</span>
								<span class="text-[10px] font-medium text-orange-400">{item.type}</span>
							</div>
						</div>
						<div class="hidden md:block text-xs font-semibold text-gray-500">
							{item.author}
						</div>
						<div class="hidden md:block">
							<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider {item.type === 'book' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}">
								<Icon src={item.type === 'book' ? IoBookOutline : IoCreate} size="12" />
								{item.type === 'book' ? 'Livre' : 'Lettre'}
							</span>
						</div>
						<div class="flex justify-end pr-2">
							{#if item.pdf_url}
								<a 
									href={item.pdf_url} 
									target="_blank" 
									rel="noopener noreferrer"
									class="flex items-center gap-2 px-4 py-2 bg-white border border-gray-100 rounded-lg text-xs font-bold text-gray-600 hover:bg-orange-500 hover:text-white hover:border-orange-500 shadow-sm transition-all active:scale-95"
								>
									<Icon src={IoCloudDownloadOutline} size="16" />
									<span class="hidden lg:inline">Télécharger</span>
								</a>
							{:else}
								<span class="text-[10px] font-bold text-gray-300 uppercase tracking-widest italic">Indisponible</span>
							{/if}
						</div>
					</div>
				{:else}
					<div class="py-24 text-center">
						<div class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-50 text-gray-200 mb-6">
							<Icon src={BsSearch} size="32" />
						</div>
						<h3 class="text-xl font-bold text-gray-800 mb-2">Aucun document trouvé</h3>
						<p class="text-gray-400 text-sm">Réessayez avec d'autres filtres ou vérifiez l'orthographe.</p>
					</div>
				{/each}
			</div>
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
