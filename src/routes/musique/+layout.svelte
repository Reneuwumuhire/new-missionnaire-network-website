<script lang="ts">
	import AndroidBanner from '$lib/components/+androidBanner.svelte';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { t } from '../../i18n';
	import MusicSearch from '$lib/components/MusicSearch.svelte';

	let { children } = $props();

	// Total song count for the header copy. Loaded async on mount so the page
	// renders immediately without it — if the count endpoint is slow or
	// unreachable, the count simply stays hidden instead of blocking.
	let totalSongs: number | null = $state(null);
	const formattedTotal = (n: number) => n.toLocaleString('fr-FR');

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
				<div class="hidden w-72 md:block lg:w-96">
					<MusicSearch id="musique-band-search" suggestions={isAudioActive} />
				</div>

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
