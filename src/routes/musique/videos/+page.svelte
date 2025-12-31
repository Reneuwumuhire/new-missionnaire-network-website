<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { YoutubeVideo } from '$lib/models/youtube';
	import SongVideoCard from '$lib/components/+songVideoCard.svelte';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsSearch from 'svelte-icons-pack/bs/BsSearch';
	import BsX from 'svelte-icons-pack/bs/BsX';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	export let data;

	let loadedVideos: YoutubeVideo[] = [];
	let skipCount = 0;
	let isLoading = false;
	let hasMore = true;
	let searchInput = '';
	let lastSearch = '';

	// Sync with server-side data on initial load or search/navigation change
	$: if (data) {
		if (data.search !== lastSearch || loadedVideos.length === 0) {
			console.log('[Videos] Data context changed, syncing', { search: data.search, count: data.videos?.length });
			lastSearch = data.search || '';
			loadedVideos = [...(data.videos || [])];
			skipCount = loadedVideos.length;
			hasMore = loadedVideos.length < data.total;
			searchInput = lastSearch;
		}
	}

	async function loadMoreVideos() {
		if (isLoading || !hasMore) return;
		
		console.log('[Videos] Attempting to load more...', { skip: skipCount, currentCount: loadedVideos.length, total: data.total });
		isLoading = true;

		try {
			const queryParams = new URLSearchParams({
				type: 'song',
				search: lastSearch,
				maxResults: '20',
				skip: skipCount.toString()
			});

			const response = await fetch(`/api/yt/videos?${queryParams.toString()}`);
			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
			
			const result = await response.json();
			console.log('[Videos] API response received', { itemsCount: result.data?.length, total: result.total });
			
			if (result.data && result.data.length > 0) {
				// Avoid duplicates based on _id
				const newVideos = result.data.filter(
					(v: YoutubeVideo) => !loadedVideos.some((ev) => ev._id === v._id)
				);
				
				if (newVideos.length > 0) {
					loadedVideos = [...loadedVideos, ...newVideos];
					skipCount += result.data.length; // Use total returned count for skip
					hasMore = loadedVideos.length < result.total;
				} else {
					console.log('[Videos] All items received were already in list');
					hasMore = false; // Stop if we get only duplicates
				}
			} else {
				console.log('[Videos] No items returned');
				hasMore = false;
			}
		} catch (error) {
			console.error('[Videos] Error loading more videos:', error);
			hasMore = false;
		} finally {
			isLoading = false;
		}
	}

	let searchTimeout: any;

	function handleSearch(immediate = false) {
		if (searchTimeout) clearTimeout(searchTimeout);
		
		const performSearch = () => {
			if (searchInput === lastSearch) return;
			console.log('[Videos] Performing search', { searchInput });
			goto(`?search=${encodeURIComponent(searchInput)}`, { keepFocus: true, noScroll: true });
		};

		if (immediate) {
			performSearch();
		} else {
			searchTimeout = setTimeout(performSearch, 400);
		}
	}

	function intersectionObserver(node: HTMLElement) {
		if (!browser) return;
		console.log('[Videos] Observer attached to node');
		
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) {
					console.log('[Videos] Element in view', { hasMore, isLoading });
					if (hasMore && !isLoading) {
						loadMoreVideos();
					}
				}
			},
			{ threshold: 0.1, rootMargin: '400px' }
		);

		observer.observe(node);

		return {
			destroy() {
				console.log('[Videos] Observer detached');
				observer.disconnect();
			}
		};
	}
</script>

<svelte:head>
	<title>Chants en Vidéo - Missionnaire Network</title>
</svelte:head>

<div class="container mx-auto px-2 md:px-4 py-8 max-w-7xl">
	<div class="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
		<h2 class="text-3xl font-black text-gray-800">Chants en Vidéo</h2>
		
		<div class="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-xl shadow-sm w-full md:w-96">
			<Icon src={BsSearch} size="16" color="#94a3b8" />
			<input 
				type="text" 
				placeholder="Rechercher une vidéo..." 
				class="bg-transparent border-none outline-none text-sm w-full text-gray-700"
				bind:value={searchInput}
				on:input={() => handleSearch()}
			/>
			{#if searchInput}
				<button on:click={() => { searchInput = ''; handleSearch(true); }}>
					<Icon src={BsX} size="18" color="#94a3b8" />
				</button>
			{/if}
		</div>
	</div>

	{#if loadedVideos.length > 0}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
			{#each loadedVideos as video (video._id)}
				<SongVideoCard videoData={video} />
			{/each}
		</div>

		{#if hasMore}
			<div use:intersectionObserver class="flex flex-col items-center justify-center py-12 gap-4">
				{#if isLoading}
					<div class="animate-spin rounded-full h-10 w-10 border-t-4 border-b-4 border-orange-500" />
					<p class="text-[10px] font-black text-orange-500 uppercase tracking-widest">Chargement...</p>
				{:else}
					<!-- Manual fallback button just in case -->
					<button 
						on:click={loadMoreVideos}
						class="text-[10px] font-black text-gray-400 hover:text-orange-500 uppercase tracking-widest transition-colors"
					>
						Charger plus de vidéos
					</button>
				{/if}
			</div>
		{:else}
			<div class="text-center w-full py-20 border-t border-gray-50 mt-12">
				<p class="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em]">Fin de la collection</p>
			</div>
		{/if}
	{:else if !isLoading}
		<div class="py-40 text-center">
			<div class="text-gray-200 mb-6 flex justify-center">
				<Icon src={BsSearch} size="80" />
			</div>
			<p class="text-gray-400 font-black uppercase tracking-[0.2em] text-sm">Aucune vidéo trouvée pour "{lastSearch}"</p>
			<button 
				on:click={() => { searchInput = ''; handleSearch(); }}
				class="mt-6 text-orange-500 font-bold hover:underline"
			>
				Voir tout
			</button>
		</div>
	{/if}
</div>
