<script lang="ts">
	import '../app.css';
	import NavBar from '$lib/components/+navBar.svelte';
	import SocialMediaAbove from '$lib/components/+socialMediaAbove.svelte';
	import Footer from '$lib/components/+footer.svelte';
	import CopyButton from '$lib/components/+copyButton.svelte';
	import VideoPlaylistPlayer from '$lib/components/VideoPlaylistPlayer.svelte';
	import type { LayoutData } from './$types';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { availableTypesTag } from '../utils/data';
	import { activeFilter, isLoading } from '$lib/stores/videoStore';
	import { setFilter } from '../utils/videoUtils';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { afterUpdate, onMount } from 'svelte';
	export let data: LayoutData;
	const SITE_URL = 'https://missionnaire.net';
	const DEFAULT_SEO_DESCRIPTION =
		"Prédications, cantiques, littérature et transcriptions du Message de l'Heure pour l'édification spirituelle.";
	const DEFAULT_SEO_TITLE = 'Missionnaire Network | Prédications et Cantiques du Message';
	let headerRef: HTMLDivElement | null = null;
	let homeFilterRef: HTMLDivElement | null = null;
	let headerHeight = 120;
	let topContentOffset = 120;
	let resizeObserver: ResizeObserver | null = null;

	$: isHomePage = $page.url.pathname === '/';

	if (browser) {
		(window as any).onYouTubeIframeAPIReady = () => {
			window.dispatchEvent(new CustomEvent('yt-ready'));
		};
	}

	const updateLayoutOffset = () => {
		if (!browser) return;

		const nextHeaderHeight = headerRef?.offsetHeight ?? 0;
		const nextFilterHeight = isHomePage ? homeFilterRef?.offsetHeight ?? 0 : 0;

		headerHeight = nextHeaderHeight;
		topContentOffset = nextHeaderHeight + nextFilterHeight;
	};

	const observeStickySections = () => {
		if (!resizeObserver) return;
		resizeObserver.disconnect();

		if (headerRef) {
			resizeObserver.observe(headerRef);
		}

		if (isHomePage && homeFilterRef) {
			resizeObserver.observe(homeFilterRef);
		}
	};

	onMount(() => {
		if (!browser) return;

		resizeObserver = new ResizeObserver(() => {
			updateLayoutOffset();
		});

		observeStickySections();
		updateLayoutOffset();
		window.addEventListener('resize', updateLayoutOffset);

		return () => {
			resizeObserver?.disconnect();
			window.removeEventListener('resize', updateLayoutOffset);
		};
	});

	afterUpdate(() => {
		if (!browser || !resizeObserver) return;
		observeStickySections();
		updateLayoutOffset();
	});

	$: canonicalUrl = `${SITE_URL}${$page.url.pathname}`;
</script>

<svelte:head>
	<title>Missionnaire Network</title>
	<script src="https://www.youtube.com/iframe_api"></script>
	<link rel="canonical" href={canonicalUrl} />
	<meta name="description" content={DEFAULT_SEO_DESCRIPTION} />
	<meta property="og:site_name" content="Missionnaire Network" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={DEFAULT_SEO_TITLE} />
	<meta property="og:description" content={DEFAULT_SEO_DESCRIPTION} />
	<meta property="og:url" content={canonicalUrl} />
	<meta property="og:logo" content="https://missionnaire.net/favicon.png" />
	<meta property="og:image" content="https://missionnaire.net/og-image.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={DEFAULT_SEO_TITLE} />
	<meta name="twitter:description" content={DEFAULT_SEO_DESCRIPTION} />
	<meta name="twitter:image" content="https://missionnaire.net/og-image.png" />
</svelte:head>

<QueryClientProvider client={data.queryClient}>
	<div class="relative">
		<div bind:this={headerRef} class="flex flex-col fixed top-0 z-40 bg-white w-full">
			<SocialMediaAbove isLiveStream={!!data.liveStream} liveUrl={data.liveStream?.webpage_url} />
			<NavBar />
		</div>
		{#if isHomePage}
			<div
				bind:this={homeFilterRef}
				class="fixed top-[100px] left-0 right-0 z-30 bg-white shadow-sm"
				style={browser ? `top: ${headerHeight}px;` : undefined}
			>
				<div class="max-w-[1640px] mx-auto px-5 py-4">
					<div class="flex flex-wrap gap-2 items-center">
						{#each availableTypesTag as tagType}
							<button
								class="px-3 py-1 rounded-full text-sm {$activeFilter === tagType.label
									? 'bg-hardBlack text-white'
									: 'bg-gray-200 text-gray-700'}"
								on:click={() => setFilter(tagType.label)}
							>
								{tagType.label}
							</button>
						{/each}
						{#if $isLoading}
							<div class="inline-block">
								<div
									class="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-primary"
								/>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}
		<div
			class={`relative ${isHomePage ? 'mt-[170px]' : 'mt-[120px]'}`}
			style={browser ? `margin-top: ${topContentOffset}px;` : undefined}
		>
			<slot />
		</div>
	</div>
	<Footer />
	<CopyButton />
	<VideoPlaylistPlayer />
</QueryClientProvider>
