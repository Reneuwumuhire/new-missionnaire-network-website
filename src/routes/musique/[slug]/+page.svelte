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

<Breadcrumbs items={[
	{ label: 'Musique', href: '/musique' },
	{ label: pageTitle }
]} />

{#if isLoading}
	<p>Loading...</p>
{:else}
	<TableAudioList audioList={songs} loading={isLoading} />
{/if}
