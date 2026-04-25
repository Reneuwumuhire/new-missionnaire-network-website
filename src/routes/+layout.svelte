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
	import AudioPlayer from '$lib/components/+audioPlayer.svelte';
	// ── BEGIN: PWA update banner (added) ────────────────────────────
	import UpdateBanner from '$lib/components/+updateBanner.svelte';
	// ── END: PWA update banner ──────────────────────────────────────
	import ResumeRecorder from '$lib/components/+resumeRecorder.svelte';
	import { selectAudio } from '$lib/stores/global';
	import type { LayoutData } from './$types';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { navigating, page } from '$app/stores';
	import { afterNavigate, goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { onMount, onDestroy, tick } from 'svelte';
	import { radioIsLive } from '$lib/stores/global';
	export let data: LayoutData;
	const SITE_URL = 'https://missionnaire.net';
	const DEFAULT_SEO_DESCRIPTION =
		"Prédications, cantiques, littérature et transcriptions du Message de l'Heure pour l'édification spirituelle.";
	const DEFAULT_SEO_TITLE = 'Missionnaire Network | Prédications et Cantiques du Message';
	const LAST_MUSIC_PATH_KEY = 'missionnaire:last-music-path';
	let headerRef: HTMLDivElement | null = null;
	let headerHeight = 120;
	let resizeObserver: ResizeObserver | null = null;

	function rememberMusicPath(url: URL) {
		if (!browser || url.pathname !== '/musique') return;
		const seed = url.searchParams.get('seed') || '';
		if (!seed) return;
		try {
			localStorage.setItem(LAST_MUSIC_PATH_KEY, `${url.pathname}${url.search}`);
		} catch {
			/* localStorage unavailable */
		}
	}

	function getRememberedMusicPath() {
		if (!browser) return '';
		try {
			return localStorage.getItem(LAST_MUSIC_PATH_KEY) || '';
		} catch {
			return '';
		}
	}

	function handleRememberedMusicLinkClick(event: MouseEvent) {
		if (!browser || event.defaultPrevented) return;
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
			return;

		const anchor = event
			.composedPath()
			.find(
				(node): node is HTMLAnchorElement =>
					node instanceof HTMLAnchorElement && node.hasAttribute('href')
			);
		if (!(anchor instanceof HTMLAnchorElement)) return;
		if (anchor.target && anchor.target !== '_self') return;

		const href = anchor.getAttribute('href');
		if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:'))
			return;

		const destination = new URL(anchor.href, window.location.href);
		if (destination.origin !== window.location.origin) return;
		if (destination.pathname !== '/musique' || destination.search) return;

		const rememberedPath = getRememberedMusicPath();
		if (!rememberedPath || rememberedPath === '/musique') return;

		event.preventDefault();
		void goto(rememberedPath);
	}

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
		} catch {
			/* ignore */
		}
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
		const fontUrl =
			'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&family=Outfit:wght@300;400;500;600;700&display=swap';
		if (!document.querySelector(`link[href="${fontUrl}"]`)) {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = fontUrl;
			document.head.appendChild(link);
		}
	});

	// ── PWA resume & splash handoff ─────────────────────────────────
	// Once Svelte has hydrated we flip a flag on <html> so the inline
	// splash in app.html fades out immediately. Then record every path
	// the listener visits so a subsequent PWA launch can resume there.
	onMount(async () => {
		if (!browser) return;
		await tick();
		// ▶︎ THIS is the single line that hides the inline splash from
		//   app.html (the `.pwa-ready .app-splash` rule fades + hides it).
		document.documentElement.classList.add('pwa-ready');
		// Give the fade a moment to finish before yanking the node so
		// users don't see an abrupt cut — but also never leave it in the
		// DOM longer than a couple seconds.
		setTimeout(() => {
			document.querySelector('.app-splash')?.remove();
		}, 700);
	});

	onMount(() => {
		if (!browser) return;
		document.addEventListener('click', handleRememberedMusicLinkClick, true);
		return () => {
			document.removeEventListener('click', handleRememberedMusicLinkClick, true);
		};
	});

	// ── BEGIN: service worker registration (added) ──────────────────
	// SvelteKit auto-registers `src/service-worker.ts` in production
	// builds; this explicit hook is a belt-and-braces fallback so the
	// audio cache layer also activates in environments where the auto-
	// registration might be disabled (custom adapters, dev preview).
	// `register('/service-worker.js')` is idempotent — the browser
	// dedupes by scope URL, so registering twice is a no-op.
	onMount(() => {
		if (!browser) return;
		if (!('serviceWorker' in navigator)) return;
		navigator.serviceWorker
			.register('/service-worker.js', { scope: '/', type: 'module' })
			.catch((err) => {
			console.warn('[SW] registration failed:', err);
			});
	});
	// ── END: service worker registration ────────────────────────────

	afterNavigate(({ to }) => {
		if (!browser || !to) return;
		try {
			const path = to.url.pathname + to.url.search;
			// Don't record bare "/" or error routes — those are fallbacks, not
			// destinations the listener wanted to return to.
			if (path === '/' || path.startsWith('/__')) return;
			localStorage.setItem('missionnaire:last-path', path);
			localStorage.setItem('missionnaire:last-path-at', Date.now().toString());
			rememberMusicPath(to.url);
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
	<div class="fixed top-0 left-0 right-0 z-[9999] h-[2px] overflow-hidden">
		<div class="h-full w-full animate-progress"></div>
	</div>
{/if}

<QueryClientProvider client={data.queryClient}>
	<div class="relative">
		<div
			bind:this={headerRef}
			class="flex flex-col fixed top-0 z-40 bg-[#FAF8F3]/95 backdrop-blur-sm w-full"
		>
			<SocialMediaAbove />
			<NavBar />
		</div>
		<div class="relative mt-[120px]" style={browser ? `margin-top: ${headerHeight}px;` : undefined}>
			{#key $page.url.pathname}
				<div class="page-fade-in">
					<slot />
				</div>
			{/key}
		</div>
	</div>
	<Footer />
	<CopyButton />
	<VideoPlaylistPlayer />
	<InstallPrompt />
	<OfflineIndicator />
	<PullToRefresh />
	<!-- ── BEGIN: PWA update banner (added) ─────────────────────────
	     Shown only when a new service worker is waiting. The user
	     clicks "Recharger" to apply the update; no forced reloads. -->
	<UpdateBanner />
	<!-- ── END: PWA update banner ──────────────────────────────── -->
	<!-- Global audio player. Mounted at the root so the bottom bar
	     persists across every navigation — listeners can browse the
	     site while a sermon or rediffusion keeps playing. Previously
	     mounted per-section (/musique, /predications), which meant
	     navigating out of the section unmounted the bar mid-playback. -->
	{#if $selectAudio}
		<AudioPlayer />
	{/if}
	<ResumeRecorder />
</QueryClientProvider>
