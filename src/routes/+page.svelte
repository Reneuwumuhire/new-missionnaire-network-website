<script lang="ts">
	import { onMount } from 'svelte';
	import { writable } from 'svelte/store';
	import { createInfiniteQuery, useQueryClient } from '@tanstack/svelte-query';
	import { currentViewingVideo, filteredVideos } from '$lib/stores/global';
	import { searchTerm } from '$lib/stores/videoStore';
	import { PUBLIC_MAIN_URL } from '$env/static/public';
	import '../app.css';
	import ThumbnailVideo from '$lib/components/+thumbnailVideo.svelte';
	import VideoView from '$lib/components/+videoView.svelte';
	import CalendarWeekly from '$lib/components/+calendarWeekly.svelte';
	import type { YoutubeVideo } from '@mnlib/lib/models/youtube';
	import Chart3 from 'iconsax-svelte/Chart3.svelte';
	import HomepageLoadingSkelton from '$lib/components/+homepageLoadingSkelton.svelte';
	import { availableTypes } from '../utils/data';

	const urlEndpoint = PUBLIC_MAIN_URL;

	const requestOptions = {
		method: 'GET'
	};

	const limit = 20;
	let titleName: string = 'Missionnaire network';
	let upComingEventData: YoutubeVideo[];
	let selectedVideo: YoutubeVideo;

	const currentTag = writable<any>(availableTypes[0].value);
	// Store to keep track of page numbers for each tag
	const tagPageNumbers = writable<Record<string, number>>({});
	// Store to keep track of video counts for each tag
	const tagCounts = writable<Record<string, number>>({});
	let allVideos: YoutubeVideo[] = [];

	$: videoSelected = (video: YoutubeVideo) => {
		currentViewingVideo.update(() => video);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	};

	$: currentViewingVideo.subscribe((value) => {
		selectedVideo = value;
	});

	interface ResponseData {
		value: YoutubeVideo[];
		nextPageParam: number | null;
		message?: Error;
	}

	$: updateTagCounts = (videos: YoutubeVideo[]) => {
		const newCounts: Record<string, number> = { any: videos.length };
		videos.forEach((video) => {
			video.tags.forEach((tag) => {
				newCounts[tag] = (newCounts[tag] || 0) + 1;
			});
		});
		tagCounts.set(newCounts);
	};

	const fetchVideos = async ({
		pageParam = 1,
		queryKey
	}: {
		pageParam?: number;
		queryKey: any[];
	}): Promise<ResponseData> => {
		const [_, type] = queryKey;
		const searchTags = Array.isArray(type) ? type.join(',') : type;
		// Use the tag-specific page number
		const tagKey = JSON.stringify(type);
		const currentPageNumber = $tagPageNumbers[tagKey] || 1;

		const response = await fetch(
			`${urlEndpoint}api/yt/videos/query?limit=${limit}&pageNumber=${currentPageNumber}&searchTags=${searchTags}`,
			requestOptions
		);
		let data: ResponseData = await response.json();
		// Update allVideos
		allVideos = [
			...allVideos,
			...data.value.filter(
				(newVideo) => !allVideos.some((existingVideo) => existingVideo.id === newVideo.id)
			)
		];

		// Update filteredVideos
		filteredVideos.update((currentVideos) => {
			const newVideos = data.value.filter(
				(newVideo) => !currentVideos.some((existingVideo) => existingVideo.id === newVideo.id)
			);
			return [...currentVideos, ...newVideos];
		});

		// Update tag counts based on all videos
		updateTagCounts(allVideos);

		// Increment the page number for this tag
		tagPageNumbers.update((numbers) => ({
			...numbers,
			[tagKey]: currentPageNumber + 1
		}));

		return {
			value: data.value,
			nextPageParam: data.value.length === limit ? currentPageNumber + 1 : null,
			message: new Error(data.message instanceof Error ? data.message.message : data.message)
		};
	};

	const queryClient = useQueryClient();

	$: videoQueryInfinity = createInfiniteQuery({
		queryKey: ['videos', $currentTag],
		queryFn: fetchVideos,
		getNextPageParam: (lastPage) => lastPage.nextPageParam,
		initialPageParam: 1,
		refetchOnWindowFocus: false
	});

	onMount(() => {
		$searchTerm = '';
		$filteredVideos = [];
		if ($videoQueryInfinity.data) filteredVideos.set($videoQueryInfinity.data.pages[0].value);
	});

	$: filteredAndSearchedVideos = $filteredVideos
		? $filteredVideos.filter((video) => {
				const titleMatch = video.title.toLowerCase().includes($searchTerm.toLowerCase());
				const tagMatch =
					$currentTag === 'any' ||
					(Array.isArray($currentTag)
						? $currentTag.some((tag: any) => video.tags.includes(tag))
						: video.tags.includes($currentTag));
				return titleMatch && tagMatch;
		  })
		: [];

	$: handleTypeChange = (value: any) => {
		currentTag.set(value);

		const tagKey = JSON.stringify(value);
		const currentPageNumber = $tagPageNumbers[tagKey] || 1;

		videoQueryInfinity = createInfiniteQuery({
			queryKey: ['videos', value],
			queryFn: fetchVideos,
			getNextPageParam: (lastPage) => lastPage.nextPageParam,
			initialPageParam: currentPageNumber,
			refetchOnWindowFocus: false
		});
	};

	const loadMore = () => {
		$videoQueryInfinity.fetchNextPage();
	};

	$: getTagCountKey = (value: string | string[]): string => {
		return Array.isArray(value) ? value.join(',') : value;
	};
