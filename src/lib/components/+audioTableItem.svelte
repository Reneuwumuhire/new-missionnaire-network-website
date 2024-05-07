<script lang="ts">
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsCloudDownloadFill from 'svelte-icons-pack/bs/BsCloudDownloadFill';
	import BsFileEarmarkPdfFill from 'svelte-icons-pack/bs/BsFileEarmarkPdfFill';
	import BsPlayCircleFill from 'svelte-icons-pack/bs/BsPlayCircleFill';
	import { selectAudio } from '../stores/global';
	import { setContext } from 'svelte';
	import type { AudioAsset } from '@mnlib/lib/models/media-assets';
	let showDropContents = false;

	export let audio: AudioAsset;
	export let index: number;
	const updateSelectAudio = (audio: AudioAsset) => {
		selectAudio.set(audio); // Set the selectAudio value in the store
	};
</script>

<div
	class="flex flex-col w-full bg-gray-100 hover:bg-missionnaire-50 hover:text-black transition-all duration-75 ease-in-out cursor-pointer"
>
	<div
		class=" flex flex-row items-center justify-between px-4 py-3 overflow-hidden space-x-3 font-semibold text-xs md:text-sm"
	>
		<div>
			<span class="">{index + 1}</span>
		</div>
		<div class=" flex-1">
			<p class=" max-w-2xl text-ellipsis overflow-hidden line-clamp-1">
				{audio.title}
			</p>
		</div>
		<div class="flex flex-row space-x-6">
			<button class="flex flex-row items-center space-x-1 hover:text-missionnaire">
				<Icon src={BsFileEarmarkPdfFill} />
				<span class=" hidden md:block">PDF</span>
			</button>
			<button class="flex flex-row items-center space-x-1 hover:text-missionnaire">
				<Icon src={BsCloudDownloadFill} />
				<span class=" hidden md:block">MP3</span>
			</button>
			<button
				class="flex flex-row items-center space-x-1 hover:text-missionnaire"
				on:click={() => {
					updateSelectAudio(audio);
				}}
			>
				<Icon src={BsPlayCircleFill} />
				<span class=" hidden md:block">Play</span>
			</button>
		</div>
	</div>
</div>
