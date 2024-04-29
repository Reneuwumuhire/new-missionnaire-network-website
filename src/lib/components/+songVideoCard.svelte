<script lang="ts">
	import type { YoutubeVideo } from '@mnlib/lib/models/youtube';
	export let videoData: YoutubeVideo;

	let showFullDescription = false;
	const maxDescriptionLength = 100; // Adjust this value to your desired limit

	$: truncatedDescription =
		videoData.description.length > maxDescriptionLength
			? `${videoData.description.slice(0, maxDescriptionLength)}...`
			: videoData.description;
</script>

<div class="bg-white rounded-lg shadow-md overflow-hidden w-full">
	<!-- player for youtube video -->
	<iframe
		class="w-full aspect-video rounded-xl"
		src={`https://www.youtube.com/embed/${videoData.id}`}
		allowfullscreen
		allow="autoplay; encrypted-media"
		title=""
		allowtransparency
	/>
	<div class=" p-4">
		<h2 class="text-xl font-bold mb-2">{videoData.title}</h2>
		<pre class="mb-2 text-gray-400 font-medium text-sm overflow-x-hidden">
      {showFullDescription ? videoData.description : truncatedDescription}
    </pre>
		{#if videoData.description.length > maxDescriptionLength}
			<button
				class="text-blue-500 hover:text-blue-700"
				on:click={() => (showFullDescription = !showFullDescription)}
			>
				{showFullDescription ? 'Show less' : 'Show more...'}
			</button>
		{/if}
		<p class="text-sm text-gray-500">
			Duration: {videoData.duration} | Published: {new Date(
				videoData.publishedAt
			).toLocaleDateString()}
		</p>
	</div>
</div>
