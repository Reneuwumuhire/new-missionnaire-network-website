<script lang="ts">
	import '../app.css';
	import NavBar from '$lib/components/+navBar.svelte';
	import SocialMediaAbove from '$lib/components/+socialMediaAbove.svelte';
	import Footer from '$lib/components/+footer.svelte';
	import CopyButton from '$lib/components/+copyButton.svelte';
	import VideoPlaylistPlayer from '$lib/components/VideoPlaylistPlayer.svelte';
	import InstallPrompt from '$lib/components/+installPrompt.svelte';
	import OfflineIndicator from '$lib/components/+offlineIndicator.svelte';
	import type { LayoutData } from './$types';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { navigating, page } from '$app/stores';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	export let data: LayoutData;
	const SITE_URL = 'https://missionnaire.net';
	const DEFAULT_SEO_DESCRIPTION =
		"Prédications, cantiques, littérature et transcriptions du Message de l'Heure pour l'édification spirituelle.";
	const DEFAULT_SEO_TITLE = 'Missionnaire Network | Prédications et Cantiques du Message';
	let headerRef: HTMLDivElement | null = null;
	let headerHeight = 120;
	let resizeObserver: ResizeObserver | null = null;

	if (browser) {
		(window as any).onYouTubeIframeAPIReady = () => {
			window.dispatchEvent(new CustomEvent('yt-ready'));
		};
	}

	let rafId = 0;
	const updateLayoutOffset = () => {
		if (!browser) return;
		cancelAnimationFrame(rafId);
		rafId = requestAnimationFrame(() => {
			headerHeight = headerRef?.offsetHeight ?? 120;
		});
	};

	onMount(() => {
		if (!browser) return;

		resizeObserver = new ResizeObserver(updateLayoutOffset);

		if (headerRef) {
			resizeObserver.observe(headerRef);
		}

		updateLayoutOffset();

		return () => {
			cancelAnimationFrame(rafId);
			resizeObserver?.disconnect();
		};
	});

	$: canonicalUrl = `${SITE_URL}${$page.url.pathname}`;

	const ytPages = ['/videos', '/musique', '/predications'];
	$: needsYouTube = ytPages.some((p) => $page.url.pathname.startsWith(p));
</script>

<svelte:head>
	<title>Missionnaire Network</title>
	{#if needsYouTube}
		<script src="https://www.youtube.com/iframe_api" async></script>
		<link rel="preconnect" href="https://i.ytimg.com" />
		<link rel="preconnect" href="https://www.youtube.com" />
		<link rel="dns-prefetch" href="https://i.ytimg.com" />
		<link rel="dns-prefetch" href="https://www.youtube.com" />
	{/if}
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

{#if $navigating}
	<div class="fixed top-0 left-0 right-0 z-[9999] h-1 bg-orange-100">
		<div class="h-full bg-orange-500 animate-progress rounded-r-full"></div>
	</div>
{/if}

<QueryClientProvider client={data.queryClient}>
	<div class="relative">
		<div bind:this={headerRef} class="flex flex-col fixed top-0 z-40 bg-white w-full">
			<SocialMediaAbove isLiveStream={!!data.liveStream} liveUrl={data.liveStream?.webpage_url} />
			<NavBar />
		</div>
		<div
			class="relative mt-[120px]"
			style={browser ? `margin-top: ${headerHeight}px;` : undefined}
		>
			<slot />
		</div>
	</div>
	<Footer />
	<CopyButton />
	<VideoPlaylistPlayer />
	<InstallPrompt />
	<OfflineIndicator />
</QueryClientProvider>
