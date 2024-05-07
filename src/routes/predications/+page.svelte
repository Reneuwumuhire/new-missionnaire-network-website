<script lang="ts">
	import { searchQuery } from '$lib/stores/global';
	import TableAudioList from '$lib/components/+tableAudioList.svelte';
	import { page } from '$app/stores';
	import TableLoadingSkeltoon from '$lib/components/+tableLoadingSkeltoon.svelte';
</script>

{#await $page.data.streamed?.audiosRes}
	<TableLoadingSkeltoon />
{:then { audios }}
	{$searchQuery}
	<TableAudioList audioList={audios} loading={false} />
{:catch error}
	error occured
{/await}
