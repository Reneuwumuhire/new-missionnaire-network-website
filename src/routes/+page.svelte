<script lang="ts">
	import ResumeToast from '$lib/components/+resumeToast.svelte';
	import { t, locale } from '../i18n';
	import '../app.css';
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import type { YoutubeVideo } from '$lib/models/youtube';
	import NotificationBell from '$lib/components/+notificationBell.svelte';
	import LiveDiscovery from '$lib/components/LiveDiscovery.svelte';
	import type { LiveDiscovery as LiveDiscoveryData } from '$lib/server/live-discovery';

	interface Props {
		data: {
			data: YoutubeVideo[];
			discovery: LiveDiscoveryData;
		};
	}

	let { data }: Props = $props();

	let discovery = $state<LiveDiscoveryData>();
	let radioIsLive = $derived((discovery ?? data.discovery).kind === 'live');
	const hasUpcomingService = $derived((discovery ?? data.discovery).kind === 'scheduled');
	let recentVideos = $derived((data.data || []).slice(0, 3));

	let bellRef: NotificationBell | undefined = $state();
	let bellSubscribed = $state(false);

	// Scroll-triggered reveal
	let sectionsVisible: Record<string, boolean> = $state({});
	let scrolledPastHero = $state(false);

	onMount(() => {
		if (!browser) return;

		// Hide scroll indicator once scrolled past hero
		const handleScroll = () => {
			scrolledPastHero = window.scrollY > 200;
		};
		handleScroll();
		window.addEventListener('scroll', handleScroll, { passive: true });
		if (!('IntersectionObserver' in window)) {
			return () => window.removeEventListener('scroll', handleScroll);
		}

		// Intersection observer for scroll reveals
		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						const id = entry.target.getAttribute('data-reveal');
						if (id) sectionsVisible[id] = true;
						observer.unobserve(entry.target);
					}
				});
			},
			{ threshold: 0.15 }
		);

		document.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el));

		return () => {
			observer.disconnect();
			window.removeEventListener('scroll', handleScroll);
		};
	});

	// Hero Bible verse rotator
	const heroVerses = $derived([
		{ text: $t('home.verse1'), ref: $t('home.verseRef1') },
		{ text: $t('home.verse2'), ref: $t('home.verseRef2') },
		{ text: $t('home.verse3'), ref: $t('home.verseRef3') },
		{ text: $t('home.verse4'), ref: $t('home.verseRef4') },
		{ text: $t('home.verse5'), ref: $t('home.verseRef5') },
		{ text: $t('home.verse6'), ref: $t('home.verseRef6') },
		{ text: $t('home.verse7'), ref: $t('home.verseRef7') },
		{ text: $t('home.verse8'), ref: $t('home.verseRef8') },
		{ text: $t('home.verse9'), ref: $t('home.verseRef9') },
		{ text: $t('home.verse10'), ref: $t('home.verseRef10') }
	]);
	let heroVerseIndex = $state(0);
	let heroVerseVisible = $state(true);

	onMount(() => {
		const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
		let interval: ReturnType<typeof setInterval> | undefined;
		let timeout: ReturnType<typeof setTimeout> | undefined;

		const stop = () => {
			clearInterval(interval);
			clearTimeout(timeout);
			interval = undefined;
			heroVerseVisible = true;
		};
		const syncMotion = () => {
			if (motionPreference.matches) {
				stop();
			} else if (!interval) {
				interval = setInterval(() => {
					heroVerseVisible = false;
					timeout = setTimeout(() => {
						heroVerseIndex = (heroVerseIndex + 1) % heroVerses.length;
						heroVerseVisible = true;
					}, 600);
				}, 7000);
			}
		};

		motionPreference.addEventListener('change', syncMotion);
		syncMotion();
		return () => {
			motionPreference.removeEventListener('change', syncMotion);
			stop();
		};
	});

	const quickLinks = $derived([
		{ label: $t('nav.predications'), href: '/predications', icon: '✦' },
		{ label: $t('nav.videos'), href: '/videos', icon: '▶' },
		{ label: $t('nav.musique'), href: '/musique', icon: '♪' },
		{ label: $t('nav.direct'), href: '/live', icon: '◉' },
		{ label: $t('nav.transcriptions'), href: '/transcriptions', icon: '¶' },
		{ label: $t('nav.literature'), href: '/literature', icon: '▣' }
	]);

	function getSmallThumbnail(video: YoutubeVideo): string {
		const url = video.thumbnail || '';
		return url.replace(/maxresdefault|hqdefault/, 'mqdefault');
	}

	function getVideoDateLabel(video: YoutubeVideo): string {
		const timestamp =
			typeof video.release_timestamp === 'number'
				? video.release_timestamp * 1000
				: Date.parse(video.upload_date || '');
		if (!Number.isFinite(timestamp)) return '';
		return new Date(timestamp).toLocaleDateString($locale === 'en' ? 'en-US' : 'fr-FR', {
			day: '2-digit',
			month: 'long',
			year: 'numeric'
		});
	}
