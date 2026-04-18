<script lang="ts">
	import '../app.css';
	import NavBar from '$lib/components/+navBar.svelte';
	import SocialMediaAbove from '$lib/components/+socialMediaAbove.svelte';
	import Footer from '$lib/components/+footer.svelte';
	import CopyButton from '$lib/components/+copyButton.svelte';
	import VideoPlaylistPlayer from '$lib/components/VideoPlaylistPlayer.svelte';
	import InstallPrompt from '$lib/components/+installPrompt.svelte';
	import OfflineIndicator from '$lib/components/+offlineIndicator.svelte';
	import PullToRefresh from '$lib/components/+pullToRefresh.svelte';
	import type { LayoutData } from './$types';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { navigating, page } from '$app/stores';
	import { afterNavigate } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount, onDestroy, tick } from 'svelte';
	import { radioIsLive } from '$lib/stores/global';
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

	// Radio live status polling — runs globally so the banner works on all pages
	let radioPollTimer: ReturnType<typeof setInterval> | null = null;

	async function pollRadioStatus() {
		try {
			const res = await fetch('/api/live/radio-poll');
			if (!res.ok) return;
			const status = (await res.json()) as { isLive: boolean };
			radioIsLive.set(status.isLive);
		} catch { /* ignore */ }
	}

	onMount(() => {
		if (!browser) return;
		pollRadioStatus();
		radioPollTimer = setInterval(pollRadioStatus, 10_000);
	});

	onDestroy(() => {
		if (radioPollTimer) clearInterval(radioPollTimer);
	});

	// Load Google Fonts globally (non-render-blocking)
	onMount(() => {
		if (!browser) return;
		const fontUrl = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Outfit:wght@300;400;500;600;700&display=swap';
		if (!document.querySelector(`link[href="${fontUrl}"]`)) {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = fontUrl;
			document.head.appendChild(link);
		}
	});

	// ── PWA resume & splash handoff ─────────────────────────────────
	// Once Svelte has hydrated we flip a flag on <html> so the inline
	// splash in app.html fades out immediately (faster than the CSS
	// animation delay alone). Then record every path the listener
	// visits so a subsequent PWA launch can resume there.
	onMount(async () => {
		if (!browser) return;
		await tick();
		document.documentElement.classList.add('pwa-ready');
		// Give the fade a moment to finish before yanking the node so
		// users don't see an abrupt cut — but also never leave it in the
		// DOM longer than a couple seconds.
		setTimeout(() => {
			document.querySelector('.app-splash')?.remove();
		}, 700);
	});

	afterNavigate(({ to }) => {
		if (!browser || !to) return;
		try {
			const path = to.url.pathname + to.url.search;
			// Don't record bare "/" or error routes — those are fallbacks, not
			// destinations the listener wanted to return to.
			if (path === '/' || path.startsWith('/__')) return;
			localStorage.setItem('missionnaire:last-path', path);
			localStorage.setItem('missionnaire:last-path-at', Date.now().toString());
		} catch {
			/* localStorage unavailable */
		}
	});
</script>

<svelte:head>
	<title>Missionnaire Network</title>
	<!-- Font preconnect (global) -->
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
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
	<div class="fixed top-0 left-0 right-0 z-[9999] h-[2px]">
		<div class="h-full bg-missionnaire animate-progress"></div>
	</div>
{/if}

<QueryClientProvider client={data.queryClient}>
	<div class="relative">
		<div bind:this={headerRef} class="flex flex-col fixed top-0 z-40 bg-[#FAF8F3]/95 backdrop-blur-sm w-full">
			<SocialMediaAbove />
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
	<PullToRefresh />
</QueryClientProvider>
