<script lang="ts">
	import '../app.css';
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import type { YoutubeVideo } from '$lib/models/youtube';
	import NotificationBell from '$lib/components/+notificationBell.svelte';
	import { radioIsLive as radioIsLiveStore } from '$lib/stores/global';

	export let data: {
		data: YoutubeVideo[];
		radioStatus?: { isLive: boolean; sourceUrl: string };
	};

	$: radioIsLive = $radioIsLiveStore || (data.radioStatus?.isLive ?? false);
	$: recentVideos = (data.data || []).slice(0, 3);

	let bellRef: NotificationBell | undefined;

	// Scroll-triggered reveal
	let heroVisible = false;
	let sectionsVisible: Record<string, boolean> = {};
	let scrolledPastHero = false;

	onMount(() => {
		if (!browser) return;

		// Trigger hero reveal
		requestAnimationFrame(() => {
			heroVisible = true;
		});

		// Hide scroll indicator once scrolled past hero
		const handleScroll = () => {
			scrolledPastHero = window.scrollY > 200;
		};
		window.addEventListener('scroll', handleScroll, { passive: true });

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

	onDestroy(() => {
		clearInterval(heroVerseInterval);
	});

	// Hero Bible verse rotator
	const heroVerses = [
		{ text: 'Car la parole de Dieu est vivante et efficace, plus tranchante qu\u2019une épée quelconque à deux tranchants.', ref: 'Hébreux 4:12' },
		{ text: 'Ainsi la foi vient de ce qu\u2019on entend, et ce qu\u2019on entend vient de la parole de Christ.', ref: 'Romains 10:17' },
		{ text: 'Ta parole est une lampe à mes pieds, et une lumière sur mon sentier.', ref: 'Psaume 119:105' },
		{ text: 'Veillez donc, car vous ne savez ni le jour, ni l\u2019heure.', ref: 'Matthieu 25:13' },
		{ text: 'Voici, je viens bientôt. Heureux celui qui garde les paroles de la prophétie de ce livre.', ref: 'Apocalypse 22:7' },
		{ text: 'Car Dieu a tant aimé le monde qu\u2019il a donné son Fils unique.', ref: 'Jean 3:16' },
		{ text: 'Ne crains point, car je suis avec toi ; ne t\u2019effraie point, car je suis ton Dieu.', ref: 'Ésaïe 41:10' },
		{ text: 'Je puis tout par celui qui me fortifie.', ref: 'Philippiens 4:13' },
		{ text: 'Celui qui a commencé en vous cette bonne œuvre la rendra parfaite pour le jour de Jésus-Christ.', ref: 'Philippiens 1:6' },
		{ text: 'Voici, je me tiens à la porte, et je frappe. Si quelqu\u2019un entend ma voix et ouvre la porte, j\u2019entrerai.', ref: 'Apocalypse 3:20' },
	];

	let heroVerseIndex = 0;
	let heroVerseVisible = true;
	let heroVerseInterval: ReturnType<typeof setInterval>;

	onMount(() => {
		heroVerseInterval = setInterval(() => {
			heroVerseVisible = false;
			setTimeout(() => {
				heroVerseIndex = (heroVerseIndex + 1) % heroVerses.length;
				heroVerseVisible = true;
			}, 600);
		}, 7000);
	});

	const quickLinks = [
		{ label: 'Prédications', href: '/predications', icon: '✦' },
		{ label: 'Vidéos', href: '/videos', icon: '▶' },
		{ label: 'Musique', href: '/musique', icon: '♪' },
		{ label: 'Direct', href: '/live', icon: '◉' },
		{ label: 'Transcriptions', href: '/transcriptions', icon: '¶' },
		{ label: 'Littérature', href: '/literature', icon: '▣' }
	];

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
		return new Date(timestamp).toLocaleDateString('fr-FR', {
			day: '2-digit',
			month: 'long',
			year: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Missionnaire Network - Accueil | Prédications et Cantiques du Message</title>
	<meta
		name="description"
		content="Bienvenue sur Missionnaire Network. Découvrez les prédications et cantiques inspirants du Message de l'Heure pour votre édification spirituelle."
	/>
	<meta
		property="og:title"
		content="Missionnaire Network - Accueil | Prédications et Cantiques du Message"
	/>
	<meta
		property="og:description"
		content="Découvrez les prédications et cantiques inspirants du Message de l'Heure pour votre édification spirituelle."
	/>
	<meta property="og:url" content="https://missionnaire.net/" />
	<meta
		name="twitter:title"
		content="Missionnaire Network - Accueil | Prédications et Cantiques du Message"
	/>
	<meta
		name="twitter:description"
		content="Découvrez les prédications et cantiques inspirants du Message de l'Heure pour votre édification spirituelle."
	/>
	<meta name="google-site-verification" content="5KUjbDomG7hhFBwtEU79pKDetc2q3I2qhEE_0BO4o_o" />
</svelte:head>

<main class="homepage relative overflow-hidden">
	<!-- Grain overlay -->
	<div class="fixed inset-0 pointer-events-none z-50 mix-blend-multiply opacity-[0.03]" aria-hidden="true">
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
		<div class="absolute left-1/2 top-[80px] md:top-[90px] -translate-x-1/2 z-10 pointer-events-none cross-descend" aria-hidden="true">
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

		<div
			class="relative z-10 max-w-4xl mx-auto text-center hero-content"
			class:hero-visible={heroVisible}
		>
			<p class="hero-label text-[10px] md:text-[11px] font-semibold uppercase tracking-[0.35em] md:tracking-[0.4em] text-missionnaire mb-4 md:mb-6 font-body">
				Missionnaire Network
			</p>

			<h1 class="hero-title font-display font-semibold text-[clamp(2.2rem,7vw,4.8rem)] leading-[1.08] text-stone-900">
				Le Message de l'Heure<br />
				<span class="text-missionnaire italic">pour aujourd'hui</span>
			</h1>

			<p class="hero-subtitle mt-5 md:mt-7 text-stone-400 max-w-md mx-auto leading-relaxed text-[15px] md:text-[17px] font-body font-light px-2">
				Prédications, cantiques, transcriptions et enseignements pour fortifier votre marche spirituelle.
			</p>

			<div class="hero-cta mt-8 md:mt-10 flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
				<a
					href="/live"
					class="group px-6 sm:px-8 py-3.5 text-white text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.2em] font-body overflow-hidden transition-all duration-300 flex items-center justify-center gap-3 {radioIsLive
						? 'bg-red-700 hover:bg-red-800'
						: 'bg-stone-900 hover:bg-missionnaire'}"
				>
					{#if radioIsLive}
						<span class="relative flex h-2 w-2 shrink-0">
							<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75"></span>
							<span class="relative inline-flex h-2 w-2 rounded-full bg-white"></span>
						</span>
						<span>Écouter en direct</span>
					{:else}
						<svg width="11" height="13" viewBox="0 0 12 14" fill="none"><path d="M2 1L10 7L2 13V1Z" fill="white" stroke="white" stroke-width="1" stroke-linejoin="round"/></svg>
						<span>Écouter le direct</span>
					{/if}
				</a>
				<a
					href="/predications"
					class="px-6 sm:px-8 py-3.5 border border-stone-300 text-stone-600 text-[11px] sm:text-[12px] font-semibold uppercase tracking-[0.2em] font-body hover:border-missionnaire hover:text-missionnaire transition-all duration-300 text-center"
				>
					Explorer les prédications
				</a>
			</div>

			<!-- Animated Bible verse below buttons -->
			<div class="hero-verse mt-8 md:mt-12 max-w-xl mx-auto">
				<div class="ornament-line text-missionnaire/30 mb-4 md:mb-5">
					<svg width="10" height="10" viewBox="0 0 14 14" fill="none"><path d="M7 0L8.5 5.5L14 7L8.5 8.5L7 14L5.5 8.5L0 7L5.5 5.5L7 0Z" fill="currentColor"/></svg>
				</div>
				<div
					class="verse-anim"
					class:verse-visible={heroVerseVisible}
					style="min-height: 3.5rem;"
				>
					<p class="font-display text-base md:text-xl italic text-stone-500 leading-relaxed px-2">
						« {heroVerses[heroVerseIndex].text} »
					</p>
					<p class="text-[10px] md:text-[11px] font-bold uppercase tracking-[0.25em] md:tracking-[0.3em] text-missionnaire/70 mt-2 md:mt-3 font-body">
						— {heroVerses[heroVerseIndex].ref}
					</p>
				</div>
			</div>
		</div>

	</section>

	<!-- Scroll indicator — fixed to viewport bottom, hidden after scroll -->
	{#if !scrolledPastHero}
		<div class="fixed bottom-6 left-1/2 z-30 flex flex-col items-center gap-2 scroll-indicator">
			<span class="text-[10px] uppercase tracking-[0.3em] text-stone-500 font-body font-semibold">Défiler</span>
			<div class="scroll-chevrons flex flex-col items-center">
				<svg width="22" height="12" viewBox="0 0 22 12" fill="none" class="chevron-1 text-stone-400">
					<path d="M2 2L11 9L20 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				<svg width="22" height="12" viewBox="0 0 22 12" fill="none" class="chevron-2 text-missionnaire -mt-1">
					<path d="M2 2L11 9L20 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
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
					<span class="text-lg text-stone-300 group-hover:text-missionnaire transition-colors duration-300">{link.icon}</span>
					<span class="text-[11px] font-semibold uppercase tracking-[0.15em] text-stone-500 group-hover:text-stone-800 transition-colors duration-300 font-body">{link.label}</span>
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
				href="/live"
				class="group flex items-center gap-4 px-6 py-5 border flex-1 transition-all duration-200 bg-white/40 {radioIsLive
					? 'border-red-200 bg-red-50/40 hover:bg-red-50'
					: 'border-stone-200/60 hover:border-missionnaire/30 hover:bg-white/60'}"
			>
				<span class="relative flex h-2.5 w-2.5 shrink-0">
					{#if radioIsLive}
						<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
						<span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"></span>
					{:else}
						<span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-stone-300"></span>
					{/if}
				</span>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-body {radioIsLive ? 'text-red-700 font-semibold' : 'text-stone-700 font-medium'}">
						{radioIsLive ? 'Audio en direct' : 'Direct audio hors antenne'}
					</p>
					<p class="text-[11px] text-stone-400 font-body mt-0.5">
						{radioIsLive ? 'Cliquez pour écouter' : 'Accéder au direct audio'}
					</p>
				</div>
				<span class="text-stone-300 group-hover:text-missionnaire transition-colors text-xs">→</span>
			</a>

			<button
				on:click={() => bellRef?.toggle()}
				class="group flex items-center gap-4 px-6 py-5 border transition-all duration-200 cursor-pointer sm:w-auto bg-white/40 {bellRef?.isSubscribed
					? 'border-missionnaire/30 bg-orange-50/40'
					: 'border-stone-200/60 hover:border-missionnaire/30 hover:bg-white/60'}"
			>
				<NotificationBell bind:this={bellRef} />
				<div class="flex-1 min-w-0 text-left">
					{#if bellRef?.isSubscribed}
						<p class="text-sm font-semibold text-missionnaire font-body">Notifications activées</p>
						<p class="text-[11px] text-stone-400 font-body mt-0.5">Cliquez pour désactiver</p>
					{:else}
						<p class="text-sm font-medium text-stone-700 font-body">Activer les notifications</p>
						<p class="text-[11px] text-stone-400 font-body mt-0.5">Soyez alerté quand le direct audio commence</p>
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
						<p class="text-[10px] font-semibold uppercase tracking-[0.35em] text-missionnaire font-body mb-2">Nouveautés</p>
						<h2 class="font-display font-semibold text-3xl md:text-[2.6rem] text-stone-900">Récemment ajouté</h2>
					</div>
					<a href="/videos" class="section-cta hidden sm:inline-flex">
						<span class="section-cta-label">Tout voir</span>
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
									<div class="absolute inset-0 bg-stone-900/0 group-hover:bg-stone-900/20 transition-colors duration-300 flex items-center justify-center">
										<div class="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 scale-90 group-hover:scale-100">
											<svg width="14" height="16" viewBox="0 0 14 16" fill="none">
												<path d="M2 1.5L12.5 8L2 14.5V1.5Z" fill="#1c1917" stroke="#1c1917" stroke-width="1.5" stroke-linejoin="round"/>
											</svg>
										</div>
									</div>
								</div>
							{/if}
							<div class="p-4">
								{#if publishedLabel}
									<p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400 mb-1.5 font-body">
										{publishedLabel}
									</p>
								{/if}
								<p class="text-sm font-medium text-stone-700 group-hover:text-missionnaire transition-colors duration-300 line-clamp-2 font-body leading-relaxed">
									{video.title}
								</p>
							</div>
						</a>
					{/each}
				</div>

				<a href="/videos" class="section-cta section-cta-mobile sm:hidden mt-8">
					<span class="section-cta-label">Tout voir</span>
					<span class="section-cta-arrow" aria-hidden="true">→</span>
				</a>
			</div>
		</section>

		<!-- ═══ ORNAMENT (between Videos and Mission) ═══ -->
		<div class="max-w-6xl mx-auto px-6 mb-4">
			<div class="ornament-line text-missionnaire/40">
				<svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 0L8.5 5.5L14 7L8.5 8.5L7 14L5.5 8.5L0 7L5.5 5.5L7 0Z" fill="currentColor"/></svg>
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
				<p class="text-[10px] font-semibold uppercase tracking-[0.35em] text-missionnaire font-body mb-2">À propos</p>
				<h2 class="font-display font-semibold text-3xl md:text-[2.6rem] text-stone-900">Notre héritage</h2>
			</div>
			<a href="/a-propos" class="section-cta hidden sm:inline-flex">
				<span class="section-cta-label">En savoir plus</span>
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
								alt="Intérieur de l'église"
								class="w-full aspect-[4/3] object-cover img-zoom"
								width="400"
								height="300"
								sizes="(max-width: 768px) 100vw, 58vw"
								fetchpriority="high"
							/>
						</picture>
						<div class="absolute inset-0 bg-gradient-to-t from-stone-900/70 via-stone-900/20 to-transparent"></div>
						<div class="absolute bottom-0 left-0 right-0 p-6 md:p-8">
							<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire-100 mb-3 font-body">Notre mission</p>
							<h2 class="font-display font-semibold text-3xl md:text-4xl text-white leading-tight">
								Répandre le <span class="italic">Message</span><br />à travers le monde
							</h2>
						</div>
					</div>
					<div class="p-6 bg-white/60 border border-t-0 border-stone-200/60">
						<p class="text-sm text-stone-500 leading-relaxed font-body">
							Missionnaire Network rend accessible les ressources spirituelles — prédications,
							cantiques, littérature — pour l'édification des croyants partout dans le monde.
						</p>
						<a
							href="/a-propos"
							class="inline-block mt-4 text-[11px] font-semibold text-missionnaire uppercase tracking-[0.2em] font-body hover:text-orange-700 transition-colors"
						>
							En savoir plus →
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
							<p class="font-display font-medium text-xl text-stone-900 group-hover:text-missionnaire transition-colors">
								William M. Branham
							</p>
							<p class="text-[10px] text-stone-400 mt-1 font-body uppercase tracking-wider">1909 – 1965 · Prophète du Message</p>
							<p class="text-sm text-stone-500 mt-2 leading-relaxed font-body">
								Son ministère a marqué des millions de croyants à travers le monde.
							</p>
							<span class="inline-block mt-3 text-[11px] font-semibold text-missionnaire uppercase tracking-[0.2em] font-body">
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
							<p class="font-display font-medium text-xl text-stone-900 group-hover:text-missionnaire transition-colors">
								Ewald Frank
							</p>
							<p class="text-[10px] text-stone-400 mt-1 font-body uppercase tracking-wider">Krefeld, Allemagne · Missionnaire</p>
							<p class="text-sm text-stone-500 mt-2 leading-relaxed font-body">
								Missionnaire international portant le Message aux nations depuis plus de 60 ans.
							</p>
							<span class="inline-block mt-3 text-[11px] font-semibold text-missionnaire uppercase tracking-[0.2em] font-body">
								En savoir plus →
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
							<p class="text-[10px] font-bold uppercase tracking-[0.3em] text-missionnaire font-body">Assemblée locale</p>
						</div>
						<p class="font-display font-medium text-lg text-stone-900 group-hover:text-missionnaire transition-colors">
							Église de Kigali
						</p>
						<p class="text-[12px] text-stone-400 mt-1 font-body">Cultes, retransmissions et programme des réunions</p>
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
		opacity: 0;
		transform: translate(-50%, -60px);
		animation: cross-fall 2.2s cubic-bezier(0.22, 1, 0.36, 1) 0.1s forwards;
	}
	@keyframes cross-fall {
		0% { opacity: 0; transform: translate(-50%, -60px); }
		40% { opacity: 0.6; }
		70% { opacity: 1; transform: translate(-50%, 3px); }
		85% { transform: translate(-50%, -1px); }
		100% { opacity: 1; transform: translate(-50%, 0); }
	}

	/* ── Vertical line growing downward ── */
	.line-grow {
		background: linear-gradient(to bottom, rgba(255,136,12,0.15), rgba(255,136,12,0.08) 70%, transparent);
		transform-origin: top;
		animation: line-extend 1.5s cubic-bezier(0.16, 1, 0.3, 1) 0.8s both;
	}
	@keyframes line-extend {
		from { transform: translate(-50%, 0) scaleY(0); opacity: 0; }
		to { transform: translate(-50%, 0) scaleY(1); opacity: 1; }
	}

	/* ── Hero entrance animations ── */
	.hero-content .hero-label,
	.hero-content .hero-title,
	.hero-content .hero-subtitle,
	.hero-content .hero-cta,
	.hero-content .hero-verse {
		opacity: 0;
		transform: translateY(24px);
		transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1),
					transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.hero-visible .hero-label {
		opacity: 1;
		transform: translateY(0);
		transition-delay: 0.25s;
	}
	.hero-visible .hero-title {
		opacity: 1;
		transform: translateY(0);
		transition-delay: 0.4s;
	}
	.hero-visible .hero-subtitle {
		opacity: 1;
		transform: translateY(0);
		transition-delay: 0.6s;
	}
	.hero-visible .hero-cta {
		opacity: 1;
		transform: translateY(0);
		transition-delay: 0.8s;
	}
	.hero-visible .hero-verse {
		opacity: 1;
		transform: translateY(0);
		transition-delay: 1.1s;
	}

	/* ── Hero verse gentle animation ── */
	.verse-anim {
		opacity: 0;
		transform: translateY(8px);
		transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
					transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
	}
	.verse-visible {
		opacity: 1;
		transform: translateY(0);
	}

	/* ── Scroll indicator ── */
	.scroll-indicator {
		transform: translateX(-50%);
		animation: indicator-in 1s ease 2.5s both;
	}
	@keyframes indicator-in {
		from { opacity: 0; transform: translate(-50%, 12px); }
		to { opacity: 1; transform: translate(-50%, 0); }
	}
	.scroll-hint .chevron-1 {
		animation: chevron-bounce 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
	}
	.scroll-hint .chevron-2 {
		animation: chevron-bounce 2s cubic-bezier(0.4, 0, 0.2, 1) 0.15s infinite;
	}
	@keyframes chevron-bounce {
		0%, 100% { opacity: 0.3; transform: translateY(0); }
		50% { opacity: 1; transform: translateY(4px); }
	}

	/* ── Scroll reveal sections ── */
	.reveal-section {
		opacity: 0;
		transform: translateY(32px);
		transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
					transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
	}
	.revealed {
		opacity: 1;
		transform: translateY(0);
	}

	/* ── Quick links stagger ── */
	.revealed .quick-link {
		animation: fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
	}
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

	/* ── Video cards stagger ── */
	.revealed .video-card {
		animation: fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
	}
</style>
