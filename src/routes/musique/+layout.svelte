<script lang="ts">
	import AndroidBanner from '$lib/components/+androidBanner.svelte';
	import AudioTableItem from '$lib/components/+audioTableItem.svelte';
	import { getContext, onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import type { AudioAsset } from '$lib/models/media-assets';
	import type { MusicAudio } from '$lib/models/music-audio';
	import { goto } from '$app/navigation';
	import LoadingRing from '$lib/components/LoadingRing.svelte';

	export let data;
	let heroSearchValue = (data as any).search || '';
	let debounceTimer: NodeJS.Timeout;
	let isHeroSearchLoading = false;
	let lastSyncedSearch = '';

	$: currentSearch = $page.url.searchParams.get('search') || '';
	$: if (currentSearch !== lastSyncedSearch) {
		heroSearchValue = currentSearch;
		lastSyncedSearch = currentSearch;
	}

	async function handleHeroSearch() {
		if (!browser) return;
		const params = new URLSearchParams($page.url.searchParams);
		if (heroSearchValue.trim()) {
			params.set('search', heroSearchValue.trim());
		} else {
			params.delete('search');
		}
		params.set('page', '1');
		isHeroSearchLoading = true;
		await goto(`?${params.toString()}`, { keepFocus: true, noScroll: true });
	}

	$: if (browser) {
		if (heroSearchValue !== undefined) {
			clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				if (heroSearchValue.trim() !== currentSearch) {
					isHeroSearchLoading = true;
					void handleHeroSearch();
				} else {
					isHeroSearchLoading = false;
				}
			}, 300);
		}
	}

	async function handleClick(event: {
		preventDefault: () => void;
		currentTarget: { href: string | URL };
	}) {
		event.preventDefault();
		await goto(event.currentTarget.href);
	}

	onDestroy(() => {
		clearTimeout(debounceTimer);
	});
</script>

<div class="flex flex-col">
	<header>
		<div class="relative header-predications flex flex-col items-center justify-center w-full min-h-[340px] md:min-h-[400px]">
			<div class="absolute inset-0 overlay-predications flex items-center justify-center px-5 py-12">
				<div class="flex flex-col items-center text-white w-full max-w-3xl text-center">
					<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-4 font-body">
						Tous les cantiques
					</p>
					<h1 class="font-display text-3xl md:text-5xl font-semibold leading-tight">Louange et Adoration</h1>
					<p class="text-sm text-white/60 font-body mt-3 mb-8 max-w-lg leading-relaxed">
						Trouvez ici les cantiques.
					</p>
					<form
						class="flex w-full max-w-xl border border-white/25 bg-white/90 backdrop-blur-sm overflow-hidden"
						on:submit|preventDefault={handleHeroSearch}
					>
						<div class="relative flex-1">
							<input
								id="hero-search"
								type="text"
								class="w-full bg-transparent text-stone-800 px-5 py-3.5 pr-24 text-sm font-body outline-none placeholder:text-stone-400"
								placeholder="Rechercher par titre..."
								bind:value={heroSearchValue}
							/>
							{#if isHeroSearchLoading}
								<LoadingRing
									size={16}
									className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center text-missionnaire/90"
								/>
							{:else if heroSearchValue}
								<button
									type="button"
									aria-label="Effacer la recherche"
									title="Effacer"
									class="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40"
									on:click={() => {
										heroSearchValue = '';
									}}
								>
									<svg
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<path d="M6 6l12 12M6 18L18 6" />
									</svg>
								</button>
							{/if}
						</div>
						<button type="submit" class="bg-missionnaire hover:bg-missionnaire/90 text-white px-6 py-3.5 text-[11px] font-bold uppercase tracking-[0.15em] font-body transition-colors shrink-0">
							Rechercher
						</button>
					</form>
					<div class="flex items-center gap-3 mt-6">
						<a
							href="/musique"
							class="px-5 py-2 text-[11px] font-bold uppercase tracking-[0.15em] font-body transition-all border {$page.url.pathname === '/musique' ? 'bg-missionnaire text-white border-missionnaire' : 'bg-white/10 text-white border-white/20 hover:bg-white/20'}"
						>
							Audio
						</a>
						<a
							href="/musique/videos"
							class="px-5 py-2 text-[11px] font-bold uppercase tracking-[0.15em] font-body transition-all border {$page.url.pathname === '/musique/videos' ? 'bg-missionnaire text-white border-missionnaire' : 'bg-white/10 text-white border-white/20 hover:bg-white/20'}"
						>
							Vidéos
						</a>
					</div>
				</div>
			</div>

			<!-- Floating Banner -->
			<div class="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-full max-w-2xl px-2 md:px-5 z-10">
				<AndroidBanner />
			</div>
		</div>
	</header>
</div>
<div class="flex flex-row justify-center h-auto w-full pt-20 pb-32 md:py-16 overflow-x-hidden">
	<div class=" flex flex-col w-full max-w-7xl px-2 md:px-5">
		<slot />
	</div>
</div>

<style>
	.header-predications {
		background-image: url('/img/predications_header.jpg');
		background-color: #1a1a1a;
		background-repeat: no-repeat;
		background-size: cover;
		background-position: center;
	}
	.overlay-predications {
		background-color: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(2px);
		-webkit-backdrop-filter: blur(2px);
	}
</style>
