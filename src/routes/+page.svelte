<script lang="ts">
	import { browser } from '$app/environment';
	import { derived, get } from 'svelte/store';
	import { currentViewingVideo } from '$lib/stores/global';
	import '../app.css';
	import ThumbnailVideo from '$lib/components/+thumbnailVideo.svelte';
	import VideoView from '$lib/components/+videoView.svelte';
	// import CalendarWeekly from '$lib/components/+calendarWeekly.svelte';
	import type { YoutubeVideo } from '$lib/models/youtube';
	import HomepageLoadingSkelton from '$lib/components/+homepageLoadingSkelton.svelte';
	import { availableTypesTag } from '../utils/data';
	import { searchTerm, selectedVideo, skip } from '$lib/stores/videoStore';
	import { onMount } from 'svelte';
	import {
		activeFilter,
		isLoading,
		isInitialLoading,
		videos,
		hasMore
	} from '$lib/stores/videoStore';
	import { fetchInitialVideos, fetchMoreVideos, resetPagination } from '../utils/videoUtils';
    import Icon from 'svelte-icons-pack/Icon.svelte';
    import IoMusicalNotes from 'svelte-icons-pack/io/IoMusicalNotes';
    import IoBookOutline from 'svelte-icons-pack/io/IoBookOutline';
    import IoMicOutline from 'svelte-icons-pack/io/IoMicOutline';
    import IoInformationCircleOutline from 'svelte-icons-pack/io/IoInformationCircleOutline';

	let titleName: string = 'Missionnaire network';
	/** @type {import('./$types').PageData} */
	export let data: { data: YoutubeVideo[] };

	const limit = 20;

	const tagLabelMap = new Map<string, string>();
	$: availableTypesTag.forEach((type) => {
		type.value.forEach((value) => {
			tagLabelMap.set(value, type.label);
		});
	});

	function debounce(func: Function, wait: number) {
		let timeout: NodeJS.Timeout;
		return function executedFunction(...args: any[]) {
			const later = () => {
				clearTimeout(timeout);
				func(...args);
			};
			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
		};
	}

	let observer: IntersectionObserver;
	let observerTarget: HTMLElement;

	function setupIntersectionObserver() {
		if (browser) {
			// Add check for existing observer
			observer = new IntersectionObserver(
				(entries) => {
					if (entries[0].isIntersecting && $hasMore && !$isLoading) {
						fetchMoreVideos();
					}
				},
				{
					threshold: 0.1,
					rootMargin: '100px' // Add rootMargin to trigger loading earlier
				}
			);

			if (observerTarget) {
				observer.observe(observerTarget);
			}
		}
	}

	function intersectionObserver(node: HTMLElement) {
		observerTarget = node;
		setupIntersectionObserver();

		return {
			destroy() {
				if (observer) {
					observer.disconnect();
				}
			}
		};
	}

	$: videoSelected = (video: YoutubeVideo) => {
		selectedVideo.set(video);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	};

	$: currentViewingVideo.subscribe((value) => {
		selectedVideo.set(value);
	});

	$: filteredVideos = derived(
		[videos, activeFilter, searchTerm],
		([$videos, $activeFilter, $searchTerm]) =>
			$videos.filter((video) => {
				const matchesFilter =
					$activeFilter === '' ||
					video.tags.some(
						(tag: string | undefined) => $activeFilter === tagLabelMap.get(tag as string) || 'All'
					) ||
					($activeFilter === 'All' &&
						availableTypesTag[0].value.some((tag) => video.tags.includes(tag)));

				const matchesSearch =
					$searchTerm.trim() === '' ||
					video.title.toLowerCase().includes($searchTerm.toLowerCase()) ||
					video.description.toLowerCase().includes($searchTerm.toLowerCase());

				return matchesFilter && matchesSearch;
			})
	);

	const handleSearch = debounce(async (searchValue: string) => {
		searchTerm.set(searchValue);
		resetPagination();
		await fetchInitialVideos();
	}, 500);

	onMount(() => {
		if (browser) {
			const url = new URL(window.location.href);
			const filterParam = url.searchParams.get('filter');
			const searchParam = url.searchParams.get('search');

			// Initialize videos with server-side data first
			if (data.data && data.data.length > 0) {
				videos.set(data.data);
				if (data.data.length < limit) {
					hasMore.set(false);
				} else {
					skip.set(limit);
				}
			}

			// Then set the filters and search terms
			if (filterParam) {
				activeFilter.set(filterParam);
				fetchInitialVideos(); // Add this line to fetch when filter is set from URL
			}
			if (searchParam) {
				searchTerm.set(searchParam);
			} else {
				// Only fetch initial videos if there's no search term and no filter
				if (!filterParam) {
					fetchInitialVideos();
				}
			}

			window.addEventListener('search', handleSearch);
			isLoading.set(false);
			isInitialLoading.set(false);
		}
	});

	// Modify the reactive statement to prevent unnecessary initial load
	$: if ($searchTerm !== undefined && browser) {
		const searchValue = $searchTerm;
		if (searchValue !== '') {
			selectedVideo.set(undefined);
			handleSearch(searchValue);
		}
	}
</script>

<svelte:head>
	<title>Missionnaire Network - Accueil | Prédications et Cantiques du Message</title>
	<meta name="description" content="Bienvenue sur Missionnaire Network. Découvrez les prédications and cantiques inspirants du Message de l'Heure pour votre édification spirituelle." />
	<meta property="og:title" content="Missionnaire Network - Accueil | Prédications et Cantiques du Message" />
	<meta property="og:description" content="Découvrez les prédications et cantiques inspirants du Message de l'Heure pour votre édification spirituelle." />
