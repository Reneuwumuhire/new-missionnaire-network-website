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

<!-- Title/description/og:*/canonical come from `meta` in this route's
     load — the root layout renders the single canonical tag set ($lib/seo). -->

<Breadcrumbs items={[
	{ label: 'Musique', href: '/musique' },
	{ label: pageTitle }
]} />

{#if isLoading}
	<p>Loading...</p>
{:else}
	<TableAudioList audioList={songs} loading={isLoading} />
{/if}
