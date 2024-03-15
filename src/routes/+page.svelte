<script lang="ts">
	import { getContext, setContext } from 'svelte';
	import { writable } from 'svelte/store';
	import '../app.css';
	import { dict, locale, t } from '../i18n';
	import fr from '../translations/fr';
	import en from '../translations/en';
	import ThumbnailVideo from '$lib/components/+thumbnailVideo.svelte';
	import VideoView from '$lib/components/+videoView.svelte';
	import CalendarWeekly from '$lib/components/+calendarWeekly.svelte';
	import GetSermonsVideosUsecase from '../middleware/usecases/get-videos-sermons';
	import GetUpcomingEventsUsecase from '../middleware/usecases/get-upcoming-events';
	import type { PageData } from './$types';
	import type { YoutubeVideo } from '@mnlib/lib/models/youtube';

	const languages = {
		en,
		fr
	};
	dict.set(languages);
	const webName: string = 'missionnaire network website';
	export let data: PageData;
	let { videos } = data;
	let titleName: any = 'Missionnaire network';
	let currentViewingUrl = videos[0];

	const selectedVideo = writable();

	setContext('selectedVideo', selectedVideo);
	const videoSelected = (video: any) => {
		selectedVideo.set(video);
	};
	// ("branham" | "william" | "ewald" | "frank" | "local" | "song" | "any" | "predication" | "retransmission" | "ibaruwa" | "lettre" | "circulaire")
	const availableTypes = [
		{
			label: 'All Videos',
			value: 'retransmission'
		},
		{
			label: 'William Branham',
			value: 'william'
		},
		{
			label: 'Ewald Frank',
			value: 'ewald'
		},
		{
			label: 'Local',
			value: 'local'
		},
		{
			label: 'Lettre circulaire',
			value: 'ibaruwa'
		}
	];
	let selectedType = 'retransmission';
	let upComingEventData: YoutubeVideo[];
	// Add reactive variables for type and pageNumber
	let pageNumber = 1;
	// Add a reactive variable to track the loading state
	let isLoading = false;
	let isVideoLoading = true;

	// Function to load videos with the selected type
	async function loadVideos() {
		isLoading = true; // Set the loading state to true before fetching data
		isVideoLoading = true;

		const type = selectedType === 'retransmission' ? ['retransmission'] : [selectedType];
		const pageNumber = 1; // Reset the page number to 1 when loading with a new type

		const videosUsecase = new GetSermonsVideosUsecase();
		const res = await videosUsecase.execute({ videoCount: 12, type, pageNumber });
		if (res.isOk) {
			const videos = res.value;
			const firstVideoScheduledTime = videos[0].scheduledStartTime;

			if (
				firstVideoScheduledTime &&
				firstVideoScheduledTime.toLocaleString() >= new Date().toLocaleString()
			) {
				currentViewingUrl = data.videos[1] || '';
				selectedVideo.set(data.videos[1] || '');
			} else {
				currentViewingUrl = data.videos[0] || '';
				selectedVideo.set(data.videos[0] || '');
			}
		} else {
			throw new Error(res.error.message);
		}
		//TODO:
		const upComingEvent = new GetUpcomingEventsUsecase();
		const resEvent = await upComingEvent.execute();
		if (resEvent.isOk) {
			upComingEventData = resEvent.value;
			console.log(upComingEventData);
		} else {
			throw new Error(resEvent.error.message);
		}
		isLoading = false; // Set the loading state to false after fetching data
		isVideoLoading = false;
	}

	// Load videos with the initial type
	loadVideos();

	// Function to load more videos
	async function loadMoreVideos() {
		isLoading = true; // Set the loading state to true before fetching data
		isVideoLoading = true;
		// Map the selectedType to the appropriate type value for the usecase
		const type = selectedType === 'retransmission' ? [] : [selectedType];
		const videosUsecase = new GetSermonsVideosUsecase();
		const res = await videosUsecase.execute({
			videoCount: 12,
			type,
			pageNumber
		});
		if (res.isOk) {
			const value = res.value;
			// Update the data.videos array with the new videos
			data.videos = [...data.videos, ...value];
			// Increment the pageNumber for the next load
			pageNumber++;
		} else {
			throw new Error(res.error.message);
		}
		isLoading = false; // Set the loading state to false after fetching data
		isVideoLoading = false;
	}
</script>

<svelte:head>
	<title>{titleName}</title>
</svelte:head>
<!-- Add a dropdown or radio buttons to select the type -->
<main class=" align-middle flex flex-col items-center justify-center max-w-[1300px] mx-auto px-5">
	<div class="  mb-3 items-end justify-end text-right self-end">
		<label>
			Filter By:
			<select bind:value={selectedType} on:change={loadVideos} class=" px-3 py-3 border rounded-lg">
				{#each availableTypes as { label, value: type }}
					<option value={type}>{label}</option>
				{/each}
			</select>
		</label>
	</div>
	{#if isVideoLoading}
		<div
			class=" relative w-full md:min-h-[600px] min-h-[100px] rounded-2xl md:rounded-3xl overflow-hiddenw-full h-96 loading-animation flex items-center justify-center"
		>
			<span class="text-gray-500 text-lg">Loading video...</span>
		</div>
	{:else}
		<VideoView on:loaded={() => (isVideoLoading = false)} />
	{/if}
	{#if upComingEventData && upComingEventData.length > 0}
		<CalendarWeekly {upComingEventData} />
	{/if}
	<div class=" mt-9 grid grid-cols-1 sm:px-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
		<!-- add 12 thumbnail videos when loading -->
		{#if isVideoLoading}
			{#each Array(12) as _}
				<div
					class="w-full flex items-center justify-center h-40 min-w-[350px] loading-animation rounded-lg"
				>
					<span class="text-gray-500 text-lg w-full bg-transparent opacity-0">Loading video...</span
					>
				</div>
			{/each}
		{:else}
			{#each videos as video, index}
				<ThumbnailVideo
					{video}
					{index}
					on:videoSelected={(e) => {
						videoSelected(e.detail);
					}}
				/>
			{/each}
		{/if}
		<!-- Add a button to load more 12 videos -->
	</div>
	<div class=" relative flex items-center justify-center w-full mt-5">
		<button
			on:click={loadMoreVideos}
			class="bg-[#F78B18] hover:bg-[#f78b18eb] text-white py-2 px-4 rounded text-xs md:text-sm"
		>
			{#if isLoading}
				<p>Loading...</p>
			{:else}
				Load more
			{/if}
		</button>
	</div>
</main>

<style>
	/* Add CSS styles for the loading animation */
	.loading-animation {
		background-color: #bebebe; /* Light gray background */
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
	}

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
