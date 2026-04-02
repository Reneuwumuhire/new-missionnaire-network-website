<script lang="ts">
	import TableAudioList from '$lib/components/+tableAudioList.svelte';
	import Breadcrumbs from '$lib/components/+breadcrumbs.svelte';
	import { page } from '$app/stores';

	export let data: any;

	$: songs = data.songs?.ok ? data.songs.val : [];
	$: isLoading = !data.songs;
	$: slug = $page.params.slug || '';
	$: pageTitle = slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
</script>

<svelte:head>
	<title>{pageTitle} | Musique - Missionnaire Network</title>
	<meta name="description" content="Écoutez les cantiques de {pageTitle} sur Missionnaire Network." />
	<link rel="canonical" href="https://missionnaire.net/musique/{slug}" />
	<meta property="og:title" content="{pageTitle} | Musique - Missionnaire Network" />
	<meta property="og:description" content="Écoutez les cantiques de {pageTitle} sur Missionnaire Network." />
	<meta property="og:url" content="https://missionnaire.net/musique/{slug}" />
</svelte:head>

<Breadcrumbs items={[
	{ label: 'Musique', href: '/musique' },
	{ label: pageTitle }
]} />

{#if isLoading}
	<p>Loading...</p>
{:else}
	<TableAudioList audioList={songs} loading={isLoading} />
{/if}
