<!-- SomeComponent.svelte -->
<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsThreeDotsVertical from 'svelte-icons-pack/bs/BsThreeDotsVertical';
	import BsFiletypeMp3 from 'svelte-icons-pack/bs/BsFiletypeMp3';
	import BsCameraVideo from 'svelte-icons-pack/bs/BsCameraVideo';
	import BsFiletypePdf from 'svelte-icons-pack/bs/BsFiletypePdf';
	export let video: import('../../core/model/youtube').VideoItem;
	export let index: number;

	const dispatch = createEventDispatcher();
	let visible: boolean[] = [];

	let downloadDivElement: HTMLDivElement;

	const toggleVisible: (event: MouseEvent) => void = (event) => {
		event.stopPropagation();
		visible[index] = !visible[index];
		visible.map((_, i) => {
			return i === index ? true : false;
		});
	};

	const hideIfClickedOutside = (event: MouseEvent) => {
		event.stopPropagation();
		if (downloadDivElement && !downloadDivElement.contains(event.target as Node)) {
			visible = visible.map((_, i) => (i === index ? true : false));
			visible[index] = !visible[index];
		}
	};

	function formatTime(date: number | Date | any) {
		const now: Date | number | any = new Date();
		const diff = now - date;

		if (diff < 60000) {
			return 'just now';
		} else if (diff < 3600000) {
			return Math.floor(diff / 60000) + ' minutes ago';
		} else if (diff < 86400000) {
			return Math.floor(diff / 3600000) + ' hours ago';
		} else if (diff < 604800000) {
			const days = Math.floor(diff / 86400000);
			return days === 1 ? '1 day ago' : days + ' days ago';
		} else if (diff < 2419200000) {
			const weeks = Math.floor(diff / 604800000);
			return weeks === 1 ? '1 week ago' : weeks + ' weeks ago';
		} else if (diff < 29030400000) {
			const months = Math.floor(diff / 2419200000);
			return months === 1 ? '1 month ago' : months + ' months ago';
		} else {
			const years = Math.floor(diff / 29030400000);
			return years === 1 ? '1 year ago' : years + ' years ago';
		}
	}
</script>

<svelte:window on:click={hideIfClickedOutside} />
<div
	class=" min-h-ful w-full cursor-pointer transition-all duration-300 ease-in-out hover:duration-300 hover:ease-in-out"
>
	<!-- Thumbnail image -->
	<div class="w-full h-full flex flex-col justify-between">
		<div class="w-full">
			<img class="  w-full" src={video.thumbnails.medium.url} alt={video.title} />
		</div>
		<!-- Title- when streamed - download options -->
		<div class="w-full h-full flex flex-col">
			<!-- Title and time streamed -->
			<div class="  mt-3">
				<p class=" font-medium text-xs text-ellipsis overflow-hidden line-clamp-2">
					{video.title}
				</p>
			</div>
			<!-- controls for download -->
			<div class=" w-full flex justify-between items-center">
				<small class=" text-gray-500"
					>Streamed {formatTime(new Date(video.publishedAt.toLocaleString()))}</small
				>
				<!-- Button to download -->
				<button class=" rounded-full p-2 -mr-4" on:click|stopPropagation={toggleVisible}
					><Icon src={BsThreeDotsVertical} />
				</button>
			</div>
		</div>
	</div>
	{#if visible[index]}
		<!-- svelte-ignore missing-declaration -->
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div
			transition:slide={{ duration: 300 }}
			bind:this={downloadDivElement}
			class="relative drop-shadow-md transition-all duration-300 ease-in-out"
		>
			<div class="absolute w-60 z-20 bg-white self-end right-0 bottom-2 rounded-xl">
				<ul class=" w-full overflow-hidden rounded-xl text-sm">
					<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
					<li
						on:click|stopPropagation={toggleVisible}
						class="transition duration-150 ease-in-out hover:ease-in-out w-full h-12 p-3 hover:bg-gray-200 flex flex-row items-center align-middle space-x-2"
					>
						<Icon src={BsFiletypeMp3} /><span class="">Download MP3</span>
					</li>
					<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
					<li
						on:click|stopPropagation={toggleVisible}
						class="transition duration-150 ease-in-out hover:ease-in w-full h-12 p-3 hover:bg-gray-200 flex flex-row items-center align-middle space-x-2"
					>
						<Icon src={BsFiletypePdf} /><span class="">Download Transcript (PDF)</span>
					</li>
					<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
					<li
						on:click|stopPropagation={toggleVisible}
						class="transition duration-150 ease-in-out hover:ease-in w-full h-12 p-3 hover:bg-gray-200 flex flex-row items-center align-middle space-x-2"
					>
						<Icon src={BsCameraVideo} /><span class="">Download Video</span>
					</li>
				</ul>
			</div>
		</div>
	{/if}
</div>
