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
	<title>Missionnaire Network - Accueil</title>
	<meta name="description" content="Bienvenue sur Missionnaire Network. Découvrez les prédications et cantiques du Message de l'Heure." />
	<meta property="og:title" content="Missionnaire Network - Accueil" />
	<meta property="og:description" content="Découvrez les prédications et cantiques du Message de l'Heure." />
</svelte:head>

<main class="relative max-w-[1640px] mx-auto px-5">
	<div class="mt-24">
		{#if $isInitialLoading}
			<div class="flex items-center justify-center min-h-screen">
				<div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary" />
			</div>
		{:else}
			{#if $selectedVideo !== undefined}
				<VideoView />
			{/if}

			{#if $filteredVideos.length > 0}
				<div class="grid grid-cols-1 sm:px-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
					{#each $filteredVideos as video, index (video._id + '-' + index)}
						<button on:click={() => videoSelected(video)} class="text-left">
							<ThumbnailVideo {video} {index} />
						</button>
					{/each}
				</div>
				{#if $hasMore}
					<div use:intersectionObserver class="h-10" />
				{/if}
				{#if $isLoading}
					<HomepageLoadingSkelton />
				{:else if !$hasMore}
					<div class="text-center w-full py-8">
						<p class="text-primary font-bold">*******************</p>
					</div>
				{/if}
			{/if}
		{/if}
	</div>
</main>