</script>

<!-- Title/description/og:*/twitter:* come from `meta` in +page.server.ts —
     the root layout renders the single canonical tag set (see $lib/seo). -->
<svelte:head>
	<meta name="google-site-verification" content="5KUjbDomG7hhFBwtEU79pKDetc2q3I2qhEE_0BO4o_o" />
</svelte:head>

<ResumeToast />

<main class="homepage relative overflow-hidden">
	<!-- Grain overlay -->
	<div
		class="fixed inset-0 pointer-events-none z-50 mix-blend-multiply opacity-[0.03]"
		aria-hidden="true"
	>
		<div class="grain-texture w-full h-full"></div>
	</div>

	<!-- ═══ HERO ═══ -->
	<section
		class="relative min-h-svh flex flex-col items-center justify-center overflow-hidden px-5 pt-20 pb-12"
	>
		<!-- Radial warm glow -->
		<div
			class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] md:w-[900px] h-[600px] md:h-[900px] rounded-full pointer-events-none"
			style="background: radial-gradient(circle, rgba(255,136,12,0.06) 0%, transparent 70%);"
			aria-hidden="true"
		></div>

		<!-- Cross at the origin of the vertical line — descends from above -->
		<div
			class="absolute left-1/2 top-[80px] md:top-[90px] -translate-x-1/2 z-10 pointer-events-none cross-descend"
			aria-hidden="true"
		>
			<svg width="22" height="30" viewBox="0 0 28 38" fill="none" class="md:w-7 md:h-[38px]">
				<rect x="10" y="0" width="8" height="38" rx="1.5" fill="#FF880C" fill-opacity="0.25" />
				<rect x="0" y="8" width="28" height="8" rx="1.5" fill="#FF880C" fill-opacity="0.25" />
			</svg>
		</div>

		<!-- Decorative vertical line — grows from below the cross -->
		<div
			class="absolute left-1/2 top-[118px] md:top-[128px] bottom-0 w-px -translate-x-1/2 pointer-events-none line-grow"
			aria-hidden="true"
		></div>

		<div class="relative z-10 max-w-4xl mx-auto text-center hero-content">
			<p
				class="hero-label text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.35em] md:tracking-[0.4em] text-missionnaire mb-4 md:mb-6 font-body"
			>
				Missionnaire Network
			</p>

			<h1
				class="hero-title font-display font-semibold text-[clamp(2.3rem,7.5vw,5.2rem)] leading-[1.05] tracking-tight text-stone-900"
			>
				{$t('home.heroTitle')}<br />
				<span class="text-missionnaire italic">{$t('home.heroToday')}</span>
			</h1>

			<p
				class="hero-subtitle mt-5 md:mt-7 text-stone-400 max-w-md mx-auto leading-relaxed text-[15px] md:text-[17px] font-body font-light px-2"
			>
				{$t('home.subtitle')}
			</p>

			<div
				class="hero-cta mx-auto mt-8 flex flex-col justify-center gap-3 md:mt-10 {hasUpcomingService
					? 'w-full max-w-xl items-center'
					: 'sm:flex-row sm:gap-4'}"
			>
				<LiveDiscovery initial={data.discovery} bind:current={discovery} />
				<a
					href="/predications"
					class="flex items-center justify-center font-body font-semibold text-stone-600 transition-colors hover:text-earth-dark {hasUpcomingService
						? 'min-h-11 px-3 text-sm underline decoration-stone-300 underline-offset-4 hover:decoration-missionnaire'
						: 'border border-stone-300 px-6 py-3.5 text-[11px] uppercase tracking-[0.2em] hover:border-missionnaire sm:px-8 sm:text-[12px]'}"
				>
					{$t('home.exploreSermons')}
				</a>
			</div>

			<form
				action="/recherche"
				method="GET"
				class="mx-auto mt-4 flex max-w-xl border border-stone-300 bg-white/60 text-left font-body"
			>
				<input
					name="q"
					required
					minlength="2"
					maxlength="500"
					type="search"
					aria-label={$t('search.library')}
					placeholder={$t('search.library')}
					class="min-w-0 flex-1 bg-transparent px-4 py-2 text-sm"
				/>
				<button class="px-4 py-2 text-sm font-semibold text-earth-dark"
					>{$t('search.library')}</button
				>
			</form>

			<!-- Animated Bible verse below buttons -->
			<div class="hero-verse mt-8 md:mt-12 max-w-xl mx-auto">
				<div class="ornament-line text-missionnaire/30 mb-4 md:mb-5">
					<svg width="10" height="10" viewBox="0 0 14 14" fill="none"
						><path
							d="M7 0L8.5 5.5L14 7L8.5 8.5L7 14L5.5 8.5L0 7L5.5 5.5L7 0Z"
							fill="currentColor"
						/></svg
					>
				</div>
				<div class="verse-anim" class:verse-visible={heroVerseVisible} style="min-height: 3.5rem;">
					<p class="font-display text-base md:text-xl italic text-stone-500 leading-relaxed px-2">
						« {heroVerses[heroVerseIndex].text} »
					</p>
					<p
						class="text-[10px] md:text-[11px] font-bold uppercase tracking-[0.25em] md:tracking-[0.3em] text-missionnaire/70 mt-2 md:mt-3 font-body"
					>
						— {heroVerses[heroVerseIndex].ref}
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Scroll indicator — fixed to viewport bottom, hidden after scroll -->
	{#if !scrolledPastHero}
		<div class="fixed bottom-6 left-1/2 z-30 flex flex-col items-center gap-2 scroll-indicator">
			<span class="text-[10px] uppercase tracking-[0.3em] text-stone-500 font-body font-semibold"
				>{$t('home.scroll')}</span
			>
			<div class="scroll-chevrons flex flex-col items-center">
				<svg
					width="22"
					height="12"
					viewBox="0 0 22 12"
					fill="none"
					class="chevron-1 text-stone-400"
				>
					<path
						d="M2 2L11 9L20 2"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				<svg
					width="22"
					height="12"
					viewBox="0 0 22 12"
					fill="none"
					class="chevron-2 text-missionnaire -mt-1"
				>
					<path
						d="M2 2L11 9L20 2"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</div>
		</div>
	{/if}

	<!-- ═══ QUICK NAV ═══ -->
	<nav
		data-reveal="nav"
		class="reveal-section max-w-6xl mx-auto px-6 py-16 border-t border-stone-200/60"
		class:revealed={sectionsVisible['nav']}
	>
		<div class="grid grid-cols-3 md:grid-cols-6 gap-3">
			{#each quickLinks as link, i}
				<a
					href={link.href}
					class="quick-link group flex flex-col items-center gap-3 py-6 px-3 border border-transparent hover:border-stone-200 hover:bg-white/50 transition-all duration-300"
					style="animation-delay: {i * 80}ms"
				>
					<span
						class="text-lg text-stone-300 group-hover:text-missionnaire transition-colors duration-300"
						>{link.icon}</span
					>
					<span
						class="text-[11px] font-semibold uppercase tracking-[0.15em] text-stone-500 group-hover:text-stone-800 transition-colors duration-300 font-body"
						>{link.label}</span
					>
				</a>
			{/each}
		</div>
	</nav>

	<!-- ═══ RADIO STATUS ═══ -->
	<div
		data-reveal="radio"
		class="reveal-section max-w-6xl mx-auto px-6 mb-16"
		class:revealed={sectionsVisible['radio']}
	>
		<div class="flex flex-col sm:flex-row gap-4">
			<a
				href={radioIsLive ? (discovery ?? data.discovery).href : '/live'}
				class="group flex items-center gap-4 px-6 py-5 border flex-1 transition-all duration-200 bg-white/40 {radioIsLive
					? 'border-red-200 bg-red-50/40 hover:bg-red-50'
					: 'border-stone-200/60 hover:border-missionnaire/30 hover:bg-white/60'}"
			>
				<span class="relative flex h-2.5 w-2.5 shrink-0">
					{#if radioIsLive}
						<span
							class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"
						></span>
						<span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"></span>
					{:else}
						<span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-stone-300"></span>
					{/if}
				</span>
				<div class="flex-1 min-w-0">
					<p
						class="text-sm font-body {radioIsLive
							? 'text-red-700 font-semibold'
							: 'text-stone-700 font-medium'}"
					>
						{radioIsLive ? $t('home.onAir') : $t('home.offAir')}
					</p>
					<p class="text-[11px] text-stone-400 font-body mt-0.5">
						{radioIsLive ? $t('home.clickListen') : $t('home.goLive')}
					</p>
				</div>
				<span class="text-stone-300 group-hover:text-missionnaire transition-colors text-xs">→</span
				>
			</a>

			<button
				onclick={() => bellRef?.toggle()}
				class="group flex items-center gap-4 px-6 py-5 border-2 transition-all duration-200 active:scale-[0.98] cursor-pointer sm:w-auto {bellSubscribed
					? 'border-missionnaire bg-orange-50/70'
					: 'border-stone-200/60 bg-white/40 hover:border-missionnaire/30 hover:bg-white/60'}"
			>
				<NotificationBell bind:this={bellRef} bind:isSubscribed={bellSubscribed} />
				<div class="flex-1 min-w-0 text-left">
					{#if bellSubscribed}
						<p class="text-sm font-semibold text-missionnaire font-body">
							{$t('live.notif.disableTitle')}
						</p>
						<p class="text-[11px] text-stone-400 font-body mt-0.5">
							{$t('live.notif.enabledSubtitle')}
						</p>
					{:else}
						<p class="text-sm font-medium text-stone-700 font-body">
							{$t('live.notif.enableTitle')}
						</p>
						<p class="text-[11px] text-stone-400 font-body mt-0.5">
							{$t('live.notif.enableSubtitle')}
						</p>
					{/if}
				</div>
			</button>
		</div>
	</div>

	<!-- ═══ LATEST VIDEOS (moved above Mission) ═══ -->
	{#if recentVideos.length > 0}
		<section
			data-reveal="videos"
			class="reveal-section max-w-6xl mx-auto px-6 pb-16"
			class:revealed={sectionsVisible['videos']}
		>
			<div class="pt-4">
				<div class="flex items-end justify-between mb-10">
					<div>
						<p
							class="text-[10px] font-semibold uppercase tracking-[0.3em] text-missionnaire font-body mb-2"
						>
							{$t('home.new')}
						</p>
						<h2
							class="font-display font-semibold text-3xl md:text-[2.6rem] tracking-tight leading-[1.05] text-stone-900"
						>
							{$t('home.recent')}
						</h2>
					</div>
					<a href="/videos" class="section-cta hidden sm:inline-flex">
						<span class="section-cta-label">{$t('home.seeAll')}</span>
						<span class="section-cta-arrow" aria-hidden="true">→</span>
					</a>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
					{#each recentVideos as video, i (video._id)}
						{@const publishedLabel = getVideoDateLabel(video)}
						{@const videoPageUrl = `/videos?v=${video.id || video._id}`}
						<a
							href={videoPageUrl}
							class="video-card group block card-lift border border-stone-200/60 bg-white/40 overflow-hidden"
							style="animation-delay: {i * 120}ms"
						>
							{#if video.thumbnail}
								<div class="relative overflow-hidden aspect-video">
									<img
										src={getSmallThumbnail(video)}
										alt={video.title}
										width="320"
										height="180"
										loading="lazy"
										decoding="async"
										class="w-full h-full object-cover img-zoom"
									/>
									<div
										class="absolute inset-0 bg-stone-900/0 group-hover:bg-stone-900/20 transition-colors duration-300 flex items-center justify-center"
									>
										<div
											class="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 scale-90 group-hover:scale-100"
										>
											<svg width="14" height="16" viewBox="0 0 14 16" fill="none">
												<path
													d="M2 1.5L12.5 8L2 14.5V1.5Z"
													fill="#1c1917"
													stroke="#1c1917"
													stroke-width="1.5"
													stroke-linejoin="round"
												/>
											</svg>
										</div>
									</div>
								</div>
							{/if}
							<div class="p-4">
								{#if publishedLabel}
									<p
										class="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400 mb-1.5 font-body tabular-nums"
									>
										{publishedLabel}
									</p>
								{/if}
								<p
									class="text-sm font-medium text-stone-700 group-hover:text-missionnaire transition-colors duration-300 line-clamp-2 font-body leading-relaxed"
								>
									{video.title}
								</p>
							</div>
						</a>
					{/each}
				</div>

				<a href="/videos" class="section-cta section-cta-mobile sm:hidden mt-8">
					<span class="section-cta-label">{$t('home.seeAll')}</span>
					<span class="section-cta-arrow" aria-hidden="true">→</span>
				</a>
			</div>
		</section>

		<!-- ═══ ORNAMENT (between Videos and Mission) ═══ -->
		<div class="max-w-6xl mx-auto px-6 mb-4">
			<div class="ornament-line text-missionnaire/40">
				<svg width="12" height="12" viewBox="0 0 14 14" fill="none"
					><path
						d="M7 0L8.5 5.5L14 7L8.5 8.5L7 14L5.5 8.5L0 7L5.5 5.5L7 0Z"
						fill="currentColor"
					/></svg
				>
			</div>
		</div>
	{/if}

	<!-- ═══ MISSION + KEY FIGURES ═══ -->
	<section
		data-reveal="mission"
		class="reveal-section max-w-6xl mx-auto px-6 mb-20"
		class:revealed={sectionsVisible['mission']}
	>
		<div class="flex items-end justify-between mb-10">
			<div>
				<p
					class="text-[10px] font-semibold uppercase tracking-[0.3em] text-missionnaire font-body mb-2"
				>
					{$t('about.kicker')}
				</p>
				<h2
					class="font-display font-semibold text-3xl md:text-[2.6rem] tracking-tight leading-[1.05] text-stone-900"
				>
					{$t('home.heritage')}
				</h2>
			</div>
			<a href="/a-propos" class="section-cta hidden sm:inline-flex">
				<span class="section-cta-label">{$t('home.learnMore')}</span>
				<span class="section-cta-arrow" aria-hidden="true">→</span>
			</a>
		</div>

		<div class="grid md:grid-cols-12 gap-6 md:gap-8">
			<!-- Mission editorial image block -->
			<div class="md:col-span-7">
				<div class="relative group card-lift">
					<div class="relative overflow-hidden">
						<picture>
							<source srcset="/img/eglise_inside.webp" type="image/webp" />
							<img
								src="/img/eglise_inside.jpg"
								alt={$t('home.churchAlt')}
								class="w-full aspect-[4/3] object-cover img-zoom"
								width="400"
								height="300"
								sizes="(max-width: 768px) 100vw, 58vw"
								fetchpriority="high"
							/>
						</picture>
						<div
							class="absolute inset-0 bg-gradient-to-t from-stone-900/70 via-stone-900/20 to-transparent"
						></div>
						<div class="absolute bottom-0 left-0 right-0 p-6 md:p-8">
							<p
								class="text-[10px] font-semibold uppercase tracking-[0.3em] text-missionnaire-100 mb-3 font-body"
							>
								{$t('home.mission')}
							</p>
							<h2 class="font-display font-semibold text-3xl md:text-4xl text-white leading-tight">
								{$t('home.spread')} <span class="italic">Message</span><br />{$t('home.world')}
							</h2>
						</div>
					</div>
					<div class="p-6 bg-white/60 border border-t-0 border-stone-200/60">
						<p class="text-sm text-stone-500 leading-relaxed font-body">
							{$t('home.missionBody')}
						</p>
						<a
							href="/a-propos"
							class="inline-block mt-4 text-[11px] font-semibold text-missionnaire uppercase tracking-[0.2em] font-body hover:text-orange-700 transition-colors"
						>
							{$t('home.learnMore')} →
						</a>
					</div>
				</div>
			</div>

			<!-- Key figures -->
			<div class="md:col-span-5 flex flex-col gap-6">
				<a
					href="/william-branham/biographie"
					class="group block border border-stone-200/60 hover:border-missionnaire/30 bg-white/40 transition-all duration-300 card-lift flex-1"
				>
					<div class="p-6 flex items-start gap-5">
						<picture class="shrink-0">
							<source srcset="/img/branham_icon.webp" type="image/webp" />
							<img
								src="/img/branham_icon.png"
								alt="William Branham"
								class="w-16 h-16 rounded-full object-cover ring-2 ring-stone-100 group-hover:ring-missionnaire/20 transition-all duration-300"
								width="160"
								height="160"
								loading="lazy"
								decoding="async"
							/>
						</picture>
						<div>
							<p
								class="font-display font-medium text-xl text-stone-900 group-hover:text-missionnaire transition-colors"
							>
								William M. Branham
							</p>
							<p
								class="text-[10px] text-stone-400 mt-1 font-body uppercase tracking-wider tabular-nums"
							>
								{$t('home.branhamDates')}
							</p>
							<p class="text-sm text-stone-500 mt-2 leading-relaxed font-body">
								{$t('home.branhamBody')}
							</p>
							<span
								class="inline-block mt-3 text-[11px] font-semibold text-missionnaire uppercase tracking-[0.2em] font-body"
							>
								Biographie →
							</span>
						</div>
					</div>
				</a>

				<a
					href="/ewald-frank"
					class="group block border border-stone-200/60 hover:border-missionnaire/30 bg-white/40 transition-all duration-300 card-lift flex-1"
				>
					<div class="p-6 flex items-start gap-5">
						<picture class="shrink-0">
							<source srcset="/img/ewald_frank_second_img.webp" type="image/webp" />
							<img
								src="/img/ewald_frank_second_img.jpg"
								alt="Ewald Frank"
								class="w-16 h-16 rounded-full object-cover ring-2 ring-stone-100 group-hover:ring-missionnaire/20 transition-all duration-300"
								width="160"
								height="160"
								loading="lazy"
								decoding="async"
							/>
						</picture>
						<div>
							<p
								class="font-display font-medium text-xl text-stone-900 group-hover:text-missionnaire transition-colors"
							>
								Ewald Frank
							</p>
							<p class="text-[10px] text-stone-400 mt-1 font-body uppercase tracking-wider">
								{$t('home.ewaldLocation')}
							</p>
							<p class="text-sm text-stone-500 mt-2 leading-relaxed font-body">
								{$t('home.ewaldBody')}
							</p>
							<span
								class="inline-block mt-3 text-[11px] font-semibold text-missionnaire uppercase tracking-[0.2em] font-body"
							>
								{$t('home.learnMore')} →
							</span>
						</div>
					</div>
				</a>

				<!-- Église de Kigali -->
				<a
					href="/eglise"
					class="group block border border-stone-200/60 hover:border-missionnaire/30 bg-white/40 transition-all duration-300 card-lift"
				>
					<div class="p-6">
						<div class="flex items-center gap-3 mb-2">
							<span class="w-2 h-2 rounded-full bg-missionnaire/40"></span>
							<p
								class="text-[10px] font-bold uppercase tracking-[0.3em] text-missionnaire font-body"
							>
								{$t('home.localChurch')}
							</p>
						</div>
						<p
							class="font-display font-medium text-lg text-stone-900 group-hover:text-missionnaire transition-colors"
						>
							{$t('home.kigaliChurch')}
						</p>
						<p class="text-[12px] text-stone-400 mt-1 font-body">
							{$t('home.churchBody')}
						</p>
					</div>
				</a>
			</div>
		</div>
	</section>
</main>

<style>
	/* ── Grain texture ── */
	.grain-texture {
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
		background-repeat: repeat;
		background-size: 256px 256px;
	}

	/* ── Cross descending from above ── */
	.cross-descend {
		transform: translateX(-50%);
	}
	@keyframes cross-fall {
		0% {
			opacity: 0;
			transform: translate(-50%, -60px);
		}
		40% {
			opacity: 0.6;
		}
		70% {
			opacity: 1;
			transform: translate(-50%, 3px);
		}
		85% {
			transform: translate(-50%, -1px);
		}
		100% {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}

	/* ── Vertical line growing downward ── */
	.line-grow {
		background: linear-gradient(
			to bottom,
			rgba(255, 136, 12, 0.15),
			rgba(255, 136, 12, 0.08) 70%,
			transparent
		);
		transform-origin: top;
	}
	@keyframes line-extend {
		from {
			transform: translate(-50%, 0) scaleY(0);
			opacity: 0;
		}
		to {
			transform: translate(-50%, 0) scaleY(1);
			opacity: 1;
		}
	}

	/* ── Hero entrance works even before JavaScript loads ── */
	@keyframes hero-enter {
		from {
			opacity: 0;
			transform: translateY(24px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	/* ── Hero verse gentle animation ── */
	.verse-anim {
		transition:
			opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
			transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
	}
	.verse-anim:not(.verse-visible) {
		opacity: 0;
		transform: translateY(8px);
	}

	/* ── Scroll indicator ── */
	.scroll-indicator {
		transform: translateX(-50%);
	}
	@keyframes indicator-in {
		from {
			opacity: 0;
			transform: translate(-50%, 12px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}
	@keyframes chevron-bounce {
		0%,
		100% {
			opacity: 0.3;
			transform: translateY(0);
		}
		50% {
			opacity: 1;
			transform: translateY(4px);
		}
	}

	/* ── Scroll reveal sections ── */
	@keyframes fade-up {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: no-preference) {
		.cross-descend {
			animation: cross-fall 2.2s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both;
		}
		.line-grow {
			animation: line-extend 1.5s cubic-bezier(0.16, 1, 0.3, 1) 0.8s both;
		}
		.hero-content .hero-label {
			animation: hero-enter 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.25s both;
		}
		.hero-content .hero-title {
			animation: hero-enter 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.4s both;
		}
		.hero-content .hero-subtitle {
			animation: hero-enter 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.6s both;
		}
		.hero-content .hero-cta {
			animation: hero-enter 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.8s both;
		}
		.hero-content .hero-verse {
			animation: hero-enter 0.8s cubic-bezier(0.16, 1, 0.3, 1) 1.1s both;
		}
		.scroll-indicator {
			animation: indicator-in 1s ease 2.5s both;
		}
		.scroll-chevrons .chevron-1 {
			animation: chevron-bounce 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
		}
		.scroll-chevrons .chevron-2 {
			animation: chevron-bounce 2s cubic-bezier(0.4, 0, 0.2, 1) 0.15s infinite;
		}
		.reveal-section.revealed {
			animation: fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
		}
		.revealed .quick-link,
		.revealed .video-card {
			animation: fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.verse-anim {
			transition: none;
		}
	}
</style>
