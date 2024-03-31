<script lang="ts">
	import AudioPlayer from '$lib/components/+audioPlayer.svelte';
	import AudioTableItem from '$lib/components/+audioTableItem.svelte';
	import { onMount } from 'svelte';
	import type { VideoItem } from '../../core/model/youtube.js';
	import { selectAudio } from '$lib/stores/global.js';
	import { goto } from '$app/navigation';

	export let data;
	let selectedAudioToPlay: VideoItem | null = null;
	onMount(() => {
		selectAudio.subscribe((value) => {
			selectedAudioToPlay = value;
		});
	});
	async function handleClick(event: {
		preventDefault: () => void;
		currentTarget: { href: string | URL };
	}) {
		event.preventDefault();
		await goto(event.currentTarget.href);
	}
</script>

<div class=" flex flex-col">
	<header>
		<div class="flex flex-row items-center justify-center space-x-2">
			<!-- "/img/branham_page_header.jpg" use the image as the background for the next div -->
			<div
				class="relative header-predications flex flex-col items-center backdrop-blur-sm justify-center w-full"
			>
				<div class="absolute inset-0 overlay-predications flex items-center justify-center">
					<div class="flex flex-col items-center text-white space-y-4 px-5">
						<small class=" text-missionnaire uppercase tracking-widest font-bold">
							Tous les chancons
						</small>
						<h1 class="text-4xl font-black mb-4 text-center">Chants</h1>
						<p class=" text-sm max-w-md text-center font-light leading-5 tracking-wider">
							Trouvez ici les chants qui vous aidez louer Dieu.
						</p>
						<div class="flex flex-row w-full max-w-md">
							<input
								type="text"
								class="border outline-none rounded-l-md border-gray-300 text-gray-600 p-2 w-full"
								placeholder="Rechercher par titre, annee, predicateur..."
							/>
							<button class="bg-missionnaire text-white px-4 py-2">Search</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</header>
</div>
<div class="flex flex-row justify-center h-auto w-full py-6">
	<div class=" flex flex-col w-full max-w-7xl px-5">
		<h1 class=" text-xl md:text-2xl font-black text-[#414141] mb-3">List</h1>
		<slot />
	</div>
</div>

{#if selectedAudioToPlay}
	<AudioPlayer />
{/if}

<style>
	.header-predications {
		background-image: url('/img/predications_header.jpg');
		background-color: #cccccc;
		background-repeat: no-repeat;
		background-size: cover;
		background-position: center;
		height: 300px;
	}
	.overlay-predications {
		background-color: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(5px);
		-webkit-backdrop-filter: blur(9px);
	}
</style>
