<script lang="ts">
	import TableAudioList from '$lib/components/+tableAudioList.svelte';
	import Breadcrumbs from '$lib/components/+breadcrumbs.svelte';
	import { page } from '$app/stores';

	interface Props {
		data: any;
	}

	let { data }: Props = $props();

	let songs = $derived(data.songs?.ok ? data.songs.val : []);
	let isLoading = $derived(!data.songs);
	let slug = $derived($page.params.slug || '');
	let pageTitle = $derived(slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()));
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
