<script lang="ts">
	import TableAudioList from '$lib/components/+tableAudioList.svelte';

	export let data;
	let isLoading: boolean = true; // Initialize local isLoading variable
	data.loading.subscribe((value) => {
		isLoading = value;
	});
</script>

{#if isLoading}
	<p>Loading...</p>
{:else}
	<TableAudioList audioList={data.videos} loading={isLoading} />
{/if}
