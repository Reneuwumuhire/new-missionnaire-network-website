<!-- SomeComponent.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let video: import('../../core/model/youtube').VideoItem;
</script>

<div class="">
	<!-- Thumbnail image -->
	<div>
		<img src={video.thumbnails.medium.url} alt="" />
	</div>
	<!-- Title- when streamed - download options -->
	<div>
		<!-- Title and time streamed -->
		<div>
			<div>
				{video.title}
			</div>
			<small>Streamed at {video.publishedAt.toLocaleString()}</small>
		</div>
		<!-- controls for download -->
		<div>
			<!-- Button to download -->
			<button>...</button>
		</div>
	</div>
</div>
