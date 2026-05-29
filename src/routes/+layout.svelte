<script lang="ts">
	import '../app.css';
	import NavBar from '$lib/components/+navBar.svelte';
	import BottomNav from '$lib/components/+bottomNav.svelte';
	import SocialMediaAbove from '$lib/components/+socialMediaAbove.svelte';
	import Footer from '$lib/components/+footer.svelte';
	import CopyButton from '$lib/components/+copyButton.svelte';
	import VideoPlaylistPlayer from '$lib/components/VideoPlaylistPlayer.svelte';
	import InstallPrompt from '$lib/components/+installPrompt.svelte';
	import OfflineIndicator from '$lib/components/+offlineIndicator.svelte';
	import PullToRefresh from '$lib/components/+pullToRefresh.svelte';
	import AudioPlayer from '$lib/components/+audioPlayer.svelte';
	import UpdateBanner from '$lib/components/+updateBanner.svelte';
	import ResumeRecorder from '$lib/components/+resumeRecorder.svelte';
	import { selectAudio } from '$lib/stores/global';
	import type { LayoutData } from './$types';
	import { QueryClientProvider } from '@tanstack/svelte-query';
	import { navigating, page } from '$app/stores';
	import { afterNavigate, goto } from '$app/navigation';
	import { browser, dev } from '$app/environment';
	import { onMount, tick } from 'svelte';
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
			// Publish the header height so sticky in-page elements (the
			// mobile list toolbar) can offset themselves below the fixed
			// site header.
			document.documentElement.style.setProperty('--header-height', `${headerHeight}px`);
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
	// Pages can publish per-route OG overrides through their `load`'s
	// returned `meta` object. We surface a single set of og:* meta tags
	// in <svelte:head> using these values so crawlers like WhatsApp
	// never see duplicated og:title / og:description tags from layout +
	// page (which they handle inconsistently).
	$: pageMeta = (($page.data as any)?.meta ?? {}) as {
		title?: string;
		description?: string;
		url?: string;
		image?: string;
		imageWidth?: number;
		imageHeight?: number;
		type?: string;
		noindex?: boolean;
	};
	$: ogTitle = pageMeta.title || DEFAULT_SEO_TITLE;
	$: ogDescription = pageMeta.description || DEFAULT_SEO_DESCRIPTION;
	$: ogUrl = pageMeta.url || canonicalUrl;
	$: ogImage = pageMeta.image || `${SITE_URL}/og-image.jpg`;
	$: ogType = pageMeta.type || 'website';
	$: pageNoIndex = pageMeta.noindex === true;
	// og:image:width/height are only safe to declare when we KNOW the image's
	// real dimensions. The default og-image.jpg is 1200×630. A page-supplied
	// image (live thumbnail, etc.) has unknown/variable dimensions — declaring
	// the wrong 1200×630 makes Facebook/WhatsApp mis-render or reject it, so we
	// omit the hints and let the crawler read the real size unless the page
	// passes explicit dimensions.
	$: ogImageDims = pageMeta.image
		? pageMeta.imageWidth && pageMeta.imageHeight
			? { w: pageMeta.imageWidth, h: pageMeta.imageHeight }
			: null
		: { w: 1200, h: 630 };

	const ytPages = ['/videos', '/musique', '/predications'];
	$: needsYouTube = ytPages.some((p) => $page.url.pathname.startsWith(p));

	// Radio live status — push-driven, no polling.
	// 1. SSR seeds `data.radioState` so first paint shows truth.
	// 2. Service Worker forwards Web Push payloads (`{type:'RADIO_PUSH'}`) to
	//    every open tab, so the banner reacts the moment admin goes live.
	// 3. BroadcastChannel keeps multiple tabs in the same browser consistent.
	$: if (browser && data.radioState) {
		radioIsLive.set(data.radioState.isLive);
	}

	let radioBroadcast: BroadcastChannel | null = null;

	onMount(() => {
		if (!browser) return;

		radioIsLive.set(data.radioState?.isLive ?? false);

		// Reconcile against the source of truth on every mount. The SSR HTML
		// can be served stale by the service worker (navigate handler is
		// stale-while-revalidate) or by the edge CDN, so a stale "live" badge
		// can survive a broadcast end indefinitely if push events were
		// missed. /api/live/radio-state is `no-store`, so this always
		// reflects current DB state and corrects the banner within ~100ms
		// of hydration.
		fetch('/api/live/radio-state', { cache: 'no-store' })
			.then((r) => (r.ok ? r.json() : null))
			.then((state) => {
				if (state && typeof state.isLive === 'boolean') {
					radioIsLive.set(state.isLive);
				}
			})
			.catch(() => {
				/* offline or transient failure — keep SSR value */
			});

		const applyPushPayload = (payload: { event?: string } | undefined) => {
			// Default to "live" for backward compat (older payloads without `event`).
			radioIsLive.set(payload?.event !== 'radio-end');
		};

		try {
			radioBroadcast = new BroadcastChannel('radio-state');
			radioBroadcast.addEventListener('message', (event) => {
				if (event.data?.type === 'RADIO_PUSH') applyPushPayload(event.data.payload);
			});
		} catch {
			// BroadcastChannel unsupported — single-tab fallback is fine
		}

		const swListener = (event: MessageEvent) => {
			const msg = event.data;
			if (!msg || msg.type !== 'RADIO_PUSH') return;
			applyPushPayload(msg.payload);
			try {
				radioBroadcast?.postMessage({ type: 'RADIO_PUSH', payload: msg.payload });
			} catch {
				/* channel closed */
			}
		};
		navigator.serviceWorker?.addEventListener('message', swListener);

		return () => {
			navigator.serviceWorker?.removeEventListener('message', swListener);
			radioBroadcast?.close();
			radioBroadcast = null;
		};
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

	// SvelteKit auto-registers `src/service-worker.ts` in production
	// builds; this explicit hook is a belt-and-braces fallback so the
	// audio cache layer also activates in environments where the auto-
	// registration might be disabled (custom adapters, preview builds).
	// `register('/service-worker.js')` is idempotent — the browser
	// dedupes by scope URL, so registering twice is a no-op.
	onMount(() => {
		if (!browser) return;
		if (!('serviceWorker' in navigator)) return;
		if (dev) {
			navigator.serviceWorker.getRegistrations?.().then((registrations) => {
				registrations
					.filter((registration) => registration.scope === `${window.location.origin}/`)
					.forEach((registration) => {
						registration.unregister().catch(() => {
							/* ignore dev cleanup failures */
						});
					});
			});
			return;
		}
		navigator.serviceWorker
			.register('/service-worker.js', { scope: '/', type: 'module' })
			.catch((err) => {
				console.warn('[SW] registration failed:', err);
			});
	});

	afterNavigate(({ to }) => {
		if (!browser || !to) return;
		try {
			// Drop the random-shuffle `seed` before persisting. Seeds are
			// per-session state — keeping one in the saved last-path means
			// every PWA launch resumes onto a stale unique-per-user URL that
			// bypasses both the edge cache and the daily shared seed on the
			// server. Listeners get the fast cache-friendly URL on resume;
			// the "Rafraîchir" button still creates a fresh seed when they
			// want one mid-session.
			const cleaned = new URL(to.url.toString());
			cleaned.searchParams.delete('seed');
			const search = cleaned.searchParams.toString();
			const path = cleaned.pathname + (search ? `?${search}` : '');
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
	<title>{ogTitle}</title>
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
	{#if pageNoIndex}
		<!-- Pages publish `meta.noindex: true` in their load when they're
		     filter/share variants whose canonical content already lives
		     elsewhere (e.g. /musique?search=…). Saves crawl budget and
		     clears the "Crawled — currently not indexed" report. -->
		<meta name="robots" content="noindex, follow" />
	{/if}
	<meta name="description" content={ogDescription} />
	<meta property="og:site_name" content="Missionnaire Network" />
	<meta property="og:type" content={ogType} />
	<meta property="og:title" content={ogTitle} />
	<meta property="og:description" content={ogDescription} />
	<meta property="og:url" content={ogUrl} />
	<meta property="og:logo" content="https://missionnaire.net/favicon.png" />
	<meta property="og:image" content={ogImage} />
	{#if ogImageDims}
		<meta property="og:image:width" content={String(ogImageDims.w)} />
		<meta property="og:image:height" content={String(ogImageDims.h)} />
	{/if}
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={ogTitle} />
	<meta name="twitter:description" content={ogDescription} />
	<meta name="twitter:image" content={ogImage} />
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
	<UpdateBanner />
	<!-- Global audio player. Mounted at the root so the bottom bar
	     persists across every navigation — listeners can browse the
	     site while a sermon or rediffusion keeps playing. Previously
	     mounted per-section (/musique, /predications), which meant
	     navigating out of the section unmounted the bar mid-playback. -->
	<!--
		AudioPlayer mounts unconditionally so the DOM-attached <audio> element
		inside it exists for the lifetime of the session. The player's own
		template uses {#if $selectAudio} internally to hide its UI when no
		track is selected, so visually this is identical to the previous
		conditional mount — but the audio element survives, which is what
		iOS needs to attribute the audio session to *this* PWA's WebKit
		process rather than the shared media daemon.
	-->
	<AudioPlayer />
	<ResumeRecorder />
	<!-- Mobile-only bottom navigation. Fixed at the viewport bottom for
	     one-tap access to the most-visited sections; the audio player is
	     lifted above it (see `--bottom-nav-height` in app.css). -->
	<BottomNav />
</QueryClientProvider>
