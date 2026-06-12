<script lang="ts">
	import AudioTableItem from './+audioTableItem.svelte';
	import type { AudioAsset } from '$lib/models/media-assets';

	let { audioList = [], loading }: { audioList?: AudioAsset[]; loading: boolean } = $props();
</script>

{#if loading}
	<p>Loading...</p>
{:else if audioList.length === 0}
	<p>Empty</p>
{:else}
	<div class="border border-gray-300 shadow rounded-md p-4 w-full mx-auto overflow-hidden">
		<table class="w-full">
			<tbody class=" space-y-2">
				{#each audioList as audio, index}
					<AudioTableItem {audio} {index} />
				{/each}
			</tbody>
		</table>
	</div>
{/if}
