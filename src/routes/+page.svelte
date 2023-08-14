<script lang="ts">
	import type { PageData } from './$types';
	import '../app.css';
	import { dict, locale, t } from '../i18n';
	import fr from '../translations/fr';
	import en from '../translations/en';
	import { date } from 'zod';
	import ThumbnailVideo from '$lib/components/+thumbnailVideo.svelte';
	import VideoView from '$lib/components/+videoView.svelte';
	const languages = { en, fr };
	dict.set(languages);
	const webName: string = 'missionnaire network website';
	export let data: PageData;
	let currentViewingUrl = '';
	const handleClick = () => {
		currentViewingUrl = 'https://www.youtube.com/embed/EK5u1gUI-KE';
	};
</script>

<main class=" align-middle flex flex-col items-center justify-center p-4 max-w-[1200px] mx-auto">
	<VideoView />
	<div class=" mt-7 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-8">
		{#each data.videos as video, index}
			<ThumbnailVideo {video} {index} />
		{/each}
	</div>
</main>
