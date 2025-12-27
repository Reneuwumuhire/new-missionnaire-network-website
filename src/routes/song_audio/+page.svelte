<script lang="ts">
	import SongVideoCard from '$lib/components/+songVideoCard.svelte';
	import type { YoutubeVideo } from '$lib/models/youtube';

	export let data;
	const songs: YoutubeVideo[] = data.videosResponse.data;
</script>

<title> Songs </title>

<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
	{#each songs as song}
		<SongVideoCard videoData={song} />
	{/each}
</div>
