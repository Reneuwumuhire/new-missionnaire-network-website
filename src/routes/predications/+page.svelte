<script lang="ts">
	import { searchQuery } from '$lib/stores/global';
	import TableAudioList from '$lib/components/+tableAudioList.svelte';
	import { page } from '$app/stores';
	import TableLoadingSkeltoon from '$lib/components/+tableLoadingSkeltoon.svelte';

	// filter the audios based on the searchTerm
</script>

<svelte:head>
	<title>Prédications - Missionnaire Network</title>
	<meta name="description" content="Ecoutez les prédications du Message de l'Heure sur Missionnaire Network." />
	<meta property="og:title" content="Prédications - Missionnaire Network" />
	<meta property="og:description" content="Ecoutez les prédications du Message de l'Heure." />
</svelte:head>

{#await $page.data.streamed?.audiosRes}
	<TableLoadingSkeltoon />
{:then { audios }}
	{$searchQuery}
	<TableAudioList audioList={audios} loading={false} />
{:catch error}
	error occured
{/await}
