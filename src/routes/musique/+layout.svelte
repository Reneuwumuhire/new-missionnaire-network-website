<script lang="ts">
	import AndroidBanner from '$lib/components/+androidBanner.svelte';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { t } from '../../i18n';
	import LoadingRing from '$lib/components/LoadingRing.svelte';

	let { children } = $props();
	// Seeded from the URL (not load data) so there's no initial-value capture;
	// the sync $effect below keeps it aligned on every navigation.
	let heroSearchValue = $state($page.url.searchParams.get('search') || '');
	let debounceTimer: ReturnType<typeof setTimeout> | undefined = $state();
	let isHeroSearchLoading = $state(false);
	let lastSyncedSearch = $state('');

	// Total song count for the header copy. Loaded async on mount so the page
	// renders immediately without it — if the count endpoint is slow or
	// unreachable, the count simply stays hidden instead of blocking.
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
		try {
			await goto(`?${params.toString()}`, { keepFocus: true, noScroll: true });
		} finally {
			isHeroSearchLoading = false;
		}
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
			// network failure — keep the header without the count
		}
	});

	let isAudioActive = $derived($page.url.pathname === '/musique');
</script>

<!-- Compact header band: one line of identity (kicker + Cormorant title +
     quiet count), the search inline on desktop, and the Audio/Vidéos
     segmented control. The photo stays, but as a subtle darkened strip —
     the song list is the point of the page and must sit above the fold. -->
<header class="musique-band relative border-b border-stone-200/80">
	<div class="musique-band-overlay">
		<div
			class="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:gap-8 md:px-6 md:py-8"
		>
			<div class="min-w-0">
				<p
					class="font-body text-[9px] font-bold uppercase tracking-[0.35em] text-missionnaire md:text-[10px]"
				>
					{$t('music.headerKicker')}
				</p>
				<div class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
					<h1 class="font-display text-[26px] font-semibold leading-none text-white md:text-4xl">
						{$t('music.headerTitle')}
					</h1>
					{#if totalSongs !== null}
						<span class="font-body text-[11px] tabular-nums text-white/50 md:text-xs">
							{$t('music.headerCount', { count: formattedTotal(totalSongs) })}
						</span>
					{/if}
				</div>
			</div>

			<div class="flex items-center justify-between gap-3 md:justify-end md:gap-4">
				<!-- Desktop inline search — mobile uses the sticky toolbar below.
				     White field (same refined feel as the prédications band),
				     h-11 to match the segmented control next to it, orange
				     focus ring, native autofill suppressed. -->
				<form
					class="hidden h-11 w-72 items-stretch overflow-hidden border border-stone-200/60 bg-white transition-shadow focus-within:border-missionnaire/40 focus-within:ring-2 focus-within:ring-missionnaire/30 md:flex lg:w-96"
					role="search"
					autocomplete="off"
					onsubmit={(e) => {
						e.preventDefault();
						void handleHeroSearch();
					}}
				>
					<svg
						class="ml-3 shrink-0 self-center text-stone-400"
						width="14"
						height="14"
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
					<input
						id="musique-band-search"
						name="musique-band-search"
						type="text"
						class="min-w-0 flex-1 bg-transparent px-2.5 font-body text-sm text-stone-800 outline-none placeholder:text-stone-400"
						placeholder={$t('music.searchPlaceholder')}
						aria-label={$t('music.searchPlaceholder')}
						autocomplete="off"
						autocorrect="off"
						autocapitalize="off"
						spellcheck="false"
						bind:value={heroSearchValue}
					/>
					{#if isHeroSearchLoading}
						<LoadingRing
							size={14}
							className="mr-3 flex h-6 w-6 shrink-0 self-center items-center justify-center text-missionnaire"
						/>
					{:else if heroSearchValue}
						<button
							type="button"
							aria-label={$t('music.clearSearch')}
							title={$t('music.clearSearch')}
							class="mr-1.5 flex h-7 w-7 shrink-0 self-center items-center justify-center text-stone-400 transition-colors duration-150 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/50"
							onclick={() => {
								heroSearchValue = '';
							}}
						>
							<svg
								width="13"
								height="13"
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
					<button
						type="submit"
						class="shrink-0 self-stretch bg-missionnaire px-4 text-[10px] font-bold uppercase tracking-[0.15em] text-white font-body transition-colors duration-200 hover:bg-missionnaire/90 active:scale-[0.98]"
					>
						{$t('search.action')}
					</button>
				</form>

				<!-- Audio / Vidéos segmented control — h-11 on md+ so it sits on
				     the same baseline as the inline search field beside it. -->
				<nav
					class="inline-flex shrink-0 items-stretch border border-white/25 bg-white/5 p-0.5 md:h-11 md:p-1"
					aria-label="Audio ou vidéos"
				>
					<a
						href="/musique"
						aria-current={isAudioActive ? 'page' : undefined}
						class="inline-flex items-center px-4 py-1.5 font-body text-[10px] font-bold uppercase tracking-[0.15em] transition-colors duration-150 md:px-5 md:py-0 {isAudioActive
							? 'bg-missionnaire text-white'
							: 'text-white/65 hover:bg-white/10 hover:text-white'}"
					>
						{$t('music.audioTab')}
					</a>
					<a
						href="/musique/videos"
						aria-current={!isAudioActive ? 'page' : undefined}
						class="inline-flex items-center px-4 py-1.5 font-body text-[10px] font-bold uppercase tracking-[0.15em] transition-colors duration-150 md:px-5 md:py-0 {!isAudioActive
							? 'bg-missionnaire text-white'
							: 'text-white/65 hover:bg-white/10 hover:text-white'}"
					>
						{$t('music.videosTab')}
					</a>
				</nav>
			</div>
		</div>
	</div>
</header>

<!-- Mobile search + filters now live on the page itself: a collections
     pill row directly under this band, then a slim search + Filtres
     utility bar (see musique/+page.svelte). Desktop keeps the inline
     header search above. -->
<div
	class="flex h-auto w-full flex-row justify-center overflow-x-hidden pt-4 pb-32 md:pt-10 md:pb-16"
>
	<div class="flex w-full max-w-7xl flex-col px-2 md:px-5">
		{@render children?.()}

		<!-- Android app strip: quiet, dismissible, above the footer — out of
		     the way of the list. Single render keeps the dismiss state whole. -->
		<div class="mt-10 md:mt-12">
			<AndroidBanner />
		</div>
	</div>
</div>

<style>
	.musique-band {
		background-image: url('/img/predications_header.jpg');
		background-color: #1c1917;
		background-repeat: no-repeat;
		background-size: cover;
		background-position: center 30%;
	}
	.musique-band-overlay {
		background-color: rgba(16, 14, 12, 0.84);
	}
</style>
