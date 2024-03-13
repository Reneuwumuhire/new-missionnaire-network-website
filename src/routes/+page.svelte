<script lang="ts">
	import type { PageData } from './$types';
	import '../app.css';
	import { dict, locale, t } from '../i18n';
	import fr from '../translations/fr';
	import en from '../translations/en';
	import { date } from 'zod';
	import ThumbnailVideo from '$lib/components/+thumbnailVideo.svelte';
	import VideoView from '$lib/components/+videoView.svelte';
	import CalendarWeekly from '$lib/components/+calendarWeekly.svelte';
	import GetSermonsVideosUsecase from '../middleware/usecases/get-videos-sermons';

	const languages = {
		en,
		fr
	};
	dict.set(languages);
	const webName: string = 'missionnaire network website';
	export let data: PageData;
	let titleName: any = 'Missionnaire network';
	let currentViewingUrl = data.videos[0] || '';
	const handleClick = (e: any) => {
		console.log(e.id);
		titleName = e.title;
		currentViewingUrl = `https://www.youtube.com/embed/${e.id}?autoplay=1`;
	};
	// Define an array of available types with labels, 'any', 'branham', 'frank'
	const availableTypes = [
		{
			label: 'All Videos',
			value: 'any'
		},
		{
			label: 'William Branham',
			value: 'branham'
		},
		{
			label: 'Ewald Frank',
			value: 'frank'
		}
	];
	let selectedType = 'any';
	// Add reactive variables for type and pageNumber
	let pageNumber = 1;
	// Add a reactive variable to track the loading state
	let isLoading = false;
	let isVideoLoading = true;

	// Function to load videos with the selected type
	async function loadVideos() {
		isLoading = true; // Set the loading state to true before fetching data
		isVideoLoading = true;

		const type = selectedType === 'any' ? ['any'] : [selectedType];
		const pageNumber = 1; // Reset the page number to 1 when loading with a new type

		const videosUsecase = new GetSermonsVideosUsecase();
		const res = await videosUsecase.execute({ videoCount: 12, type, pageNumber });
		if (res.isOk) {
			data.videos = res.value;
			currentViewingUrl = data.videos[0] || '';
		} else {
			throw new Error(res.error.message);
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
		const type = selectedType === 'any' ? [] : [selectedType];
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
<main class=" align-middle flex flex-col items-center justify-center max-w-7xl mx-auto px-5">
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
		<VideoView {currentViewingUrl} on:loaded={() => (isVideoLoading = false)} />
	{/if}
	<CalendarWeekly />
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
			{#each data.videos as video, index}
				<ThumbnailVideo {video} {index} on:videoSelected={(e) => handleClick(e.detail)} />
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