</svelte:head>

<main class="relative max-w-[1640px] mx-auto px-5">
	<div class="mt-8 mb-20">
		{#if $isInitialLoading}
			<HomepageLoadingSkelton />
		{:else}
			{#if $selectedVideo !== undefined}
				<div class="mb-12">
					<VideoView />
				</div>
			{/if}

			{#if $filteredVideos.length > 0}
				<!-- Hero Section (First Video) -->
				{#if !$selectedVideo && $filteredVideos[0]}
					<button 
						class="relative w-full h-[50vh] min-h-[400px] max-h-[600px] rounded-3xl overflow-hidden mb-16 group text-left shadow-2xl transition-all hover:shadow-orange-500/10 block"
						on:click={() => videoSelected($filteredVideos[0])}
					>
						<!-- Background Image -->
						<img 
							src={$filteredVideos[0].thumbnail_max2 || $filteredVideos[0].thumbnail} 
							alt={$filteredVideos[0].title}
							class="absolute inset-0 w-full h-full object-cover transform transition-transform duration-700 group-hover:scale-105"
						/>
						
						<!-- Gradient Overlay -->
						<div class="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-90 group-hover:opacity-80 transition-opacity"></div>

						<!-- Content -->
						<div class="absolute bottom-0 left-0 w-full p-6 md:p-12 text-white">
							<div class="max-w-4xl space-y-4">
								<div class="inline-block px-3 py-1 bg-orange-500 rounded-full text-xs font-bold uppercase tracking-widest mb-2">
									À la une
								</div>
								<h1 class="text-3xl md:text-5xl lg:text-6xl font-black leading-tight tracking-tight line-clamp-2 group-hover:text-orange-100 transition-colors">
									{$filteredVideos[0].title}
								</h1>
								<p class="text-white/80 text-sm md:text-lg line-clamp-2 max-w-2xl font-medium">
									{$filteredVideos[0].description}
								</p>
								
								<div class="pt-6 flex items-center gap-4">
									<div class="px-8 py-4 bg-white text-black rounded-full font-bold text-sm uppercase tracking-wider transition-transform group-hover:scale-105 hidden sm:block">
										Regarder maintenant
									</div>
                                    <div class="px-8 py-4 bg-white/10 backdrop-blur-md text-white border border-white/20 rounded-full font-bold text-sm uppercase tracking-wider flex items-center gap-2">
                                        <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                                        {$filteredVideos[0].duration_string || 'Vidéo'}
                                    </div>
								</div>
							</div>
						</div>
					</button>
				{/if}

                <!-- Quick Navigation -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-20 px-2">
                    <a href="/predications" class="group flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-orange-200 hover:shadow-orange-500/10 transition-all hover:-translate-y-1">
                        <div class="w-12 h-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <Icon src={IoMicOutline} size="24" />
                        </div>
                        <span class="font-bold text-gray-800 group-hover:text-orange-600 transition-colors">Prédications</span>
                    </a>
                    
                    <a href="/musique" class="group flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-orange-200 hover:shadow-orange-500/10 transition-all hover:-translate-y-1">
                        <div class="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <Icon src={IoMusicalNotes} size="24" />
                        </div>
                        <span class="font-bold text-gray-800 group-hover:text-blue-600 transition-colors">Musique</span>
                    </a>

                   <a href="/literature" class="group flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-orange-200 hover:shadow-orange-500/10 transition-all hover:-translate-y-1">
                        <div class="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <Icon src={IoBookOutline} size="24" />
                        </div>
                        <span class="font-bold text-gray-800 group-hover:text-green-600 transition-colors">Littérature</span>
                    </a>

                    <a href="/a-propos" class="group flex flex-col items-center justify-center p-6 bg-white rounded-2xl shadow-sm border border-gray-100 hover:border-orange-200 hover:shadow-orange-500/10 transition-all hover:-translate-y-1">
                        <div class="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            <Icon src={IoInformationCircleOutline} size="24" />
                        </div>
                        <span class="font-bold text-gray-800 group-hover:text-purple-600 transition-colors">À Propos</span>
                    </a>
                </div>

				<!-- Section Title -->
                <div class="flex items-end justify-between mb-8 px-2">
                    <div>
                        <h2 class="text-xs font-black text-orange-500 uppercase tracking-[0.2em] mb-2">Découvrir</h2>
                        <h3 class="text-2xl md:text-3xl font-bold text-gray-900">Vidéos Récentes</h3>
                    </div>
                </div>

				<!-- Grid (Remaining Videos) -->
				<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
					{#each $filteredVideos.slice($selectedVideo ? 0 : 1) as video, index (video._id)}
						<button on:click={() => videoSelected(video)} class="text-left group video-card">
							<ThumbnailVideo {video} index={index + ($selectedVideo ? 0 : 1)} />
						</button>
					{/each}
				</div>

				{#if $hasMore}
					<div use:intersectionObserver class="h-20 w-full flex items-center justify-center mt-12">
                        {#if $isLoading}
                            <div class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
                        {/if}
                    </div>
				{/if}

				{#if !$hasMore && !$isLoading}
					<div class="text-center w-full py-20 opacity-50">
						<div class="w-16 h-1 bg-gray-200 mx-auto rounded-full mb-4"></div>
						<p class="text-xs font-bold uppercase tracking-widest text-gray-400">Fin de la liste</p>
					</div>
				{/if}
			{:else}
                 <!-- Empty State -->
                <div class="flex flex-col items-center justify-center py-32 text-center text-gray-400">
                    <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-2xl">🔍</div>
                    <p>Aucune vidéo trouvée</p>
                </div>
            {/if}
		{/if}
	</div>
</main>
