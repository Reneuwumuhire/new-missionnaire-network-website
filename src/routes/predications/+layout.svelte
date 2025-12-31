<script lang="ts">
	import AudioPlayer from '$lib/components/+audioPlayer.svelte';
	import AndroidBanner from '$lib/components/+androidBanner.svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { selectAudio, searchQuery } from '$lib/stores/global';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	export let data;
	let heroSearchValue = (data as any).search || '';
	let debounceTimer: NodeJS.Timeout;

	function handleHeroSearch() {
		if (!browser) return;
		const params = new URLSearchParams($page.url.searchParams);
		if (heroSearchValue.trim()) {
			params.set('search', heroSearchValue.trim());
		} else {
			params.delete('search');
		}
		params.set('page', '1');
		params.delete('alpha');
		params.delete('year');
		goto(`?${params.toString()}`, { keepFocus: true, noScroll: true });
	}

	$: if (browser) {
		if (heroSearchValue !== undefined) {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				const currentSearch = $page.url.searchParams.get('search') || '';
				if (heroSearchValue.trim() !== currentSearch) {
					handleHeroSearch();
				}
			}, 300);
		}
	}

	onMount(() => {
		// Sync global search query if needed
		searchQuery.set(heroSearchValue);
	});
</script>

<div class="flex flex-col">
	<header>
		<div class="relative header-predications flex flex-col items-center justify-center w-full min-h-[400px]">
			<div class="absolute inset-0 overlay-predications flex items-center justify-center pt-12 pb-24 md:py-12">
				<div class="flex flex-col items-center text-white space-y-2 px-5 w-full max-w-4xl text-center">
					<small class="text-orange-500 uppercase tracking-[0.2em] font-black text-xs mb-2">
						Tous les prédications
					</small>
					<h1 class="text-4xl md:text-6xl font-black mb-1">Branham, Ewald Frank et Locales</h1>
					<p class="text-sm md:text-base font-medium opacity-80 mb-8 max-w-2xl">
						Trouvez ici les prédications de William Marrion Branham et Ewald Frank traduits en Kinyarwanda et prédications locales.
					</p>
					<form 
						class="flex flex-row w-full max-w-2xl bg-white rounded-xl overflow-hidden shadow-2xl"
						on:submit|preventDefault={handleHeroSearch}
					>
						<input
							id="hero-search"
							type="text"
							class="flex-1 outline-none text-gray-800 px-6 py-4 text-sm md:text-base"
							placeholder="Rechercher par titre, annee, predicateur..."
							bind:value={heroSearchValue}
						/>
						<button type="submit" class="bg-orange-500 hover:bg-orange-600 text-white px-8 py-4 font-bold transition-colors">
							Rechercher
						</button>
					</form>
				</div>
			</div>
		</div>
	</header>
</div>

<div class="flex flex-row justify-center h-auto w-full pt-20 pb-32 md:py-16">
	<div class="flex flex-col w-full max-w-7xl px-2 md:px-5">
		<slot />
	</div>
</div>

{#if $selectAudio}
	<AudioPlayer />
{/if}

<style>
	.header-predications {
		background-image: url('/img/predications_header.jpg');
		background-color: #1a1a1a;
		background-repeat: no-repeat;
		background-size: cover;
		background-position: center;
	}
	.overlay-predications {
		background-color: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(2px);
		-webkit-backdrop-filter: blur(2px);
	}
	:global(.text-orange-500) { color: #f97316; }
	:global(.bg-orange-500) { background-color: #f97316; }
	:global(.hover\:bg-orange-600:hover) { background-color: #ea580c; }
</style>