</script>

<svelte:head>
	<title>{titleName}</title>
</svelte:head>

<main
	class="align-middle flex flex-col items-center justify-center max-w-[1640px] mx-auto px-5 mt-[130px] relative"
>
	<div class="items-end justify-end text-right self-start mb-6">
		<div class="w-full fixed bg-white py-4 -mt-[74px]">
			<div class="flex flex-row space-x-2 overflow-x-scroll hide-scrollbar">
				{#each availableTypes as { label, value }, index}
					<button
						type="button"
						class={`px-4 py-2 rounded-lg cursor-pointer transition-colors duration-300 text-sm whitespace-nowrap  ${
							JSON.stringify(value) === JSON.stringify($currentTag)
								? 'text-white bg-black'
								: 'text-black bg-gray-100'
						}`}
						on:click={() => handleTypeChange(value)}
					>
						{label}
						{#if $tagCounts[getTagCountKey(value)] !== undefined}
							<span class="ml-1 text-xs">
								({$tagCounts[getTagCountKey(value)] > 999
									? `${($tagCounts[getTagCountKey(value)] / 1000).toFixed(1)}k`
									: $tagCounts[getTagCountKey(value)]})
							</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>

	{#if $videoQueryInfinity.isPending || $videoQueryInfinity.isLoading || filteredAndSearchedVideos.length < 0}
		<HomepageLoadingSkelton />
	{:else if $videoQueryInfinity.isSuccess}
		{#if selectedVideo}
			<VideoView selectedVideoStore={selectedVideo} />
		{/if}
		{#if upComingEventData && upComingEventData.length > 0}
			<CalendarWeekly {upComingEventData} />
		{/if}

		{#if filteredAndSearchedVideos && filteredAndSearchedVideos.length > 0}
			<div class=" grid grid-cols-1 sm:px-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
				{#each filteredAndSearchedVideos as video, index (video.id + '-' + index)}
					<button on:click={() => videoSelected(video)} class="text-left">
						<ThumbnailVideo {video} {index} />
					</button>
				{/each}
			</div>
		{:else}
			<div class="text-center w-full items-center justify-center">
				<p class="text-gray-500">No videos found for the selected filters.</p>
			</div>
		{/if}

		<div
			class="mt-10 bg-gray-100 hover:bg-gray-200 transition-all duration-500 p-4 rounded-xl text-sm"
		>
			<button
				on:click={loadMore}
				class={`${
					$videoQueryInfinity.isFetching ? 'disabled' : ''
				} flex flex-row space-x-4 items-center justify-center`}
			>
				{#if $videoQueryInfinity.isFetching}
					<div class="relative flex items-center justify-center w-f animate-spin">
						<Chart3 size={20} color="#fb923c" variant="Linear" />
					</div>
					<span class="flex whitespace-nowrap"> Loading more... </span>
				{:else}
					Load More
				{/if}
			</button>
		</div>
	{/if}
</main>
