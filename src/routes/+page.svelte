<script lang="ts">
	import { currentViewingVideo, filteredVideos } from '$lib/stores/global';
	import '../app.css';
	import ThumbnailVideo from '$lib/components/+thumbnailVideo.svelte';
	import VideoView from '$lib/components/+videoView.svelte';
	import CalendarWeekly from '$lib/components/+calendarWeekly.svelte';
	import type { YoutubeVideo } from '@mnlib/lib/models/youtube';
	import Chart3 from 'iconsax-svelte/Chart3.svelte';
	import HomepageLoadingSkelton from '$lib/components/+homepageLoadingSkelton.svelte';
	import { searchTerm } from '$lib/stores/videoStore';
	import { PUBLIC_MAIN_URL } from '$env/static/public';
	import { createInfiniteQuery } from '@tanstack/svelte-query';
	import { onMount } from 'svelte';

	let titleName: any = 'Missionnaire network';

	const availableTypes = [
		{
			label: 'All',
			value: ['retransmission', 'branham', 'frank', 'local', 'lettre']
		},
		{
			label: 'Retransimission',
			value: ['retransmission']
		},
		{
			label: 'William Branham',
			value: ['william']
		},
		{
			label: 'Ewald Frank',
			value: ['ewald']
		},
		{
			label: 'Local',
			value: ['local']
		},
		{
			label: 'Lettre circulaire',
			value: ['lettre']
		}
	];

	let upComingEventData: YoutubeVideo[];
	let selectedType: any = availableTypes[0].value;

	$: videoSelected = (video: YoutubeVideo) => {
		currentViewingVideo.update(() => video);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	};

	let selectedVideo: YoutubeVideo;

	$: currentViewingVideo.subscribe((value) => {
		selectedVideo = value;
	});

	var requestOptions = {
		method: 'GET'
	};

	const limit = 20;
	interface ResponseData {
		value: YoutubeVideo[];
		nextPageParam: number | null;
		message?: Error;
	}
	const urlEndpoint = PUBLIC_MAIN_URL;
	const fetchVideos = async ({ pageParam = 1 }: { pageParam?: number }): Promise<ResponseData> => {
		const response = await fetch(
			`${urlEndpoint}api/yt/videos/query?limit=${limit}&pageNumber=${pageParam}&searchTags=${selectedType}`,
			requestOptions
		);
		const data: ResponseData = await response.json();
		// Filter the newly fetched videos based on searchTerm and selectedType
		const filteredNewVideos = data.value.filter((video) => {
			const titleMatch = video.title.toLowerCase().includes($searchTerm.toLowerCase());
			const tagMatch = selectedType.some((tag: any) => video.tags.includes(tag));
			return titleMatch && tagMatch;
		});

		// Update the filteredVideos store with the filtered new videos
		await filteredVideos.update((currentVideos) => [...currentVideos, ...filteredNewVideos]);
		return {
			value: data.value,
			nextPageParam: pageParam + 1,
			message: new Error(data.message instanceof Error ? data.message.message : data.message)
		};
	};

	onMount(() => {
		$searchTerm = '';
		$filteredVideos = [];
		if ($videoQuery.data) filteredVideos.set($videoQuery.data.pages[0].value);
	});

	const videoQuery = createInfiniteQuery({
		queryKey: ['videos'],
		queryFn: fetchVideos,
		getNextPageParam: (lastPage) => lastPage.nextPageParam,
		initialPageParam: 1,
		refetchOnWindowFocus: false
	});

	$: filteredAndSearchedVideos = $filteredVideos
		? $filteredVideos.filter((video) => {
				const titleMatch = video.title.toLowerCase().includes($searchTerm.toLowerCase());
				const tagMatch = selectedType.some((tag: any) => video.tags.includes(tag));
				return titleMatch && tagMatch;
		  })
		: [];
</script>

<svelte:head>
	<title>{titleName}</title>
</svelte:head>
<main class=" align-middle flex flex-col items-center justify-center max-w-[1300px] mx-auto px-5">
	<div class=" mb-3 items-end justify-end text-right self-end">
		<form>
			<label>
				Filter By:
				<select bind:value={selectedType} class=" px-3 py-3 border rounded-lg outline-none">
					<option value="" disabled selected>Select an option</option>
					{#each availableTypes as { label, value }, index}
						<option {value}>{label}</option>
					{/each}
				</select>
			</label>
		</form>
	</div>
	{#if $videoQuery.isPending || $videoQuery.isLoading || filteredAndSearchedVideos.length < 0}
		<HomepageLoadingSkelton />
	{:else if $videoQuery.isSuccess}
		{#if selectedVideo}
			<VideoView selectedVideoStore={selectedVideo} />
		{:else if filteredAndSearchedVideos && filteredAndSearchedVideos.length > 0}
			<VideoView selectedVideoStore={filteredAndSearchedVideos[0]} />
		{/if}
		{#if upComingEventData && upComingEventData.length > 0}
			<CalendarWeekly {upComingEventData} />
		{/if}
		<div class="mt-9 grid grid-cols-1 sm:px-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
			{#if filteredAndSearchedVideos && filteredAndSearchedVideos.length > 0}
				{#each filteredAndSearchedVideos as video, index (video.id + '-' + index)}
					<button on:click={() => videoSelected(video)} class=" text-left">
						<ThumbnailVideo {video} {index} />
					</button>
				{/each}
			{:else}
				<div>No videos found for the selected filters.</div>
			{/if}
		</div>

		<div
			class={` mt-10 bg-gray-100 hover:bg-gray-200 transition-all duration-500 p-4 rounded-xl text-sm`}
		>
			<button
				on:click={() => $videoQuery.fetchNextPage()}
				class={`${
					$videoQuery.isFetching ? 'disabled' : ''
				}flex flex-row space-x-4 items-center justify-center`}
			>
				{#if $videoQuery.isFetching}
					<div class=" relative flex items-center justify-center w-f animate-spin">
						<Chart3 size={20} color="#fb923c" variant="Linear" />
					</div>
					<span class="flex whitespace-nowrap"> Loading more... </span>
				{:else}
					Load More
				{/if}
			</button>
		</div>
	{/if}

	<!-- <div class=" relative flex items-center justify-center w-full mt-5 animate-spin">
			{#if isLoading}
				<Chart3 size={60} color="#fb923c" variant="Linear" />
			{/if}
		</div> -->
</main>

<style>
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}
</style>
