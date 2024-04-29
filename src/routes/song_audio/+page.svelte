<script lang="ts">
	import SongVideoCard from '$lib/components/+songVideoCard.svelte';
	import type { YoutubeVideo } from '@mnlib/lib/models/youtube.js';
	import ThumbnailVideo from '$lib/components/+thumbnailVideo.svelte';

	export let data;
	const songs: YoutubeVideo[] = data.videosResponse.data;
</script>

<title> Songs </title>

<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
	{#each songs as song}
		<SongVideoCard videoData={song} />
	{/each}
</div>
