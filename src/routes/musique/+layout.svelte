<script lang="ts">
	import AndroidBanner from '$lib/components/+androidBanner.svelte';
	import AudioTableItem from '$lib/components/+audioTableItem.svelte';
	import { getContext, onDestroy, onMount, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import type { AudioAsset } from '$lib/models/media-assets';
	import type { MusicAudio } from '$lib/models/music-audio';
	import { goto } from '$app/navigation';
	import LoadingRing from '$lib/components/LoadingRing.svelte';
	import MobileListToolbar from '$lib/components/+mobileListToolbar.svelte';
	import { mobileSearchOpen } from '$lib/stores/mobileControls';

	let { data, children } = $props();
	let heroSearchValue = $state((data as any).search || '');
	let debounceTimer: NodeJS.Timeout | undefined = $state();
	let isHeroSearchLoading = $state(false);
	let lastSyncedSearch = $state('');

	// Total song count for the hero copy. Loaded async on mount so the page
	// renders immediately with a fallback string — if the count endpoint is
	// slow or unreachable, the hero stays useful instead of blocking on it.
	let totalSongs: number | null = $state(null);
	const formattedTotal = (n: number) => n.toLocaleString('fr-FR');

	let currentSearch = $derived($page.url.searchParams.get('search') || '');
	$effect(() => {
		if (currentSearch !== lastSyncedSearch) {
			heroSearchValue = currentSearch;
			untrack(() => {
				lastSyncedSearch = currentSearch;
			});
		}
	});

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

	$effect(() => {
		if (browser) {
			if (heroSearchValue !== undefined) {
				// Timer bookkeeping is untracked: reading + reassigning
				// `debounceTimer` inside the effect would re-trigger it forever.
				untrack(() => {
					clearTimeout(debounceTimer);
					debounceTimer = setTimeout(() => {
						if (heroSearchValue.trim() !== currentSearch) {
							isHeroSearchLoading = true;
							void handleHeroSearch();
						} else {
							isHeroSearchLoading = false;
						}
					}, 300);
				});
			}
		}
	});

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

	onMount(async () => {
		if (!browser) return;
		try {
			const res = await fetch('/api/music-audio/count');
			if (!res.ok) return;
			const result = await res.json();
			if (typeof result.count === 'number' && result.count > 0) {
				totalSongs = result.count;
			}
		} catch {
			// network failure — keep the fallback hero copy
		}
	});
</script>

<div class="flex flex-col">
	<header class="relative">
		<div class="relative header-predications flex flex-col items-center justify-center w-full min-h-[150px] md:min-h-[400px]">
			<div class="absolute inset-0 overlay-predications flex items-center justify-center px-5 py-4 md:py-12">
				<div class="flex flex-col items-center text-white w-full max-w-3xl text-center">
					<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-1.5 md:mb-4 font-body">
						Tous les cantiques
					</p>
					<h1 class="font-display text-xl md:text-5xl font-semibold leading-tight">Louange et Adoration</h1>
					<p class="text-xs md:text-sm text-white/60 font-body mt-1 mb-2 md:mt-3 md:mb-8 max-w-lg leading-relaxed">
						{#if totalSongs !== null}
							Trouvez ici <span class="font-semibold text-white">{formattedTotal(totalSongs)}</span> cantiques.
						{:else}
							Trouvez ici les cantiques.
						{/if}
					</p>
					<form
						class="hidden md:flex w-full max-w-xl border border-white/25 bg-white/90 backdrop-blur-sm overflow-hidden"
						onsubmit={(e) => {
							e.preventDefault();
							void handleHeroSearch();
						}}
					>
						<div class="relative flex-1">
							<input
								id="hero-search"
								type="text"
								class="w-full bg-transparent text-stone-800 px-4 py-2.5 pr-10 text-base md:px-5 md:py-3.5 md:pr-12 md:text-sm font-body outline-none placeholder:text-stone-400"
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
									onclick={() => {
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
						<button type="submit" class="bg-missionnaire hover:bg-missionnaire/90 text-white px-4 py-2.5 md:px-6 md:py-3.5 text-[10px] md:text-[11px] font-bold uppercase tracking-[0.15em] font-body transition-colors shrink-0">
							Rechercher
						</button>
					</form>
					<div class="flex items-center gap-3 mt-2 md:mt-6">
						<a
							href="/musique"
							class="px-4 py-1.5 md:px-5 md:py-2 text-[11px] font-bold uppercase tracking-[0.15em] font-body transition-all border {$page.url.pathname === '/musique' ? 'bg-missionnaire text-white border-missionnaire' : 'bg-white/10 text-white border-white/20 hover:bg-white/20'}"
						>
							Audio
						</a>
						<a
							href="/musique/videos"
							class="px-4 py-1.5 md:px-5 md:py-2 text-[11px] font-bold uppercase tracking-[0.15em] font-body transition-all border {$page.url.pathname === '/musique/videos' ? 'bg-missionnaire text-white border-missionnaire' : 'bg-white/10 text-white border-white/20 hover:bg-white/20'}"
						>
							Vidéos
						</a>
					</div>
				</div>
			</div>
		</div>

		<!-- Banner: inline below hero on mobile (so it doesn't overlap the
		     Audio/Vidéos toggle), absolute floating on desktop where there's
		     room. Single render — duplicating it would split the dismiss
		     state across two instances. -->
		<div class="md:absolute md:bottom-0 md:left-1/2 md:-translate-x-1/2 md:translate-y-1/2 w-full max-w-2xl mx-auto px-2 md:px-5 z-10 mt-4 md:mt-0">
			<AndroidBanner />
		</div>
	</header>
</div>

<!-- Mobile compact toolbar: collapses the search + filters so the song
     list is the first thing the listener sees. Desktop keeps the hero. -->
<MobileListToolbar />
{#if $mobileSearchOpen}
	<div class="md:hidden border-b border-stone-200 bg-cream px-4 py-3">
		<div class="relative">
			<!-- svelte-ignore a11y_autofocus -->
			<input
				type="search"
				class="w-full rounded-lg border border-stone-200 bg-white py-2.5 pl-10 pr-3 text-base font-body text-stone-800 outline-none placeholder:text-stone-400 focus:border-missionnaire/40"
				placeholder="Rechercher par titre..."
				bind:value={heroSearchValue}
				autofocus
			/>
			<svg
				class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<circle cx="11" cy="11" r="7" />
				<line x1="21" y1="21" x2="16.65" y2="16.65" />
			</svg>
		</div>
	</div>
{/if}

<div class="flex flex-row justify-center h-auto w-full pt-4 pb-32 md:pt-16 md:pb-16 overflow-x-hidden">
	<div class=" flex flex-col w-full max-w-7xl px-2 md:px-5">
		{@render children?.()}
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
