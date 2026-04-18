<script lang="ts">
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsCloudDownloadFill from 'svelte-icons-pack/bs/BsCloudDownloadFill';
	import BsFileEarmarkPdfFill from 'svelte-icons-pack/bs/BsFileEarmarkPdfFill';
	import BsPlayCircleFill from 'svelte-icons-pack/bs/BsPlayCircleFill';
	import { currentIndex, isPlaying, selectAudio } from '../stores/global';
	import { setContext } from 'svelte';
	import type { AudioAsset } from '$lib/models/media-assets';
	import { writable } from 'svelte/store';
	import { downloadAudioFile } from '../../utils/downloadAudio';
	let showDropContents = false;

	export let audio: AudioAsset;
	export let index: number;
	const updateSelectAudio = (audio: AudioAsset) => {
		selectAudio.set(audio); // Set the selectAudio value in the store
		currentIndex.set(index);
		isPlaying.set(true);
	};
	// `null` = indeterminate (no Content-Length), number = 0–100 percent.
	let downloadPercent = writable<number | null>(0);
	let isDownloading = writable(false);
	let downloadController: AbortController | null = null;

	const downloadAudio = async (audio: AudioAsset) => {
		// Second tap on an in-flight download = cancel.
		if (downloadController) {
			downloadController.abort();
			return;
		}
		const controller = new AbortController();
		downloadController = controller;
		isDownloading.set(true);
		downloadPercent.set(0);
		try {
			await downloadAudioFile(audio.url, audio.title, {
				signal: controller.signal,
				onProgress: (p) => downloadPercent.set(p.percent)
			});
		} catch (error) {
			// Silent on user-initiated aborts; log anything else.
			if (!controller.signal.aborted) {
				console.error('There was an error downloading the audio:', error);
			}
		} finally {
			downloadController = null;
			isDownloading.set(false);
			downloadPercent.set(0);
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
				<button
					type="button"
					class="group flex items-center justify-center w-8 h-8 relative focus:outline-none"
					on:click={() => downloadAudio(audio)}
					title={$downloadPercent !== null
						? `Annuler (${$downloadPercent}%)`
						: 'Annuler le téléchargement'}
					aria-label="Annuler le téléchargement"
				>
					{#if $downloadPercent !== null}
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
								stroke-dashoffset={62.83185307179586 - (62.83185307179586 * $downloadPercent) / 100}
								stroke-linecap="round"
								transform="rotate(-90 12 12)"
							/>
						</svg>
						<span class="absolute text-xs font-semibold text-missionnaire">{$downloadPercent}%</span>
					{:else}
						<svg class="h-8 w-8 animate-spin text-missionnaire" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25" />
							<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-dasharray="42 62" />
						</svg>
					{/if}
					<!-- Hover hint on pointer devices: swap the ring for an X so
					     the cancel affordance is explicit. On touch, the tooltip
					     + aria-label carry the same message. -->
					<span class="absolute inset-0 hidden items-center justify-center bg-missionnaire/90 group-hover:flex">
						<svg class="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
							<path d="M6 6l12 12M6 18L18 6" />
						</svg>
					</span>
				</button>
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
