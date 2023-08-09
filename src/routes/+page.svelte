<script lang="ts">
    import type { PageData } from './$types';
	import '../app.css';
	import { dict, locale, t } from '../i18n';
	import fr from '../translations/fr';
	import en from '../translations/en';
	import { date } from 'zod';
	const languages = { en, fr };
	dict.set(languages);
	const webName: string = 'missionaire network website';
	const name = 'website';
	const email = 'site@gmail.com';
    
    export let data: PageData;
    console.log(data);
    
</script>

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
<ul class="divide-y grid items-center justify-center divide-gray-200">
	{#each data.videos as video}
        <div>{video.title}</div>
        <img src={video.thumbnails.medium.url} alt="">
    {/each}
</ul>
