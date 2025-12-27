<script lang="ts">
	import SongVideoCard from '$lib/components/+songVideoCard.svelte';
	import type { YoutubeVideo } from '$lib/models/youtube';

	export let data;
	const songs: YoutubeVideo[] = data.videosResponse.data;
</script>

<svelte:head>
	<title>Cantiques - Missionnaire Network</title>
	<meta name="description" content="Ecoutez les cantiques du Message de l'Heure sur Missionnaire Network." />
	<meta property="og:title" content="Cantiques - Missionnaire Network" />
	<meta property="og:description" content="Ecoutez les cantiques du Message de l'Heure." />
</svelte:head>

<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
	{#each songs as song}
		<SongVideoCard videoData={song} />
	{/each}
</div>
