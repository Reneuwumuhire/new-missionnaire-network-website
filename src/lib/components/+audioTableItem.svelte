<script lang="ts">
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsCloudDownloadFill from 'svelte-icons-pack/bs/BsCloudDownloadFill';
	import BsFileEarmarkPdfFill from 'svelte-icons-pack/bs/BsFileEarmarkPdfFill';
	import BsPlayCircleFill from 'svelte-icons-pack/bs/BsPlayCircleFill';
	import { selectAudio } from '../stores/global';
	import { setContext } from 'svelte';
	import type { AudioAsset } from '$lib/models/media-assets';
	import { writable } from 'svelte/store';
	let showDropContents = false;

	export let audio: AudioAsset;
	export let index: number;
	const updateSelectAudio = (audio: AudioAsset) => {
		selectAudio.set(audio); // Set the selectAudio value in the store
	};
	let downloadProgress = writable(0);
	let isDownloading = writable(false);

	const downloadAudio = async (audio: AudioAsset) => {
		isDownloading.set(true);
		downloadProgress.set(0);
		try {
			const response = await fetch(audio.url);
			if (!response.ok) {
				throw new Error('Network response was not ok');
			}

			const contentLength = response.headers.get('content-length');
			if (!contentLength) {
				throw new Error('Content-Length response header missing');
			}

			const total = parseInt(contentLength, 10);
			let loaded = 0;

			const reader = response.body?.getReader();
			const stream = new ReadableStream({
				start(controller) {
					function read() {
						reader
							?.read()
							.then(({ done, value }) => {
								if (done) {
									controller.close();
									return;
								}
								loaded += value.length;
								downloadProgress.set(Math.round((loaded / total) * 100));
								controller.enqueue(value);
								read();
							})
							.catch((error) => {
								console.error('Stream reading error:', error);
								controller.error(error);
							});
					}
					read();
				}
			});

			const blob = await new Response(stream).blob();
			const url = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;

			// Ensure the filename has an extension
			let filename = audio.title || 'audio';
			if (!filename.endsWith('.mp3')) {
				filename += '.mp3';
			}
			a.download = filename;

			document.body.appendChild(a); // Append anchor to the body to ensure it works in all browsers
			a.click();
			document.body.removeChild(a); // Remove anchor from the body
			window.URL.revokeObjectURL(url);
			downloadProgress.set(0); // Reset progress after download
		} catch (error) {
			console.error('There was an error downloading the audio:', error);
		} finally {
			isDownloading.set(false);
		}
	};
</script>

<div
	class="flex flex-col w-full border bg-gray-100/50 hover:bg-missionnaire-50 hover:text-black transition-all duration-75 ease-in-out cursor-pointer"
>
	<div
		class=" flex flex-row items-center justify-between px-4 py-3 overflow-hidden space-x-3 font-semibold text-xs md:text-sm"
	>
		<div class=" flex-1 flex flex-row space-x-2 text-gray-800">
			<span class="">{index + 1}.</span>
			<p class=" max-w-2xl text-ellipsis overflow-hidden line-clamp-1">
				{audio.title}
			</p>
		</div>
		<div class="flex flex-row space-x-6">
			{#if audio.transcription}
				<button class="flex flex-row items-center space-x-1 hover:text-missionnaire">
					<Icon src={BsFileEarmarkPdfFill} />
					<span class=" hidden md:block">PDF</span>
				</button>
			{/if}
			{#if $isDownloading}
				<div class="flex items-center justify-center w-8 h-8 relative">
					<svg
						class="h-8 w-8 text-missionnaire"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
					>
						<circle
							class="text-gray-300"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="4"
						/>
						<circle
							class="text-missionnaire"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="4"
							stroke-dasharray="62.83185307179586"
							stroke-dashoffset={62.83185307179586 - (62.83185307179586 * $downloadProgress) / 100}
							stroke-linecap="round"
							transform="rotate(-90 12 12)"
						/>
					</svg>
					<span class="absolute text-xs font-semibold text-missionnaire">{$downloadProgress}%</span>
				</div>
			{:else}
				<button
					class="flex flex-row items-center space-x-1 hover:text-missionnaire"
					on:click={() => downloadAudio(audio)}
				>
					<Icon src={BsCloudDownloadFill} />
					<span class="hidden md:block">MP3</span>
				</button>
			{/if}
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
		<!-- <div class="text-center">
			<button
				on:click={() => downloadAudio(audio)}
				class="flex flex-row items-center space-x-1 hover:text-missionnaire"
			>
				Download Audio
			</button>
			{#if downloadProgress > 0}
				<div class="mt-2">
					Download Progress: {downloadProgress}%
				</div>
			{/if}
		</div> -->
	</div>
</div>
