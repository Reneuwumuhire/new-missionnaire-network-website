<script lang="ts">
	import ResumeToast from '$lib/components/+resumeToast.svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { searchQuery } from '$lib/stores/global';
	import { goto } from '$app/navigation';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { t } from '../../i18n';
	import LoadingRing from '$lib/components/LoadingRing.svelte';

	let { data, children } = $props();
	let heroSearchValue = $state((data as any).search || '');
	let debounceTimer: NodeJS.Timeout | undefined = $state();
	let isHeroSearchLoading = $state(false);
	let lastSyncedSearch = $state('');

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
		params.delete('alpha');
		params.delete('year');
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

	onMount(() => {
		// Sync global search query if needed
		searchQuery.set(heroSearchValue);
	});

	onDestroy(() => {
		clearTimeout(debounceTimer);
	});
</script>

<!-- Compact header band — same pattern as /musique: one line of identity
     (kicker + Cormorant title + quiet subtitle) with the search inline on
     desktop. The photo stays as a darkened strip so the sermons list sits
     above the fold. Mobile search lives in the page's utility bar. -->
<header class="predications-band relative border-b border-stone-200/80">
	<div class="predications-band-overlay">
		<div
			class="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:gap-8 md:px-6 md:py-8"
		>
			<div class="min-w-0">
				<p class="font-body text-[9px] font-bold uppercase tracking-[0.35em] text-missionnaire md:text-[10px]">
					{$t('predications.headerKicker')}
				</p>
				<div class="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
					<h1 class="font-display text-[26px] font-semibold leading-none text-white md:text-4xl">
						{$t('nav.predications')}
					</h1>
					<span class="font-body text-[11px] text-white/50 md:text-xs">
						{$t('predications.headerSubtitle')}
					</span>
				</div>
			</div>

			<!-- Desktop inline search — white field, h-11, orange focus ring.
			     Same refined treatment as the /musique band search; native
			     autofill suggestions suppressed. -->
			<form
				class="hidden h-11 w-72 shrink-0 items-center overflow-hidden border border-white/15 bg-white shadow-sm transition-shadow duration-150 focus-within:ring-2 focus-within:ring-missionnaire/80 md:flex lg:w-96"
				role="search"
				autocomplete="off"
				onsubmit={(e) => {
					e.preventDefault();
					void handleHeroSearch();
				}}
			>
				<svg
					class="ml-3 shrink-0 text-stone-400"
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
					id="predications-band-search"
					name="predications-band-search"
					type="text"
					class="min-w-0 flex-1 bg-transparent px-2.5 font-body text-sm text-stone-800 outline-none placeholder:text-stone-400"
					placeholder={$t('predications.searchPlaceholder')}
					aria-label={$t('predications.searchPlaceholder')}
					autocomplete="off"
					autocorrect="off"
					autocapitalize="off"
					spellcheck="false"
					bind:value={heroSearchValue}
				/>
				{#if isHeroSearchLoading}
					<LoadingRing
						size={14}
						className="mr-3 flex h-6 w-6 shrink-0 items-center justify-center text-missionnaire"
					/>
				{:else if heroSearchValue}
					<button
						type="button"
						aria-label={$t('predications.clearSearch')}
						title={$t('predications.clearSearch')}
						class="mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center text-stone-400 transition-colors duration-150 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/50"
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
			</form>
		</div>
	</div>
</header>

<div class="flex flex-row justify-center h-auto w-full pt-4 pb-16 md:pt-8 md:pb-10 overflow-x-hidden">
	<div class="flex flex-col w-full max-w-7xl px-2 md:px-5">
		{@render children?.()}
	</div>
</div>

<ResumeToast />

<style>
	.predications-band {
		background-image: url('/img/predications_header.jpg');
		background-color: #1c1917;
		background-repeat: no-repeat;
		background-size: cover;
		background-position: center 30%;
	}
	.predications-band-overlay {
		background-color: rgba(16, 14, 12, 0.84);
	}
</style>
