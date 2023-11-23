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
	const languages = { en, fr };
	dict.set(languages);
	const webName: string = 'missionnaire network website';
	export let data: PageData;
	let titleName: any = 'Missionnaire network';
	let currentViewingUrl = '';
	const handleClick = (e: any) => {
		console.log(e.id);
		titleName = e.title;
		currentViewingUrl = `https://www.youtube.com/embed/${e.id}?autoplay=1`;
	};
</script>

<svelte:head>
	<title>{titleName}</title>
</svelte:head>
<main class=" align-middle flex flex-col items-center justify-center max-w-[1200px] mx-auto">
	<VideoView {currentViewingUrl} />
	<CalendarWeekly />
	<div
		class=" mt-9 px-4 grid grid-cols-1 sm:px-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-8"
	>
		{#each data.videos as video, index}
			<ThumbnailVideo {video} {index} on:videoSelected={(e) => handleClick(e.detail)} />
		{/each}
	</div>
</main>
