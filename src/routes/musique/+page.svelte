<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { MusicAudio } from '$lib/models/music-audio';
	import type { AudioAsset } from '$lib/models/media-assets';
	import { selectAudio, basePlaylist, playlist, currentIndex, autoNext, isShuffle, isPlaying } from '$lib/stores/global';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsSearch from 'svelte-icons-pack/bs/BsSearch';
	import BsPlayFill from 'svelte-icons-pack/bs/BsPlayFill';
	import BsArrowUp from 'svelte-icons-pack/bs/BsArrowUp';
	import BsArrowDown from 'svelte-icons-pack/bs/BsArrowDown';
	import BsX from 'svelte-icons-pack/bs/BsX';
	import BsShuffle from 'svelte-icons-pack/bs/BsShuffle';

	import IoCloudDownloadOutline from 'svelte-icons-pack/io/IoCloudDownloadOutline';
	import IoPlayCircle from 'svelte-icons-pack/io/IoPlayCircle';
	import IoPauseCircle from 'svelte-icons-pack/io/IoPauseCircle';
	import { formatTime } from '../../utils/FormatTime';
	export let data;

	$: musicList = (data as any).musicAudio;
	$: artists = (data as any).artists || [];
	$: currentCategory = (data as any).category;
	$: currentSearch = (data as any).search;
	$: currentAlpha = (data as any).alpha;
	$: currentSort = (data as any).sort || 'uploaded_at:desc';
	$: currentArtist = (data as any).artist;
	$: totalSongs = (data as any).total;
	$: currentPage = (data as any).page;
	$: limit = (data as any).limit;
	$: totalPages = Math.ceil(totalSongs / limit);

	let isArtistMenuOpen = false;
	let artistSearch = '';
	$: filteredArtists = artists.filter((a: string) => a.toLowerCase().includes(artistSearch.toLowerCase()));

	let searchInput = currentSearch;

	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

	const categories = [
		'All',
		'Sur les Ailes de la Foi',
		'Agakiza',
		'Gushimisha',
		'Cantique Collection',
		'Chants de Victoire',
		'Chorus',
		"Iz'i Gisenyi",
		'Izindi',
		'Nyimbo za Mungu',
		'Tenzi za Roho',
		'Umuco',
		'Nyimbo za Wokovu',
		'Ikirundi',
		'Impimbano',
		'Kolowezi'
	];

	// Sync playlist when songs are loaded
	$: if (musicList) {
		basePlaylist.set(musicList);
		if (!$isShuffle) {
			playlist.set(musicList);
		}
	}

	function handleSearch() {
		const params = new URLSearchParams($page.url.searchParams);
		if (searchInput) {
			params.set('search', searchInput);
		} else {
			params.delete('search');
		}
		params.delete('alpha'); // Search clears alphabetical filter
		params.delete('artist'); // Search clears artist filter
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function handleArtistChange(artist: string) {
		const params = new URLSearchParams($page.url.searchParams);
		if (currentArtist === artist) {
			params.delete('artist');
		} else {
			params.set('artist', artist);
		}
		params.delete('search');
		params.delete('alpha');
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function handleAlphaChange(letter: string) {
		const params = new URLSearchParams($page.url.searchParams);
		if (currentAlpha === letter) {
			params.delete('alpha');
		} else {
			params.set('alpha', letter);
		}
		params.delete('search'); // Alphabetical filter clears search
		params.delete('artist'); // Alphabetical filter clears artist
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function handleCategoryChange(category: string) {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('category', category);
		params.delete('artist');
		params.set('page', '1');
		
		// If switching to 'All' (Tout Voir), remove explicit sort to allow default random shuffle
		if (category === 'All') {
			params.delete('sort');
		} else {
			// For specific categories, default to recent uploads if no sort exists, 
			// or keep existing sort? 
			// Better to keep existing sort if user chose one? 
			// Or maybe reset to default (uploaded_at) for cleaner UX?
			// Let's just remove sort for 'All' which triggers the +page.ts default 'random'.
			// For others, if we keep sort, it might be random?
			// If sort was 'random' and we switch to 'Umuco', we probably want 'uploaded_at' or 'title'.
			// 'random' is only handled for 'All' in +page.ts default.
			// But if we keep 'sort=random' in URL, backend handles proper random for categories too?
			// Backend: `if (property === 'random')` works for any query.
			// So random sort works for categories too!
			// Does the user *want* that? "in the list when it is Voir tous".
			// Maybe for specific collections they want order?
			// Let's explicitly remove 'sort' if it was 'random' when switching categories, or just always reset sort on category change?
			// Common pattern: Category change resets sort to default.
			params.delete('sort');
		}
		
		goto(`?${params.toString()}`);
	}

	function handleSortChange(property: string) {
		const params = new URLSearchParams($page.url.searchParams);
		const current = params.get('sort') || 'uploaded_at:desc';
		const [currentProp, currentOrder] = current.split(':');
		
		let nextOrder = 'desc';
		if (currentProp === property) {
			nextOrder = currentOrder === 'desc' ? 'asc' : 'desc';
		} else {
			// Default to ASC for Titre and Artiste, DESC for everything else (dates, duration)
			nextOrder = (property === 'title' || property === 'artist' || property === 'category') ? 'asc' : 'desc';
		}
		
		params.set('sort', `${property}:${nextOrder}`);
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	$: paginationPages = (() => {
		const pages = [];
		const maxVisible = 5;
		let start = Math.max(1, currentPage - 2);
		let end = Math.min(totalPages, start + maxVisible - 1);
		
		if (end - start < maxVisible - 1) {
			start = Math.max(1, end - maxVisible + 1);
		}
		
		for (let i = start; i <= end; i++) {
			pages.push(i);
		}
		return pages;
	})();

	function goToPage(p: number) {
		if (p < 1 || p > totalPages) return;
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', p.toString());
		goto(`?${params.toString()}`);
	}

	function playSong(song: MusicAudio, index: number) {
		currentIndex.set(index);
		selectAudio.set(song);
	}

	async function downloadSong(song: MusicAudio) {
		try {
			const url = song.s3_url;
			const response = await fetch(url);
			if (!response.ok) throw new Error('Download failed');
			const blob = await response.blob();
			const blobUrl = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = blobUrl;
			a.download = `${song.title || 'chant'}.mp3`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			window.URL.revokeObjectURL(blobUrl);
		} catch (error) {
			console.error('Download failed, trying direct link:', error);
			// Fallback: Open in new tab which usually triggers download or opens the file
			window.open(song.s3_url, '_blank');
		}
	}
	function isSongActive(song: MusicAudio, current: MusicAudio | AudioAsset | null) {
		if (!current) return false;
		const activeUrl = 's3_url' in current ? current.s3_url : (current as any).url;
		const songUrl = 's3_url' in song ? song.s3_url : (song as any).url;
		return activeUrl === songUrl;
	}
</script>

<svelte:head>
	<title>Cantiques - Missionnaire Network</title>
	<meta name="description" content="Ecoutez les cantiques du Message de l'Heure sur Missionnaire Network." />
</svelte:head>

<div class="container mx-auto px-2 md:px-4 py-8 max-w-5xl">
	<!-- Alpha Filter -->
	<div class="mb-10">
		<h2 class="text-[10px] md:text-xs font-black text-orange-500 uppercase tracking-[0.2em] mb-4">Par ordre alphabétique</h2>
		<div class="flex flex-wrap gap-x-4 gap-y-2">
			{#each alphabet as letter}
				<button 
					class="text-sm md:text-base font-bold transition-all {currentAlpha === letter ? 'text-orange-500 scale-110' : 'text-gray-300 hover:text-orange-400'}"
					on:click={() => handleAlphaChange(letter)}
				>
					{letter}
				</button>
			{/each}
		</div>
	</div>

	<div class="mb-12">
		<h2 class="text-[10px] md:text-xs font-black text-orange-500 uppercase tracking-[0.2em] mb-4">Recueils</h2>
		<div class="flex overflow-x-auto pb-4 gap-3 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 md:pb-0" style="scrollbar-width: none; -ms-overflow-style: none;">
			{#each categories as category}
				<button 
					class="flex-shrink-0 px-5 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all border {currentCategory === category ? 'bg-orange-500 text-white border-orange-500 shadow-lg shadow-orange-500/20' : 'bg-white text-gray-500 border-gray-100 hover:border-orange-200 hover:text-orange-500'}"
					on:click={() => handleCategoryChange(category)}
				>
					{category === 'All' ? 'Tout Voir' : category}
				</button>
			{/each}
		</div>
	</div>

	<!-- List Title and Mobile Filters -->
	<div class="flex flex-col gap-2 mb-6">
		<div class="flex items-center justify-between">
			<h2 class="text-3xl font-black text-gray-800">List</h2>
			<!-- Mobile Artist Filter Toggle -->
			<div class="relative md:hidden">
				<button 
					class="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm active:scale-95 transition-transform"
					on:click|stopPropagation={() => isArtistMenuOpen = !isArtistMenuOpen}
				>
					<Icon src={BsSearch} size="12" />
					Artiste
				</button>
				{#if isArtistMenuOpen}
					<!-- svelte-ignore a11y-no-static-element-interactions -->
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<div 
						class="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 p-3 z-50 normal-case tracking-normal"
						on:click|stopPropagation
					>
						<div class="flex items-center gap-2 bg-gray-50 px-2 py-1.5 rounded-lg mb-2">
							<Icon src={BsSearch} size="12" color="#999" />
							<input 
								type="text" 
								placeholder="Rechercher un artiste..." 
								class="bg-transparent border-none outline-none text-xs w-full text-gray-700 placeholder:text-gray-400"
								bind:value={artistSearch}
							/>
						</div>
						
						<div class="max-h-60 overflow-y-auto space-y-1 custom-scrollbar">
							{#if filteredArtists.length === 0}
								<div class="px-3 py-4 text-xs text-gray-400 text-center italic">
									Aucun artiste trouvé
								</div>
							{:else}
								<button 
									class="w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors {!currentArtist ? 'bg-orange-50 text-orange-600' : 'text-gray-500 hover:bg-gray-50'}"
									on:click={() => { handleArtistChange(''); isArtistMenuOpen = false; }}
								>
									Tous les artistes
								</button>
								{#each filteredArtists as artist}
									<button 
										class="w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors {currentArtist === artist ? 'bg-orange-50 text-orange-600 font-bold' : 'text-gray-600 hover:bg-gray-50'}"
										on:click={() => { handleArtistChange(artist); isArtistMenuOpen = false; }}
									>
										{artist}
									</button>
								{/each}
							{/if}
						</div>
					</div>
				{/if}
			</div>
		</div>
		
		<!-- Active Filters (Mobile Only) -->
		{#if (currentArtist || (currentCategory && currentCategory !== 'All'))}
			<div class="md:hidden flex flex-wrap gap-2">
				{#if currentCategory && currentCategory !== 'All'}
					<button 
						class="flex items-center gap-1.5 bg-orange-100 text-orange-600 px-3 py-1.5 rounded-full text-xs font-semibold"
						on:click={() => handleCategoryChange('All')}
					>
						<span>{currentCategory}</span>
						<Icon src={BsX} size="14" />
					</button>
				{/if}
				{#if currentArtist}
					<button 
						class="flex items-center gap-1.5 bg-orange-100 text-orange-600 px-3 py-1.5 rounded-full text-xs font-semibold"
						on:click={() => handleArtistChange('')}
					>
						<span class="max-w-[150px] truncate">{currentArtist}</span>
						<Icon src={BsX} size="14" />
					</button>
				{/if}
			</div>
		{/if}
	</div>

	<!-- Songs List -->
	<div class="bg-white rounded-xl shadow-sm border border-gray-100 min-h-[500px] flex flex-col">
		<div class="grid grid-cols-[30px_1fr_auto_auto] md:grid-cols-[30px_2.5fr_1.2fr_1fr_80px_auto_auto] gap-2 md:gap-4 px-3 md:px-4 py-3 border-b border-gray-100 text-[10px] md:text-[11px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50/50 rounded-t-xl">
			<div class="text-center">#</div>
			<button class="text-left flex items-center gap-1.5 hover:text-orange-500 transition-colors" on:click={() => handleSortChange('title')}>
				{#if currentSort.startsWith('title')}
					<span class="text-orange-500">
						<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
					</span>
				{/if}
				Titre
			</button>
			<button class="hidden md:flex text-left items-center gap-1.5 hover:text-orange-500 transition-colors" on:click={() => handleSortChange('category')}>
				{#if currentSort.startsWith('category')}
					<span class="text-orange-500">
						<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
					</span>
				{/if}
				Recueil
			</button>
			<div class="hidden md:flex relative items-center gap-1.5">
				<button 
					class="hover:text-orange-500 transition-colors flex items-center gap-1.5"
					on:click={() => isArtistMenuOpen = !isArtistMenuOpen}
				>
					{#if currentSort.startsWith('artist')}
						<span class="text-orange-500 font-bold">
							<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
						</span>
					{/if}
					Artiste
					{#if currentArtist}
						<span class="ml-1 bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-md text-[9px] lowercase">filtré</span>
					{/if}
				</button>

				{#if isArtistMenuOpen}
					<!-- svelte-ignore a11y-no-static-element-interactions -->
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<div 
						class="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 p-3 z-50 normal-case tracking-normal"
						on:click|stopPropagation
					>
						<div class="flex items-center gap-2 bg-gray-50 px-2 py-1.5 rounded-lg mb-2">
							<Icon src={BsSearch} size="12" color="#999" />
							<input 
								type="text" 
								placeholder="Rechercher un artiste..." 
								class="bg-transparent border-none outline-none text-xs w-full text-gray-700 placeholder:text-gray-400"
								bind:value={artistSearch}
							/>
						</div>
						
						<div class="max-h-60 overflow-y-auto space-y-1 custom-scrollbar">
							{#if filteredArtists.length === 0}
								<div class="px-3 py-4 text-xs text-gray-400 text-center italic">
									Aucun artiste trouvé
								</div>
							{:else}
								<button 
									class="w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors {!currentArtist ? 'bg-orange-50 text-orange-600' : 'text-gray-500 hover:bg-gray-50'}"
									on:click={() => { handleArtistChange(''); isArtistMenuOpen = false; }}
								>
									Tous les artistes
								</button>
								{#each filteredArtists as artist}
									<button 
										class="w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors {currentArtist === artist ? 'bg-orange-50 text-orange-600 font-bold' : 'text-gray-600 hover:bg-gray-50'}"
										on:click={() => { handleArtistChange(artist); isArtistMenuOpen = false; }}
									>
										{artist}
									</button>
								{/each}
							{/if}
						</div>
					</div>
					<!-- Backdrop -->
					<!-- svelte-ignore a11y-no-static-element-interactions -->
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<div class="fixed inset-0 z-40" on:click={() => isArtistMenuOpen = false}></div>
				{/if}
			</div>
			<button class="hidden md:flex text-center items-center justify-center gap-1.5 hover:text-orange-500 transition-colors" on:click={() => handleSortChange('duration')}>
				{#if currentSort.startsWith('duration')}
					<span class="text-orange-500">
						<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
					</span>
				{/if}
				Durée
			</button>
			<div class="w-10 text-center"></div>
			<div class="w-10 text-center flex items-center justify-center">
				<button 
					class="hover:scale-110 active:scale-95 transition-all {currentSort.startsWith('random') ? 'text-orange-500' : 'text-gray-300 hover:text-orange-400'}"
					on:click={() => handleSortChange('random')}
					title="Mélanger la liste"
				>
					<Icon src={BsShuffle} size="16" />
				</button>
			</div>
		</div>

		<div class="divide-y divide-gray-100">
			{#each musicList as song, i (song.s3_url || i)}
				{@const isActive = isSongActive(song, $selectAudio)}
				<!-- svelte-ignore a11y-click-events-have-key-events -->
				<!-- svelte-ignore a11y-no-static-element-interactions -->
				<div 
					class="grid grid-cols-[30px_1fr_auto_auto] md:grid-cols-[30px_2.5fr_1.2fr_1fr_80px_auto_auto] gap-2 md:gap-4 px-3 md:px-4 py-3 md:py-4 items-center transition-all group cursor-pointer {isActive ? 'bg-orange-50/80 border-l-4 border-l-orange-500' : 'hover:bg-gray-50'}"
					on:click={() => playSong(song, i)}
				>
					<div class="text-center text-[10px] md:text-xs font-bold {isActive ? 'text-orange-500' : 'text-gray-300'}">
						{i + 1 + (currentPage - 1) * limit}
					</div>
					<div class="flex flex-col min-w-0">
						<div class="text-sm font-bold line-clamp-1 transition-colors {isActive ? 'text-orange-600' : 'text-gray-800 group-hover:text-orange-500'}">
							{song.title || 'Sans titre'}
						</div>
						<div class="flex flex-row items-center gap-2 md:hidden overflow-hidden text-ellipsis whitespace-nowrap">
							<span class="text-[10px] font-medium {isActive ? 'text-orange-400' : 'text-gray-500'}">
								{song.book_full_name || song.category || '-'}
							</span>
							{#if song.artist}
								<span class="text-[10px] text-gray-300">•</span>
								<button 
									class="text-[10px] font-medium italic transition-colors {isActive ? 'text-orange-300 hover:text-orange-500' : 'text-gray-400 hover:text-orange-500'} {currentArtist === song.artist ? 'text-orange-500 underline' : ''}"
									on:click|stopPropagation={() => handleArtistChange(song.artist || '')}
								>
									{song.artist}
								</button>
							{/if}
						</div>
					</div>
					<div class="hidden md:block text-xs font-medium line-clamp-1 {isActive ? 'text-orange-400' : 'text-gray-500'}">
						{song.book_full_name || song.category || '-'}
					</div>
					<div class="hidden md:block text-xs font-medium line-clamp-1 italic {isActive ? 'text-orange-300' : 'text-gray-400'}">
						{#if song.artist}
							<button 
								class="hover:text-orange-500 transition-colors cursor-pointer {currentArtist === song.artist ? 'text-orange-500 font-bold underline' : ''}"
								on:click|stopPropagation={() => handleArtistChange(song.artist || '')}
							>
								{song.artist}
							</button>
						{:else}
							-
						{/if}
					</div>
					<div class="hidden md:block text-center text-xs font-mono {isActive ? 'text-orange-500' : 'text-gray-400'}">
						{song['duration'] ? formatTime(song['duration']) : '--:--'}
					</div>
					<div class="w-10 text-center">
						<button
							class="transition-colors p-2 {isActive ? 'text-orange-400 hover:text-orange-600' : 'text-gray-400 hover:text-orange-500'}"
							on:click|stopPropagation={() => downloadSong(song)}
							title="Télécharger"
						>
							<Icon src={IoCloudDownloadOutline} size="20" />
						</button>
					</div>
					<div class="w-10 text-center">
						<button
							class="hover:scale-110 active:scale-95 transition-all p-2 {isActive ? 'text-orange-600' : 'text-orange-500'}"
							on:click|stopPropagation={() => {
								if (isActive) {
									isPlaying.update(v => !v);
								} else {
									playSong(song, i);
								}
							}}
							title={isActive && $isPlaying ? 'Pause' : 'Lire'}
						>
							<Icon src={isActive && $isPlaying ? IoPauseCircle : IoPlayCircle} size="24" />
						</button>
					</div>
				</div>
			{:else}
				<div class="py-20 text-center">
					<div class="text-gray-200 mb-4 flex justify-center">
						<Icon src={BsSearch} size="64" />
					</div>
					<p class="text-gray-400 font-bold uppercase tracking-widest text-sm">Aucun chant trouvé</p>
				</div>
			{/each}
		</div>
	</div>

	<!-- Pagination -->
	{#if totalPages > 1}
		<div class="flex flex-col md:flex-row justify-between items-center mt-12 py-6 gap-6 text-[10px] md:text-xs font-bold text-gray-400 tracking-widest uppercase border-t border-gray-100">
			<div class="hidden md:block">
				Affichage de {musicList.length} sur {totalSongs} chants
			</div>
			
			<div class="flex flex-col md:flex-row items-center gap-6 md:gap-8 w-full md:w-auto">
				<div class="flex items-center gap-3">
					<span class="opacity-60">Lignes:</span>
					<select 
						class="bg-gray-100 rounded-lg px-3 py-1.5 outline-none text-gray-800 focus:ring-2 focus:ring-orange-500/20 transition-all cursor-pointer"
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
					<div class="flex items-center gap-1 bg-white p-1 rounded-xl border border-gray-100 shadow-sm">
						<button 
							class="px-3 py-1.5 rounded-lg hover:bg-orange-50 disabled:opacity-20 transition-all text-[10px] md:text-xs font-bold"
							disabled={currentPage === 1}
							on:click={() => goToPage(currentPage - 1)}
						>
							Précédent
						</button>
						
						{#if paginationPages[0] > 1}
							<button class="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-lg text-gray-400" disabled>...</button>
						{/if}

						{#each paginationPages as p}
							<button 
								class="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-lg transition-all text-[10px] md:text-xs font-bold {currentPage === p ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20' : 'hover:bg-gray-50 text-gray-600'}"
								on:click={() => goToPage(p)}
							>
								{p}
							</button>
						{/each}

						{#if paginationPages[paginationPages.length - 1] < totalPages}
							<button class="w-8 h-8 md:w-9 md:h-9 flex items-center justify-center rounded-lg text-gray-400" disabled>...</button>
						{/if}

						<button 
							class="px-3 py-1.5 rounded-lg hover:bg-orange-50 disabled:opacity-20 transition-all text-[10px] md:text-xs font-bold"
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

<style>
	/* Hide scrollbar for Chrome, Safari and Opera */
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}

	/* Hide scrollbar for IE, Edge and Firefox */
	.no-scrollbar {
		-ms-overflow-style: none;  /* IE and Edge */
		scrollbar-width: none;  /* Firefox */
	}
</style>
