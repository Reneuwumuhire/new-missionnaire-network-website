<script lang="ts">
	import '../app.css';
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import type { YoutubeVideo } from '$lib/models/youtube';
	import type { LiveStatus } from '$lib/server/youtube-poller';
	import NotificationBell from '$lib/components/+notificationBell.svelte';

	export let data: {
		data: YoutubeVideo[];
		liveStatus?: LiveStatus;
		radioStatus?: { isLive: boolean; sourceUrl: string };
	};

	let radioIsLive = data.radioStatus?.isLive ?? false;
	$: recentVideos = (data.data || []).slice(0, 3);

	let bellRef: NotificationBell | undefined;

	let eventSource: EventSource | null = null;

	// Scroll-triggered reveal
	let heroVisible = false;
	let sectionsVisible: Record<string, boolean> = {};

	onMount(() => {
		if (!browser) return;

		// SSE for radio status
		eventSource = new EventSource('/api/live/sse');
		eventSource.onmessage = (event) => {
			try {
				const status = JSON.parse(event.data) as { isLive: boolean };
				radioIsLive = status.isLive;
			} catch {
				// ignore parse errors
			}
		};

		// Trigger hero reveal
		requestAnimationFrame(() => {
			heroVisible = true;
		});

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
		eventSource?.close();
	});

	const quickLinks = [
		{ label: 'Vidéos', href: '/videos', icon: '▶' },
		{ label: 'Prédications', href: '/predications', icon: '✦' },
		{ label: 'Musique', href: '/musique', icon: '♪' },
		{ label: 'Radio', href: '/live', icon: '◉' },
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
	<!-- Atmospheric grain overlay -->
	<div class="fixed inset-0 pointer-events-none z-50 mix-blend-multiply opacity-[0.03]" aria-hidden="true">
		<div class="grain-texture w-full h-full"></div>
	</div>

	<!-- ═══════════════════════ HERO ═══════════════════════ -->
	<section
		class="relative min-h-[85vh] md:min-h-[90vh] flex items-center justify-center overflow-hidden"
	>
		<!-- Radial glow behind hero -->
		<div
			class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full pointer-events-none"
			style="background: radial-gradient(circle, rgba(255,136,12,0.08) 0%, transparent 70%);"
			aria-hidden="true"
		></div>

		<!-- Decorative vertical line -->
		<div
			class="absolute left-1/2 top-0 w-px h-full -translate-x-1/2 pointer-events-none"
			style="background: linear-gradient(to bottom, transparent, rgba(255,136,12,0.15) 30%, rgba(255,136,12,0.15) 70%, transparent);"
			aria-hidden="true"
		></div>

		<div
			class="relative z-10 max-w-4xl mx-auto px-6 text-center hero-content"
			class:hero-visible={heroVisible}
		>
			<!-- Ornamental cross mark -->
			<div class="flex justify-center mb-8">
				<svg width="28" height="38" viewBox="0 0 28 38" fill="none" class="hero-cross">
					<rect x="10" y="0" width="8" height="38" rx="1.5" fill="#FF880C" fill-opacity="0.25" />
					<rect x="0" y="8" width="28" height="8" rx="1.5" fill="#FF880C" fill-opacity="0.25" />
				</svg>
			</div>

			<p class="hero-label text-[11px] font-semibold uppercase tracking-[0.35em] text-missionnaire mb-6 font-body">
				Missionnaire Network
			</p>

			<h1 class="hero-title font-display font-semibold text-[clamp(2.8rem,7vw,5rem)] leading-[1.05] text-stone-900">
				Ressources du<br />
				<span class="text-missionnaire italic">Message</span> de l'Heure
			</h1>

			<p class="hero-subtitle mt-6 text-stone-500 max-w-md mx-auto leading-relaxed text-base font-body font-light">
				Prédications, cantiques, transcriptions et publications pour fortifier votre marche quotidienne.
			</p>

			<div class="hero-cta mt-10 flex flex-wrap justify-center gap-4">
				<a
					href="/videos"
					class="group relative px-8 py-3.5 bg-stone-900 text-white text-xs font-semibold uppercase tracking-[0.2em] font-body overflow-hidden transition-all duration-300 hover:bg-missionnaire"
				>
					<span class="relative z-10">Explorer</span>
				</a>
				<a
					href="/live"
					class="px-8 py-3.5 border border-stone-300 text-stone-700 text-xs font-semibold uppercase tracking-[0.2em] font-body hover:border-missionnaire hover:text-missionnaire transition-all duration-300"
				>
					Radio en direct
				</a>
			</div>
		</div>

		<!-- Scroll indicator -->
		<div class="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-40">
			<span class="text-[10px] uppercase tracking-[0.25em] text-stone-400 font-body">Défiler</span>
			<div class="w-px h-8 bg-stone-300 scroll-line"></div>
		</div>
	</section>

	<!-- ═══════════════════════ QUICK NAV ═══════════════════════ -->
	<nav
		data-reveal="nav"
		class="reveal-section max-w-5xl mx-auto px-6 py-16 border-t border-stone-200"
		class:revealed={sectionsVisible['nav']}
	>
		<div class="grid grid-cols-3 md:grid-cols-6 gap-3">
			{#each quickLinks as link, i}
				<a
					href={link.href}
					class="quick-link group flex flex-col items-center gap-3 py-5 px-3 border border-transparent hover:border-stone-200 transition-all duration-300"
					style="animation-delay: {i * 80}ms"
				>
					<span class="text-lg text-stone-400 group-hover:text-missionnaire transition-colors duration-300">{link.icon}</span>
					<span class="text-xs font-semibold uppercase tracking-[0.15em] text-stone-600 group-hover:text-stone-900 transition-colors duration-300 font-body">{link.label}</span>
				</a>
			{/each}
		</div>
	</nav>

	<!-- ═══════════════════════ RADIO STATUS ═══════════════════════ -->
	<div
		data-reveal="radio"
		class="reveal-section max-w-5xl mx-auto px-6 mb-16"
		class:revealed={sectionsVisible['radio']}
	>
		<div class="flex flex-col sm:flex-row gap-4">
			<!-- Radio link -->
			<a
				href="/live"
				class="group flex items-center gap-4 px-5 py-4 border flex-1 transition-all duration-200 {radioIsLive
					? 'border-red-200 bg-red-50/40 hover:bg-red-50'
					: 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'}"
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
					<p class="text-sm font-body {radioIsLive ? 'text-red-700 font-semibold' : 'text-stone-700'}">
						{radioIsLive ? 'Radio en direct' : 'Radio hors antenne'}
					</p>
					<p class="text-[11px] text-stone-400 font-body mt-0.5">
						{radioIsLive ? 'Cliquez pour écouter' : 'Accéder à la page radio'}
					</p>
				</div>
				<span class="text-stone-300 group-hover:text-missionnaire transition-colors text-xs">→</span>
			</a>

			<!-- Notification toggle -->
			<button
				on:click={() => bellRef?.toggle()}
				class="group flex items-center gap-4 px-5 py-4 border transition-all duration-200 cursor-pointer sm:w-auto {bellRef?.isSubscribed
					? 'border-missionnaire/30 bg-orange-50/40'
					: 'border-stone-200 hover:border-missionnaire/30 hover:bg-orange-50/30'}"
			>
				<NotificationBell bind:this={bellRef} />
				<div class="flex-1 min-w-0 text-left">
					{#if bellRef?.isSubscribed}
						<p class="text-sm font-semibold text-missionnaire font-body">Notifications activées</p>
						<p class="text-[11px] text-stone-400 font-body mt-0.5">Cliquez pour désactiver</p>
					{:else}
						<p class="text-sm font-semibold text-stone-700 font-body">Activer les notifications</p>
						<p class="text-[11px] text-stone-400 font-body mt-0.5">Soyez alerté quand la radio est en direct</p>
					{/if}
				</div>
			</button>
		</div>
	</div>

	<!-- ═══════════════════════ MISSION + FIGURES ═══════════════════════ -->
	<section
		data-reveal="mission"
		class="reveal-section max-w-5xl mx-auto px-6 mb-20"
		class:revealed={sectionsVisible['mission']}
	>
		<div class="grid md:grid-cols-12 gap-6 md:gap-8">
			<!-- Mission — editorial image block -->
			<div class="md:col-span-7">
				<div class="relative group">
					<div class="relative overflow-hidden">
						<picture>
							<source srcset="/img/eglise_inside.webp" type="image/webp" />
							<img
								src="/img/eglise_inside.jpg"
								alt="Intérieur de l'église"
								class="w-full aspect-[4/3] object-cover transition-transform duration-700 group-hover:scale-[1.03]"
								width="400"
								height="300"
								sizes="(max-width: 768px) 100vw, 58vw"
								fetchpriority="high"
							/>
						</picture>
						<!-- Image overlay gradient -->
						<div class="absolute inset-0 bg-gradient-to-t from-stone-900/60 via-transparent to-transparent"></div>
						<!-- Text on image -->
						<div class="absolute bottom-0 left-0 right-0 p-6 md:p-8">
							<h2 class="font-display font-semibold text-3xl md:text-4xl text-white leading-tight">
								Répandre le <span class="italic">Message</span><br />à travers le monde
							</h2>
						</div>
					</div>
					<div class="p-6 bg-stone-50 border border-t-0 border-stone-200">
						<p class="text-sm text-stone-500 leading-relaxed font-body">
							Missionnaire Network rend accessible les ressources spirituelles — prédications,
							cantiques, littérature — pour l'édification des croyants partout dans le monde.
						</p>
						<a
							href="/a-propos"
							class="inline-block mt-4 text-xs font-semibold text-missionnaire uppercase tracking-[0.2em] font-body hover:text-orange-800 transition-colors"
						>
							En savoir plus →
						</a>
					</div>
				</div>
			</div>

			<!-- Key figures — stacked cards -->
			<div class="md:col-span-5 flex flex-col gap-6">
				<a
					href="/william-branham/biographie"
					class="group block border border-stone-200 hover:border-missionnaire/30 transition-all duration-300 flex-1"
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
							<p class="text-xs text-stone-400 mt-1 font-body uppercase tracking-wider">1909 – 1965</p>
							<p class="text-sm text-stone-500 mt-2 leading-relaxed font-body">
								Prophète du Message de l'Heure. Son ministère a marqué des millions de croyants à travers le monde.
							</p>
							<span class="inline-block mt-3 text-xs font-semibold text-missionnaire uppercase tracking-[0.2em] font-body">
								Biographie →
							</span>
						</div>
					</div>
				</a>

				<a
					href="/ewald-frank"
					class="group block border border-stone-200 hover:border-missionnaire/30 transition-all duration-300 flex-1"
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
							<p class="text-xs text-stone-400 mt-1 font-body uppercase tracking-wider">Krefeld, Allemagne</p>
							<p class="text-sm text-stone-500 mt-2 leading-relaxed font-body">
								Missionnaire international portant le Message aux nations depuis plus de 60 ans.
							</p>
							<span class="inline-block mt-3 text-xs font-semibold text-missionnaire uppercase tracking-[0.2em] font-body">
								En savoir plus →
							</span>
						</div>
					</div>
				</a>
			</div>
		</div>
	</section>

	<!-- ═══════════════════════ LATEST VIDEOS ═══════════════════════ -->
	{#if recentVideos.length > 0}
		<section
			data-reveal="videos"
			class="reveal-section max-w-5xl mx-auto px-6 pb-24"
			class:revealed={sectionsVisible['videos']}
		>
			<div class="border-t border-stone-200 pt-12">
				<div class="flex items-end justify-between mb-8">
					<div>
						<p class="text-[10px] font-semibold uppercase tracking-[0.3em] text-missionnaire font-body mb-2">Nouveautés</p>
						<h2 class="font-display font-semibold text-3xl md:text-4xl text-stone-900">Récemment ajouté</h2>
					</div>
					<a
						href="/videos"
						class="text-xs font-semibold text-stone-500 hover:text-missionnaire uppercase tracking-[0.2em] transition-colors font-body hidden sm:block"
					>
						Tout voir →
					</a>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
					{#each recentVideos as video, i (video._id)}
						{@const publishedLabel = getVideoDateLabel(video)}
						{@const videoPageUrl = `/videos?v=${video.id || video._id}`}
						<a
							href={videoPageUrl}
							class="video-card group block"
							style="animation-delay: {i * 120}ms"
						>
							{#if video.thumbnail}
								<div class="relative overflow-hidden aspect-video mb-4">
									<img
										src={getSmallThumbnail(video)}
										alt={video.title}
										width="320"
										height="180"
										loading="lazy"
										decoding="async"
										class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
									/>
									<!-- Play hint -->
									<div class="absolute inset-0 bg-stone-900/0 group-hover:bg-stone-900/20 transition-colors duration-300 flex items-center justify-center">
										<div class="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 scale-90 group-hover:scale-100">
											<svg width="14" height="16" viewBox="0 0 14 16" fill="none">
												<path d="M2 1.5L12.5 8L2 14.5V1.5Z" fill="#1c1917" stroke="#1c1917" stroke-width="1.5" stroke-linejoin="round"/>
											</svg>
										</div>
									</div>
								</div>
							{/if}
							{#if publishedLabel}
								<p class="text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-400 mb-1.5 font-body">
									{publishedLabel}
								</p>
							{/if}
							<p class="text-sm font-medium text-stone-800 group-hover:text-missionnaire transition-colors duration-300 line-clamp-2 font-body leading-relaxed">
								{video.title}
							</p>
						</a>
					{/each}
				</div>

				<a
					href="/videos"
					class="block text-center mt-8 text-xs font-semibold text-stone-500 hover:text-missionnaire uppercase tracking-[0.2em] transition-colors font-body sm:hidden"
				>
					Tout voir →
				</a>
			</div>
		</section>
	{/if}
</main>

<style>
	/* ── Grain texture ── */
	.grain-texture {
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
		background-repeat: repeat;
		background-size: 256px 256px;
	}

	/* ── Hero entrance animations ── */
	.hero-content .hero-cross,
	.hero-content .hero-label,
	.hero-content .hero-title,
	.hero-content .hero-subtitle,
	.hero-content .hero-cta {
		opacity: 0;
		transform: translateY(24px);
		transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1),
					transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.hero-visible .hero-cross {
		opacity: 1;
		transform: translateY(0);
		transition-delay: 0.1s;
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

	/* ── Scroll indicator ── */
	.scroll-line {
		animation: scroll-pulse 2s ease-in-out infinite;
	}
	@keyframes scroll-pulse {
		0%, 100% { opacity: 0.3; transform: scaleY(1); }
		50% { opacity: 0.8; transform: scaleY(1.2); transform-origin: top; }
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
