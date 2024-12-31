<script lang="ts">
	import { browser } from '$app/environment';
	import { writable, derived } from 'svelte/store';
	import { currentViewingVideo } from '$lib/stores/global';
	import '../app.css';
	import ThumbnailVideo from '$lib/components/+thumbnailVideo.svelte';
	import VideoView from '$lib/components/+videoView.svelte';
	// import CalendarWeekly from '$lib/components/+calendarWeekly.svelte';
	import type { YoutubeVideo } from '@mnlib/lib/models/youtube';
	import HomepageLoadingSkelton from '$lib/components/+homepageLoadingSkelton.svelte';
	import { availableTypesTag } from '../utils/data';
	import { searchTerm } from '$lib/stores/videoStore';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let titleName: string = 'Missionnaire network';
	/** @type {import('./$types').PageData} */
	export let data: { data: YoutubeVideo[] };

	const activeFilter = writable('All');
	const videos = writable<any[]>([]);
	const isLoading = writable(false);
	const hasMore = writable(true);
	const skip = writable(0);
	const limit = 20;
	let isInitialLoading = writable(true);

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

	function resetPagination() {
		skip.set(0);
		videos.set([]);
		hasMore.set(true);
	}

	let observer: IntersectionObserver;
	let observerTarget: HTMLElement;

	function setupIntersectionObserver() {
		if (browser) {
			observer = new IntersectionObserver(
				(entries) => {
					if (entries[0].isIntersecting && $hasMore && !$isLoading) {
						fetchMoreVideos();
					}
				},
				{ threshold: 0.1 }
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

	let selectedVideo: YoutubeVideo | undefined;

	$: videoSelected = (video: YoutubeVideo) => {
		currentViewingVideo.set(video);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	};

	$: currentViewingVideo.subscribe((value) => {
		selectedVideo = value;
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

	function updateURL(filter: string) {
		const url = new URL(window.location.href);
		if (filter) {
			if (filter === 'All') {
				url.searchParams.delete('filter');
			} else {
				url.searchParams.set('filter', filter);
			}
		} else {
			url.searchParams.delete('filter');
		}

		if ($searchTerm !== '') {
			url.searchParams.set('search', $searchTerm);
		} else {
			url.searchParams.delete('search');
		}

		goto(url.toString(), { replaceState: true });
	}

	const handleSearch = debounce(async (searchValue: string) => {
		searchTerm.set(searchValue);
		resetPagination();
		await fetchInitialVideos();
	}, 500);

	async function setFilter(filter: string) {
		if ($activeFilter === filter) return;

		activeFilter.set(filter);
		resetPagination();
		await fetchInitialVideos();
		updateURL(filter);
	}

	async function fetchInitialVideos() {
		const startTime = performance.now();
		console.log(`[Client] Starting fetch at ${new Date().toISOString()}`);

		isLoading.set(true);
		isInitialLoading.set(true);

		try {
			const queryString = new URLSearchParams({
				skip: '0',
				filter: $activeFilter,
				search: $searchTerm.trim()
			}).toString();

			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout

			const response = await fetch(`/pagination?${queryString}`, {
				signal: controller.signal
			});
			clearTimeout(timeoutId);

			const responseData = await response.json();

			console.log('[Client] Response stats:', {
				totalTime: performance.now() - startTime,
				serverTime: responseData.timing,
				queryTime: responseData.queryTime,
				resultCount: responseData.data?.length || 0
			});

			videos.set(responseData.data);

			if (responseData.data.length < limit) {
				hasMore.set(false);
			} else {
				skip.set(limit);
			}
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				console.error('[Client] Request timed out after 20 seconds');
			} else {
				console.error('[Client] Error fetching videos:', error);
			}
			hasMore.set(false);
		} finally {
			isLoading.set(false);
			isInitialLoading.set(false);
		}
	}

	async function fetchMoreVideos() {
		if ($isLoading || !$hasMore) return;

		isLoading.set(true);
		try {
			const queryString = new URLSearchParams({
				skip: $skip.toString(),
				filter: $activeFilter,
				search: $searchTerm || ''
			}).toString();

			const response = await fetch(`/pagination?${queryString}`);
			const responseData = await response.json();

			if (responseData.data.length > 0) {
				videos.update((v) => [...v, ...responseData.data]);
				skip.update((s) => s + limit);
			}

			if (responseData.data.length < limit) {
				hasMore.set(false);
			}
		} catch (error) {
			console.error('Error fetching more videos:', error);
			hasMore.set(false);
		} finally {
			isLoading.set(false);
		}
	}

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
			}
			if (searchParam) {
				searchTerm.set(searchParam);
			} else {
				// Only fetch initial videos if there's no search term
				// This prevents double-loading due to the searchTerm reactive statement
				fetchInitialVideos();
			}

			window.addEventListener('search', handleSearch);
			isInitialLoading.set(false);
		}
	});

	// Modify the reactive statement to prevent unnecessary initial load
	$: if ($searchTerm !== undefined && browser) {
		const searchValue = $searchTerm;
		if (searchValue !== '') {
			handleSearch(searchValue);
		}
	}
</script>

<svelte:head>
	<title>{titleName}</title>
</svelte:head>

<main
	class="align-middle flex flex-col items-center justify-center max-w-[1640px] mx-auto px-5 mt-[70px] relative"
>
	<div class="sticky top-0 bg-white z-10 w-full py-4 mb-6">
		<div class="flex flex-wrap gap-2 items-center">
			{#each availableTypesTag as tagType}
				<button
					class="px-3 py-1 rounded-full text-sm {$activeFilter === tagType.label
						? 'bg-hardBlack text-white'
						: 'bg-gray-200 text-gray-700'}"
					on:click={() => {
						setFilter(tagType.label);
					}}
				>
					{tagType.label}
				</button>
			{/each}
			{#if $isLoading || $isInitialLoading}
				<div class="inline-block">
					<div class="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-gray-900" />
				</div>
			{/if}
		</div>
	</div>

	{#if $isInitialLoading}
		<div class="flex items-center justify-center min-h-screen">
			<div class="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-gray-900" />
		</div>
	{:else}
		{#if selectedVideo}
			<VideoView selectedVideoStore={selectedVideo} />
		{/if}

		{#if $filteredVideos.length > 0}
			<div class="grid grid-cols-1 sm:px-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
				{#each $filteredVideos as video, index (video._id)}
					<button on:click={() => videoSelected(video)} class="text-left">
						<ThumbnailVideo {video} {index} />
					</button>
				{/each}
			</div>
			{#if $isLoading}
				<HomepageLoadingSkelton />
			{:else if !$hasMore}
				<div class="text-center w-full py-8">
					<p class="text-gray-500 font-bold">**** End of list ****</p>
				</div>
			{/if}
		{:else if !$isLoading}
			<div class="text-center w-full items-center justify-center">
				<p class="text-gray-500">No videos found for the selected filters.</p>
			</div>
		{/if}
	{/if}

	{#if $hasMore}
		<div use:intersectionObserver class="h-10" />
	{/if}
</main>
