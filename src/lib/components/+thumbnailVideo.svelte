<!-- SomeComponent.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsThreeDotsVertical from 'svelte-icons-pack/bs/BsThreeDotsVertical';
	import BsFiletypeMp3 from 'svelte-icons-pack/bs/BsFiletypeMp3';
	import BsCameraVideo from 'svelte-icons-pack/bs/BsCameraVideo';
	import BsFiletypePdf from 'svelte-icons-pack/bs/BsFiletypePdf';
	export let video: import('../../core/model/youtube').VideoItem;
	let visibleDownload = false;

	function toggleVissible() {
		visibleDownload = !visibleDownload;
	}
</script>

<div
	class="  min-w-[380px] w-full cursor-pointer rounded-lg bg-gray-50 hover:shadow-md hover:bg-gray-50 p-2 transition duration-150 ease-in-out"
>
	<!-- Thumbnail image -->
	<div class="w-full">
		<img class=" rounded-lg w-full" src={video.thumbnails.medium.url} alt={video.title} />
	</div>
	<!-- Title- when streamed - download options -->
	<div class="w-full">
		<!-- Title and time streamed -->
		<div class="  mt-3">
			<p class=" font-medium text-xs">
				{video.title}
			</p>
		</div>
		<!-- controls for download -->
		<div class=" mt-3 w-full flex justify-between items-center">
			<small class=" text-gray-500">Streamed at {video.publishedAt.toLocaleString()}</small>
			<!-- Button to download -->
			<button
				class=" rounded-full p-4 bg-gray-100 hover:bg-gray-200 border-gray-200 border-2"
				on:click={toggleVissible}
				><Icon src={BsThreeDotsVertical} />
			</button>
		</div>
	</div>
	{#if visibleDownload}
		<div class="relative drop-shadow-md">
			<div class="absolute w-60 z-20 bg-white self-end right-0 bottom-2 rounded-xl">
				<ul class=" w-full overflow-hidden rounded-xl text-sm">
					<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<li
						on:click={toggleVissible}
						class="transition duration-150 ease-in-out hover:ease-in w-full h-12 p-3 hover:bg-gray-200 flex flex-row items-center align-middle space-x-2"
					>
						<Icon src={BsFiletypeMp3} /><span class="">Download MP3</span>
					</li>
					<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<li
						on:click={toggleVissible}
						class="transition duration-150 ease-in-out hover:ease-in w-full h-12 p-3 hover:bg-gray-200 flex flex-row items-center align-middle space-x-2"
					>
						<Icon src={BsFiletypePdf} /><span class="">Download Transcript (PDF)</span>
					</li>
					<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<li
						on:click={toggleVissible}
						class="transition duration-150 ease-in-out hover:ease-in w-full h-12 p-3 hover:bg-gray-200 flex flex-row items-center align-middle space-x-2"
					>
						<Icon src={BsCameraVideo} /><span class="">Download Video</span>
					</li>
				</ul>
			</div>
		</div>
	{/if}
</div>
