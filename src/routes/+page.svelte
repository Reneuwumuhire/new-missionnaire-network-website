<script lang="ts">
	import ResumeToast from '$lib/components/+resumeToast.svelte';
	import { t, locale } from '../i18n';
	import '../app.css';
	import { browser, dev } from '$app/environment';
	import { navigating } from '$app/state';
	import { onMount } from 'svelte';
	import type { YoutubeVideo } from '$lib/models/youtube';
	import NotificationBell from '$lib/components/+notificationBell.svelte';
	import LiveDiscovery from '$lib/components/LiveDiscovery.svelte';
	import LibrarySearchField from '$lib/components/LibrarySearchField.svelte';
	import type { LiveDiscovery as LiveDiscoveryData } from '$lib/server/live-discovery';
	import ArrowRight2 from 'iconsax-svelte/ArrowRight2.svelte';
	import Book1 from 'iconsax-svelte/Book1.svelte';
	import DocumentText from 'iconsax-svelte/DocumentText.svelte';
	import Location from 'iconsax-svelte/Location.svelte';
	import Microphone2 from 'iconsax-svelte/Microphone2.svelte';
	import Musicnote from 'iconsax-svelte/Musicnote.svelte';
	import BellIcon from 'iconsax-svelte/Notification.svelte';
	import PlayCircle from 'iconsax-svelte/PlayCircle.svelte';
	import Radio from 'iconsax-svelte/Radio.svelte';
	import TickCircle from 'iconsax-svelte/TickCircle.svelte';

	interface Props {
		data: {
			data: YoutubeVideo[];
			discovery: LiveDiscoveryData;
		};
	}

	let { data }: Props = $props();
	const searchPending = $derived(
		navigating.type === 'form' && navigating.to?.route.id === '/recherche'
	);

	let discovery = $state<LiveDiscoveryData>();
	let radioIsLive = $derived((discovery ?? data.discovery).kind === 'live');
	const hasUpcomingService = $derived((discovery ?? data.discovery).kind === 'scheduled');
	let recentVideos = $derived((data.data || []).slice(0, 3));

	let bellRef: NotificationBell | undefined = $state();
	let bellSubscribed = $state(false);
	let bellSupported = $state(false);
	let bellPermission = $state<NotificationPermission>('default');
	let bellPending = $state(false);
	let bellFailed = $state(false);
	const bellAvailable = $derived(bellSupported && bellPermission !== 'denied');
	const bellTitle = $derived(
		dev
			? 'live.notif.localTitle'
			: !bellAvailable
				? 'live.notif.unavailableTitle'
				: bellSubscribed
					? 'live.notif.enabledTitle'
					: 'live.notif.enableTitle'
	);

	// Scroll-triggered reveal
	let sectionsVisible: Record<string, boolean> = $state({});

	onMount(() => {
		if (!browser || !('IntersectionObserver' in window)) return;

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

		return () => observer.disconnect();
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
		{ label: $t('nav.predications'), href: '/predications', icon: Microphone2 },
		{ label: $t('nav.videos'), href: '/videos', icon: PlayCircle },
		{ label: $t('nav.musique'), href: '/musique', icon: Musicnote },
		{ label: $t('nav.direct'), href: '/live', icon: Radio },
		{ label: $t('nav.transcriptions'), href: '/transcriptions', icon: DocumentText },
		{ label: $t('nav.literature'), href: '/literature', icon: Book1 }
	]);

	const profiles = $derived([
		{
			name: 'William M. Branham',
			href: '/william-branham/biographie',
			portrait: '/img/branham_icon.png',
			webp: '/img/branham_icon.webp',
			detail: $t('home.branhamDates'),
			description: $t('home.branhamBody')
		},
		{
			name: 'Ewald Frank',
			href: '/ewald-frank',
			portrait: '/img/ewald_frank_second_img.jpg',
			webp: '/img/ewald_frank_second_img.webp',
			detail: $t('home.ewaldLocation'),
			description: $t('home.ewaldBody')
		}
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
	<section class="relative flex flex-col items-center overflow-hidden px-5 pb-8 pt-28">
		<!-- Radial warm glow -->
		<div
			class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] md:w-[900px] h-[600px] md:h-[900px] rounded-full pointer-events-none"
			style="background: radial-gradient(circle, rgba(255,136,12,0.06) 0%, transparent 70%);"
			aria-hidden="true"
		></div>

		<!-- Cross at the origin of the vertical line — descends from above -->
		<div
			class="absolute left-1/2 top-12 -translate-x-1/2 z-10 pointer-events-none cross-descend"
			aria-hidden="true"
		>
			<svg width="22" height="30" viewBox="0 0 28 38" fill="none" class="md:w-7 md:h-[38px]">
				<rect x="10" y="0" width="8" height="38" rx="1.5" fill="#FF880C" fill-opacity="0.25" />
				<rect x="0" y="8" width="28" height="8" rx="1.5" fill="#FF880C" fill-opacity="0.25" />
			</svg>
		</div>

		<!-- Decorative vertical line — grows from below the cross -->
		<div
			class="absolute left-1/2 top-[4.875rem] md:top-[5.375rem] bottom-0 w-px -translate-x-1/2 pointer-events-none line-grow"
			aria-hidden="true"
		></div>

		<div class="hero-content relative z-10 mx-auto w-full max-w-4xl text-center">
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
				role="search"
				aria-label={$t('search.library')}
				aria-busy={searchPending}
				class="mx-auto mt-5 max-w-[32.5rem]"
			>
				<LibrarySearchField pending={searchPending} />
			</form>
			<p class="sr-only" role="status">{searchPending ? $t('search.loading') : ''}</p>

			<!-- Animated Bible verse below buttons -->
			<div class="hero-verse mt-7 md:mt-9 max-w-xl mx-auto">
				<div class="ornament-line text-missionnaire/30 mb-4 md:mb-5">
					<svg width="10" height="10" viewBox="0 0 14 14" fill="none"
						><path
							d="M7 0L8.5 5.5L14 7L8.5 8.5L7 14L5.5 8.5L0 7L5.5 5.5L7 0Z"
							fill="currentColor"
						/></svg
					>
				</div>
				<div class="verse-anim min-h-[6.5rem] md:min-h-24" class:verse-visible={heroVerseVisible}>
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

	<!-- ═══ QUICK NAV ═══ -->
	<nav aria-label={$t('nav.resources')} class="mx-auto max-w-6xl px-5 sm:px-6">
		<ul
			class="grid grid-cols-2 gap-2.5 border-t border-stone-200 pt-6 pb-2.5 sm:grid-cols-3 sm:gap-3 sm:pt-8 sm:pb-3 lg:grid-cols-6"
		>
			{#each quickLinks as link (link.href)}
				<li class="min-w-0">
					<a
						href={link.href}
						class="group flex h-full min-h-[5.25rem] flex-col justify-between gap-2.5 border border-stone-300 bg-cream px-3.5 py-3 text-stone-800 transition-colors hover:border-missionnaire-Yellow-600 hover:bg-missionnaire-50 focus-visible:border-missionnaire-Yellow-600 focus-visible:bg-missionnaire-50 active:bg-missionnaire-100 motion-reduce:transition-none sm:px-4"
					>
						<span aria-hidden="true" class="flex items-center justify-between gap-2">
							<span class="text-missionnaire-Yellow-700">
								<link.icon size={22} color="currentColor" />
							</span>
							<span
								class="text-stone-500 group-hover:text-missionnaire-Yellow-700 group-focus-visible:text-missionnaire-Yellow-700"
							>
								<ArrowRight2 size={18} color="currentColor" />
							</span>
						</span>
						<span class="font-body text-sm font-semibold">{link.label}</span>
					</a>
				</li>
			{/each}
		</ul>
	</nav>

	<!-- ═══ RADIO STATUS ═══ -->
	<div class="mx-auto mb-10 max-w-6xl px-5 sm:mb-14 sm:px-6">
		<div class="grid gap-2.5 sm:gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
			<a
				href={radioIsLive ? (discovery ?? data.discovery).href : '/live'}
				class="group flex min-h-[5.5rem] items-center gap-3 border px-3.5 py-3.5 text-stone-800 transition-colors motion-reduce:transition-none sm:px-4 {radioIsLive
					? 'border-red-300 bg-red-50/60 hover:border-red-500 hover:bg-red-50'
					: 'border-stone-300 bg-cream hover:border-missionnaire-Yellow-600 hover:bg-missionnaire-50'}"
			>
				<span
					aria-hidden="true"
					class="grid h-10 w-10 shrink-0 place-items-center border {radioIsLive
						? 'border-red-200 bg-red-50 text-red-700'
						: 'border-stone-200 bg-cream-dark/60 text-missionnaire-Yellow-700'}"
				>
					<Radio size={22} color="currentColor" />
				</span>
				<span class="min-w-0 flex-1 font-body">
					<span class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
						<span class="text-sm font-semibold">{$t('home.onAir')}</span>
						<span
							class="inline-flex items-center gap-1.5 border px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-tight tracking-[0.08em] {radioIsLive
								? 'border-red-200 bg-red-50 text-red-800'
								: 'border-stone-200 bg-cream-dark/60 text-stone-600'}"
						>
							<span
								aria-hidden="true"
								class="h-1.5 w-1.5 rounded-full {radioIsLive ? 'bg-red-600' : 'bg-stone-500'}"
							></span>
							{radioIsLive ? $t('live.atLive') : $t('live.offAir')}
						</span>
					</span>
					<span class="mt-1 block text-xs leading-normal text-stone-600">
						{radioIsLive ? $t('home.clickListen') : $t('home.goLive')}
					</span>
				</span>
				<span
					aria-hidden="true"
					class="shrink-0 text-stone-500 group-hover:text-missionnaire-Yellow-700 group-focus-visible:text-missionnaire-Yellow-700"
				>
					<ArrowRight2 size={17} color="currentColor" />
				</span>
			</a>

			<button
				type="button"
				onclick={() => bellRef?.toggle()}
				disabled={!bellAvailable || bellPending}
				aria-busy={bellPending}
				class="flex min-h-[5.5rem] items-center gap-3 border px-3.5 py-3.5 text-left font-body text-stone-800 transition-colors enabled:hover:border-missionnaire-Yellow-600 enabled:hover:bg-missionnaire-50 aria-busy:cursor-wait motion-reduce:transition-none sm:px-4 {bellSubscribed
					? 'border-missionnaire-Yellow-600 bg-missionnaire-50'
					: 'border-stone-300 bg-cream'}"
			>
				<span
					aria-hidden="true"
					class="grid h-10 w-10 shrink-0 place-items-center border border-stone-200 bg-cream-dark/60 text-missionnaire-Yellow-700 [&_svg]:text-current motion-reduce:[&_*]:animate-none"
				>
					<NotificationBell
						bind:this={bellRef}
						bind:isSubscribed={bellSubscribed}
						bind:isSupported={bellSupported}
						bind:permission={bellPermission}
						bind:loading={bellPending}
						bind:failed={bellFailed}
					/>
					{#if !bellAvailable}
						<BellIcon size={21} color="currentColor" />
					{/if}
				</span>
				<span class="min-w-0 flex-1">
					<span class="block text-sm font-semibold">{$t(bellTitle)}</span>
					<span class="mt-1 block text-xs leading-normal text-stone-600">
						{#if dev}
							{#if bellPermission === 'granted'}{$t('live.notif.permissionAllowed')}{' '}{/if}
							{$t('live.notif.localHint')}
						{:else}
							{$t(
								!bellSupported
									? 'live.notif.unavailable'
									: bellPermission === 'denied'
										? 'live.notif.blocked'
										: bellPending
											? 'live.notif.updating'
											: bellFailed
												? 'live.notif.updateFailed'
												: bellSubscribed
													? 'live.notif.disableTitle'
													: 'live.notif.enableSubtitle'
							)}
						{/if}
					</span>
				</span>
				{#if bellAvailable && bellSubscribed}
					<span aria-hidden="true" class="shrink-0 text-green-700">
						<TickCircle size={22} color="currentColor" />
					</span>
				{/if}
			</button>
			<span role="status" class="sr-only">
				{bellFailed ? $t('live.notif.updateFailed') : bellSubscribed ? $t(bellTitle) : ''}
			</span>
		</div>
	</div>

	<!-- ═══ LATEST VIDEOS (moved above Mission) ═══ -->
	{#if recentVideos.length > 0}
		<section
			data-reveal="videos"
			class="reveal-section max-w-6xl mx-auto px-5 pb-12 sm:px-6 sm:pb-16"
			class:revealed={sectionsVisible['videos']}
		>
			<div>
				<div class="flex items-end justify-between mb-6 sm:mb-8">
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
		aria-labelledby="heritage-heading"
		class="reveal-section mx-auto mb-16 max-w-6xl px-5 sm:px-6 lg:mb-20"
		class:revealed={sectionsVisible['mission']}
	>
		<header class="mb-6 sm:mb-8">
			<p
				class="mb-2 font-body text-[10px] font-semibold uppercase tracking-[0.3em] text-missionnaire-Yellow-700"
			>
				{$t('about.kicker')}
			</p>
			<h2
				id="heritage-heading"
				class="font-display text-3xl font-semibold leading-[1.05] tracking-tight text-stone-900 md:text-[2.6rem]"
			>
				{$t('home.heritage')}
			</h2>
		</header>

		<div class="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-6">
			<a
				href="/a-propos"
				aria-labelledby="mission-kicker mission-heading"
				class="group flex flex-col border border-stone-300 bg-white/40 transition-colors hover:border-missionnaire-Yellow-600 hover:bg-missionnaire-50 focus-visible:border-missionnaire-Yellow-600 focus-visible:bg-missionnaire-50 motion-reduce:transition-none"
			>
				<div class="relative">
					<picture>
						<source srcset="/img/eglise_inside.webp" type="image/webp" />
						<img
							src="/img/eglise_inside.jpg"
							alt={$t('home.churchAlt')}
							class="block aspect-[3/2] w-full object-cover object-[center_55%] sm:aspect-video"
							width="776"
							height="539"
							loading="lazy"
							decoding="async"
						/>
					</picture>
					<div
						class="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-stone-900/90 via-stone-900/35 to-transparent p-5 sm:p-7"
					>
						<p
							id="mission-kicker"
							class="mb-2 font-body text-[10px] font-semibold uppercase tracking-[0.25em] text-missionnaire-100"
						>
							{$t('home.mission')}
						</p>
						<h3
							id="mission-heading"
							class="font-display text-3xl font-semibold leading-[1.05] text-white sm:text-4xl"
						>
							{$t('home.spread')} <span class="italic">Message</span><br />{$t('home.world')}
						</h3>
					</div>
				</div>
				<div class="flex flex-1 flex-col justify-center gap-2.5 px-5 py-4 sm:px-7 sm:py-5">
					<p class="font-body text-sm leading-relaxed text-stone-600">
						{$t('home.missionBody')}
					</p>
					<span
						class="inline-flex items-center gap-2 self-start font-body text-sm font-semibold text-missionnaire-Yellow-700 group-hover:underline group-focus-visible:underline"
					>
						{$t('home.learnMore')}
						<span aria-hidden="true"><ArrowRight2 size={15} color="currentColor" /></span>
					</span>
				</div>
			</a>

			<ul
				class="flex min-w-0 flex-col divide-y divide-stone-300 border border-stone-300 bg-white/40"
			>
				{#each profiles as profile (profile.href)}
					<li class="flex flex-1">
						<a href={profile.href} class="heritage-link">
							<picture class="shrink-0">
								<source srcset={profile.webp} type="image/webp" />
								<img
									src={profile.portrait}
									alt=""
									class="size-11 rounded-full object-cover sm:size-14"
									width="56"
									height="56"
									loading="lazy"
									decoding="async"
								/>
							</picture>
							<div class="min-w-0 flex-1">
								<h3 class="heritage-title">{profile.name}</h3>
								<p class="mt-1 font-body text-xs text-stone-500">{profile.detail}</p>
								<p class="mt-1.5 font-body text-sm leading-snug text-stone-600">
									{profile.description}
								</p>
							</div>
							<span class="heritage-chevron" aria-hidden="true">
								<ArrowRight2 size={20} color="currentColor" />
							</span>
						</a>
					</li>
				{/each}
				<li class="flex flex-1">
					<a href="/eglise" class="heritage-link">
						<span
							aria-hidden="true"
							class="grid size-11 shrink-0 place-items-center rounded-full bg-cream-dark text-missionnaire-Yellow-700 sm:size-14"
						>
							<Location size={23} color="currentColor" />
						</span>
						<div class="min-w-0 flex-1">
							<p class="mb-1 font-body text-xs font-medium text-missionnaire-Yellow-700">
								{$t('home.localChurch')}
							</p>
							<h3 class="heritage-title">{$t('home.kigaliChurch')}</h3>
							<p class="mt-1.5 font-body text-sm leading-snug text-stone-600">
								{$t('home.churchBody')}
							</p>
						</div>
						<span class="heritage-chevron" aria-hidden="true">
							<ArrowRight2 size={20} color="currentColor" />
						</span>
					</a>
				</li>
			</ul>
		</div>
	</section>
</main>

<style>
	.heritage-link {
		@apply flex w-full items-center gap-3 px-3.5 py-4 transition-colors hover:bg-missionnaire-50 focus-visible:bg-missionnaire-50 focus-visible:-outline-offset-2 motion-reduce:transition-none sm:gap-4 sm:px-5;
	}
	.heritage-title {
		@apply font-display text-xl font-semibold leading-tight text-stone-900;
	}
	.heritage-chevron {
		@apply shrink-0 text-missionnaire-Yellow-700;
	}

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
		.reveal-section.revealed {
			animation: fade-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
		}
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
