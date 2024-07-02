<script lang="ts">
	import { page, navigating } from '$app/stores';
	import AudioPlayer from '$lib/components/+audioPlayer.svelte';
	import { searchQuery, selectAudio } from '$lib/stores/global';
	import type { AudioAsset } from '@mnlib/lib/models/media-assets';
	import { onMount } from 'svelte';
	import { PredicationsRoutes } from '../../utils/predicationsRoutesList';

	let { loading = true } = $page.data;

	export let searchTerm: string;

	let selectedAudioToPlay: AudioAsset | null = null;
	onMount(() => {
		selectAudio.subscribe((value) => {
			selectedAudioToPlay = value;
		});
	});

	function updateSearchQuery(event: Event) {
		searchTerm = (event.target as HTMLInputElement).value;
		updateQueryParam(searchTerm);
	}

	function updateQueryParam(query: string) {
		const currentUrl = new URL($page.url);
		currentUrl.searchParams.set('q', query);
		history.replaceState(null, '', currentUrl.toString());
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
							Tous les Predications de
						</small>
						<h1 class="text-4xl font-black mb-4 text-center">Branham, Ewald Frank et Locales</h1>
						<p class=" text-sm max-w-md text-center font-light leading-5 tracking-wider">
							Trouvez ici les predication de William Marrion Branham et Ewald Frank traduits en
							Kinyarwanda et Predications Locales.
						</p>
						<div class="flex flex-row w-full max-w-md">
							<input
								type="text"
								class="border border-gray-300 rounded-l-full indent-4 p-2 w-full text-gray-900 outline-none"
								placeholder="Rechercher par titre, annee, predicateur..."
								bind:value={$searchQuery}
								on:input={updateSearchQuery}
							/>
							<button class="bg-missionnaire text-white px-4 py-2">Search</button>
						</div>
					</div>
				</div>
			</div>
		</div>
	</header>
	<div class="relative flex flex-row justify-center h-auto w-full py-6">
		<div
			class="relative flex flex-col items-start w-full max-w-5xl overflow-hidden space-y-2 md:space-y-6 px-5"
		>
			<h1 class=" text-xl md:text-2xl font-black text-[#414141]">Par Auteur</h1>
			<ul class="flex flex-col md:flex-row w-full space-y-2 md:space-y-0 md:space-x-4">
				<!-- href="/predications/{slug.slug}" -->
				{#each PredicationsRoutes as slug}
					<li class="flex-1 h-full max-w-sm">
						<a
							href=""
							data-sveltekit-preload-data=""
							class={`
							'bg-missionnaire-100 ' : ''}
						flex flex-col space-y-1 border-2 border-missionnaire-100 rounded-lg p-2 md:p-4 hover:bg-missionnaire-100 transition-all h-full
							`}
						>
							<span class=" text-xs font-bold md:text-lg">{slug.title}</span>
							<span class=" hidden md:block font-light text-sm text-gray-600"
								>{slug.description}</span
							>
						</a>
					</li>
				{/each}
			</ul>
		</div>
	</div>
</div>
<div class="flex flex-row justify-center h-auto w-full py-6">
	<div class=" flex flex-col w-full max-w-5xl px-5">
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
