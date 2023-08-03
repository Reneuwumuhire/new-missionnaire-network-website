<script lang="ts">
	import '../app.css';
	import { dict, locale, t } from '../i18n';
	import fr from '../translations/fr';
	import en from '../translations/en';
	const languages = { en, fr };
	dict.set(languages);
	const webName: string = 'missionaire network website';
	const name = 'website';
	const email = 'site@gmail.com';
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
	<li class="py-4 flex mt-[100px]">
		<div class="ml-3 grid gap-10">
			<p class="text-5xl font-medium text-gray-900">{$t(name)}</p>
			<p class="text-4xl text-gray-500">{email}</p>
		</div>
	</li>
</ul>
