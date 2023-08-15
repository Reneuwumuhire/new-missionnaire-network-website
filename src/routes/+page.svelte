<script lang="ts">
	import type { PageData } from './$types';
	import '../app.css';
	import { dict, locale, t } from '../i18n';
	import fr from '../translations/fr';
	import en from '../translations/en';
	import { date } from 'zod';
	import ThumbnailVideo from '$lib/components/+thumbnailVideo.svelte';
	const languages = { en, fr };
	dict.set(languages);
	const webName: string = 'missionnaire network website';
	export let data: PageData;
</script>

<title>Missionnaire Network</title>
<select bind:value={$locale}>
	{#each Object.keys(languages) as lang}
		<option value={lang}>
			{lang}
		</option>
	{/each}
</select>

<h4 class="text-center text-7xl pt-10 px-10 mb-10">{$t('welcome')}</h4>
<h1 class="text-center text-7xl pt-10 px-10 mb-10 text-gray-500">
	{$t('This is the implementation for')}
	{webName}
</h1>
<main class=" align-middle flex flex-col items-center justify-center p-4 max-w-[1200px] mx-auto">
	<div class=" grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4">
		{#each data.videos as video, index}
			<ThumbnailVideo {video} {index} />
		{/each}
	</div>
</main>
