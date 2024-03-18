<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { createEventDispatcher, getContext, onDestroy, onMount, setContext } from 'svelte';
	import { writable } from 'svelte/store';
	import '../app.css';
	import { dict, locale, t } from '../i18n';
	import fr from '../translations/fr';
	import en from '../translations/en';
	import ThumbnailVideo from '$lib/components/+thumbnailVideo.svelte';
	import VideoView from '$lib/components/+videoView.svelte';
	import CalendarWeekly from '$lib/components/+calendarWeekly.svelte';
	import GetSermonsVideosUsecase from '../middleware/usecases/get-videos-sermons';
	import type { YoutubeVideo } from '@mnlib/lib/models/youtube';
	import Chart3 from 'iconsax-svelte/Chart3.svelte';

	const languages = {
		en,
		fr
	};
	dict.set(languages);
	export let data;
	let { videosResponse } = data;
	let titleName: any = 'Missionnaire network';
	let currentViewingVideo = writable<YoutubeVideo>({} as YoutubeVideo);

	const videosStore = writable(videosResponse.data);
	videosStore.update((currentVideos) => [...currentVideos, ...videosResponse.data]);
	const availableTypes = [
		{
			label: 'All',
			value: [
				'branham',
				'william',
				'ewald',
				'frank',
				'local',
				'song',
				'any',
				'predication',
				'retransmission',
				'ibaruwa',
				'lettre',
				'circulaire'
			]
		},
		{
			label: 'Retransimission',
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
	let upComingEventData: YoutubeVideo[];
	// Add reactive variables for type and pageNumber
	let pageNumber = 2;
	let selectedType = ['retransmission', 'branham', 'frank', 'local', 'lettre'];

	let isLoading = true;

	let shouldLoadMore = false; // Track if loading more is needed
	let scrollPosition = 0;

	setContext('selectedVideo', $videosStore[0]);
	currentViewingVideo.set($videosStore[0]);

	const videoSelected = (video: YoutubeVideo) => {
		currentViewingVideo.update(() => video);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	};
	setContext('currentViewingVideo', currentViewingVideo);
	onMount(async () => {
		if (typeof window !== 'undefined') {
			window.addEventListener('scroll', handleScroll);
		}
	});
	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('scroll', handleScroll);
		}
	});
	function handleScroll() {
		const divList = document.querySelector('.div-list'); // Replace '.div-list' with the actual class of the div list
		if (divList) {
			divList.addEventListener('scroll', () => {
				const scrollHeight = divList.scrollHeight;
				const scrollTop = divList.scrollTop;
				const clientHeight = divList.clientHeight;

				if (scrollTop + clientHeight >= scrollHeight - 200) {
					// Adjust the threshold as needed
					shouldLoadMore = true;
					loadMoreVideos();
				}
			});
		}
	}
	// Function to load more videos
	async function loadMoreVideos() {
		isLoading = true; // Set the loading state to true before fetching data
		const videosUsecase = new GetSermonsVideosUsecase();
		const res = await videosUsecase.execute({
			videoCount: 12,
			type: selectedType,
			pageNumber
		});
		if (res.isOk) {
			// Update the data.videos array with the new videos
			videosStore.update((currentVideos) => [...currentVideos, ...res.value]);
			// Increment the pageNumber for the next load
			pageNumber++;
			shouldLoadMore = false; // Reset for potential next load
		} else {
			throw new Error(res.error.message);
		}
		isLoading = false; // Set the loading state to false after fetching data
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
			<select bind:value={selectedType} on:change={() => {}} class=" px-3 py-3 border rounded-lg">
				{#each availableTypes as { label, value: type }}
					<option value={type}>{label} </option>
				{/each}
			</select>
		</label>
	</div>
	{#if $videosStore.length > 0}
		<VideoView on:loaded={() => {}} />
	{/if}
	{#if upComingEventData && upComingEventData.length > 0}
		<CalendarWeekly {upComingEventData} />
	{/if}
	<div
		class="div-list mt-9 grid grid-cols-1 sm:px-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8"
	>
		{#each $videosStore as video, index (video.id + '-' + index)}
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<!-- svelte-ignore a11y-click-events-have-key-events -->
			<div
				on:click={() => {
					videoSelected(video);
				}}
			>
				<ThumbnailVideo {video} {index} />
			</div>
		{/each}
	</div>
	<div class=" relative flex items-center justify-center w-full mt-5 animate-spin">
		{#if isLoading}
			<Chart3 size={60} color="#fb923c" variant="Linear" />
		{/if}
	</div>
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
