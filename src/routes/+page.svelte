<script lang="ts">
	import '../app.css';
	import type { YoutubeVideo } from '$lib/models/youtube';
	import NotificationBell from '$lib/components/+notificationBell.svelte';

	export let data: {
		data: YoutubeVideo[];
		liveStatus?: any;
		radioStatus?: { isLive: boolean; sourceUrl: string };
	};

	$: radioIsLive = data.radioStatus?.isLive ?? false;
	$: recentVideos = (data.data || []).slice(0, 3);

	let bellRef: any;

	const quickLinks = [
		{ label: 'Videos', href: '/videos' },
		{ label: 'Predications', href: '/predications' },
		{ label: 'Musique', href: '/musique' },
		{ label: 'Radio', href: '/live' },
		{ label: 'Transcriptions', href: '/transcriptions' },
		{ label: 'Litterature', href: '/literature' }
	];

	function getSmallThumbnail(video: YoutubeVideo): string {
		const url = video.thumbnail || '';
		// Prefer mqdefault (320px) for small cards instead of maxresdefault (1280px)
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
	<title>Missionnaire Network - Accueil | Predications et Cantiques du Message</title>
	<meta
		name="description"
		content="Bienvenue sur Missionnaire Network. Decouvrez les predications et cantiques inspirants du Message de l'Heure pour votre edification spirituelle."
	/>
	<meta property="og:title" content="Missionnaire Network - Accueil | Predications et Cantiques du Message" />
	<meta property="og:description" content="Decouvrez les predications et cantiques inspirants du Message de l'Heure pour votre edification spirituelle." />
	<meta property="og:url" content="https://missionnaire.net/" />
	<meta name="twitter:title" content="Missionnaire Network - Accueil | Predications et Cantiques du Message" />
	<meta name="twitter:description" content="Decouvrez les predications et cantiques inspirants du Message de l'Heure pour votre edification spirituelle." />
</svelte:head>

<main class="max-w-7xl mx-auto px-4 md:px-8 pb-20 relative">

	<!-- Church symbols — scroll with page, in margins on large screens -->
	<div class="hidden lg:block absolute -left-[80px] -right-[80px] top-[500px] bottom-0 pointer-events-none overflow-visible" aria-hidden="true">
		<!-- Cross — right margin -->
		<svg class="absolute top-0 -right-[60px] w-[40px] h-[54px] church-float" viewBox="0 0 40 54" fill="none">
			<rect x="14" y="0" width="12" height="54" rx="3" fill="#FF880C" fill-opacity="0.12" />
			<rect x="0" y="12" width="40" height="12" rx="3" fill="#FF880C" fill-opacity="0.12" />
		</svg>

		<!-- Open book — left margin -->
		<svg class="absolute top-[350px] -left-[70px] w-[60px] h-[42px] church-float-slow" viewBox="0 0 60 42" fill="none">
			<path d="M30 6 C22 3, 6 3, 1 7 L1 36 C6 32, 22 32, 30 34" stroke="#FF880C" stroke-opacity="0.15" stroke-width="1.5" fill="#FF880C" fill-opacity="0.04" />
			<path d="M30 6 C38 3, 54 3, 59 7 L59 36 C54 32, 38 32, 30 34" stroke="#FF880C" stroke-opacity="0.15" stroke-width="1.5" fill="#FF880C" fill-opacity="0.04" />
			<line x1="30" y1="6" x2="30" y2="34" stroke="#FF880C" stroke-opacity="0.1" stroke-width="1" />
		</svg>
	</div>

	<!-- Hero with wave mesh background -->
	<section class="pt-10 pb-12 md:pt-16 md:pb-16 text-center relative overflow-hidden">
		<!-- Wave mesh — hero only -->
		<div class="absolute inset-0 pointer-events-none -z-10" aria-hidden="true">
			<svg class="hero-waves absolute -left-[20%] -top-[20%] w-[140%] h-[140%]" viewBox="0 0 1000 600" fill="none" preserveAspectRatio="none">
				<!-- Flowing mesh — group A (flows right) -->
				<path d="M-100 80 C100 20, 300 160, 500 60 C700 -40, 850 120, 1100 50" stroke="#FF880C" stroke-opacity="0.18" stroke-width="1.5" />
				<path d="M-100 110 C120 40, 320 180, 520 90 C720 0, 870 140, 1100 80" stroke="#FF880C" stroke-opacity="0.14" stroke-width="1.2" />
				<path d="M-100 140 C140 60, 340 200, 540 120 C740 40, 890 160, 1100 110" stroke="#FF880C" stroke-opacity="0.1" stroke-width="1" />

				<!-- Flowing mesh — group B (flows left, crossing A) -->
				<path d="M-100 200 C150 300, 400 120, 600 250 C800 380, 900 180, 1100 280" stroke="#FF880C" stroke-opacity="0.16" stroke-width="1.5" />
				<path d="M-100 230 C170 320, 420 150, 620 270 C820 400, 920 210, 1100 300" stroke="#FF880C" stroke-opacity="0.12" stroke-width="1.2" />
				<path d="M-100 260 C190 340, 440 180, 640 290 C840 420, 940 240, 1100 320" stroke="#FF880C" stroke-opacity="0.08" stroke-width="1" />

				<!-- Flowing mesh — group C (center weave) -->
				<path d="M-100 350 C200 250, 350 450, 550 320 C750 190, 850 400, 1100 340" stroke="#FF880C" stroke-opacity="0.14" stroke-width="1.5" />
				<path d="M-100 380 C220 270, 370 470, 570 340 C770 210, 870 420, 1100 360" stroke="#FF880C" stroke-opacity="0.1" stroke-width="1.2" />
				<path d="M-100 410 C240 290, 390 490, 590 360 C790 230, 890 440, 1100 380" stroke="#FF880C" stroke-opacity="0.07" stroke-width="1" />

				<!-- Lower strands — fading out -->
				<path d="M-100 480 C300 400, 500 560, 750 460 C950 370, 1000 500, 1100 450" stroke="#FF880C" stroke-opacity="0.1" stroke-width="1.2" />
				<path d="M-100 510 C280 420, 520 580, 770 480 C970 390, 1020 520, 1100 470" stroke="#FF880C" stroke-opacity="0.06" stroke-width="1" />
			</svg>
		</div>
		<p class="text-[11px] font-black uppercase tracking-[0.25em] text-orange-600 mb-4">
			Missionnaire Network
		</p>
		<h1 class="text-3xl md:text-5xl font-black text-gray-900 leading-[1.1] max-w-2xl mx-auto">
			Ressources du Message de l'Heure
		</h1>
		<p class="mt-4 text-gray-500 max-w-lg mx-auto leading-relaxed">
			Predications, cantiques, transcriptions et publications
			pour fortifier votre marche quotidienne.
		</p>
		<div class="mt-8 flex flex-wrap justify-center gap-3">
			<a
				href="/videos"
				class="px-5 py-2.5 rounded-full bg-orange-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-orange-700 transition-colors"
			>
				Explorer
			</a>
			<a
				href="/live"
				class="px-5 py-2.5 rounded-full border border-orange-200 text-orange-700 text-xs font-bold uppercase tracking-wider hover:bg-orange-50 transition-colors"
			>
				Radio en direct
			</a>
		</div>
	</section>

	<!-- Quick links — compact pill row -->
	<nav class="flex flex-wrap justify-center gap-2 mb-12">
		{#each quickLinks as link}
			<a
				href={link.href}
				class="px-4 py-2 rounded-full bg-gray-50 text-sm text-gray-600 font-medium hover:bg-orange-50 hover:text-orange-600 transition-colors"
			>
				{link.label}
			</a>
		{/each}
	</nav>

	<!-- Radio status + notification opt-in -->
	<div class="rounded-xl mb-12 overflow-hidden {radioIsLive ? 'bg-red-50' : 'bg-gray-50'}">
		<a
			href="/live"
			class="flex items-center gap-3 px-4 py-3 transition-colors {radioIsLive ? 'hover:bg-red-100' : 'hover:bg-gray-100'}"
		>
			<span class="relative flex h-2 w-2 shrink-0">
				{#if radioIsLive}
					<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
					<span class="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
				{:else}
					<span class="relative inline-flex h-2 w-2 rounded-full bg-gray-300"></span>
				{/if}
			</span>
			<span class="text-sm {radioIsLive ? 'text-red-700 font-semibold' : 'text-gray-500'}">
				{radioIsLive ? 'Radio en direct — Ecouter' : 'Radio hors antenne'}
			</span>
		</a>
		<button
			on:click={() => bellRef?.toggle()}
			class="flex items-center gap-3 px-4 py-3 border-t w-full text-left cursor-pointer hover:bg-gray-100 transition-colors {radioIsLive ? 'border-red-100 hover:bg-red-100' : 'border-gray-100'}"
		>
			<NotificationBell bind:this={bellRef} />
			<p class="text-xs text-gray-500">
				{#if bellRef?.isSubscribed}
					<span class="font-semibold text-orange-700">Notifications activees</span> — vous serez alerte quand la radio est en direct
				{:else}
					<span class="font-semibold text-gray-700">Recevoir une notification</span> quand la radio est en direct
				{/if}
			</p>
		</button>
	</div>

	<!-- Two-column: Mission + Key figures -->
	<section class="grid md:grid-cols-5 gap-8 mb-16">
		<!-- Mission — 3 cols -->
		<div class="md:col-span-3">
			<div class="rounded-2xl overflow-hidden border border-gray-100">
				<div class="relative aspect-[16/9] md:aspect-[2/1]">
					<picture>
						<source srcset="/img/eglise_inside.webp" type="image/webp" />
						<img
							src="/img/eglise_inside.jpg"
							alt="Interieur de l'eglise"
							class="absolute inset-0 w-full h-full object-cover"
							width="600"
							height="417"
							fetchpriority="high"
						/>
					</picture>
				</div>
				<div class="p-6">
					<h2 class="text-lg font-bold text-gray-900">
						Repandre le Message a travers le monde
					</h2>
					<p class="mt-2 text-sm text-gray-500 leading-relaxed">
						Missionnaire Network rend accessible les ressources spirituelles —
						predications, cantiques, litterature — pour l'edification des croyants partout dans le monde.
					</p>
					<div class="mt-4 flex gap-3">
						<a href="/a-propos" class="text-xs font-bold text-orange-700 hover:text-orange-800 uppercase tracking-wider">
							En savoir plus &rarr;
						</a>
					</div>
				</div>
			</div>
		</div>

		<!-- Key figures — 2 cols -->
		<div class="md:col-span-2 flex flex-col gap-4">
			<a
				href="/william-branham/biographie"
				class="group rounded-2xl border border-gray-100 p-5 hover:border-gray-200 transition-colors flex-1 text-center"
			>
				<picture>
					<source srcset="/img/branham_icon.webp" type="image/webp" />
					<img src="/img/branham_icon.png" alt="William Branham" class="w-20 h-20 rounded-full object-cover mx-auto" width="160" height="160" loading="lazy" decoding="async" />
				</picture>
				<p class="text-sm font-bold text-gray-900 group-hover:text-orange-600 transition-colors mt-4">William M. Branham</p>
				<p class="text-xs text-gray-500 mt-1.5 leading-relaxed">
					Prophete du Message de l'Heure (1909–1965). Son ministere a marque des millions de croyants a travers le monde.
				</p>
				<span class="inline-block mt-3 text-xs font-bold text-orange-700 uppercase tracking-wider">Biographie &rarr;</span>
			</a>
			<a
				href="/ewald-frank"
				class="group rounded-2xl border border-gray-100 p-5 hover:border-gray-200 transition-colors flex-1 text-center"
			>
				<picture>
					<source srcset="/img/ewald_frank_second_img.webp" type="image/webp" />
					<img src="/img/ewald_frank_second_img.jpg" alt="Ewald Frank" class="w-20 h-20 rounded-full object-cover mx-auto" width="160" height="160" loading="lazy" decoding="async" />
				</picture>
				<p class="text-sm font-bold text-gray-900 group-hover:text-orange-600 transition-colors mt-4">Ewald Frank</p>
				<p class="text-xs text-gray-500 mt-1.5 leading-relaxed">
					Missionnaire international base a Krefeld, Allemagne. Il porte le Message aux nations depuis plus de 60 ans.
				</p>
				<span class="inline-block mt-3 text-xs font-bold text-orange-700 uppercase tracking-wider">En savoir plus &rarr;</span>
			</a>
		</div>
	</section>

	<!-- Latest videos — clean, no heavy borders -->
	{#if recentVideos.length > 0}
		<section class="mb-8">
			<div class="flex items-end justify-between mb-6">
				<h2 class="text-lg font-bold text-gray-900">Recemment ajoute</h2>
				<a href="/videos" class="text-xs font-bold text-gray-500 hover:text-orange-700 uppercase tracking-wider transition-colors">
					Tout voir &rarr;
				</a>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-5">
				{#each recentVideos as video (video._id)}
					{@const publishedLabel = getVideoDateLabel(video)}
					{@const videoPageUrl = `/videos?v=${video.id || video._id}`}
					<a href={videoPageUrl} class="group block">
						{#if video.thumbnail}
							<div class="rounded-xl overflow-hidden aspect-video mb-3">
								<img
									src={getSmallThumbnail(video)}
									alt={video.title}
									width="320"
									height="180"
									loading="lazy"
									decoding="async"
									class="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
								/>
							</div>
						{/if}
						{#if publishedLabel}
							<p class="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">
								{publishedLabel}
							</p>
						{/if}
						<p class="text-sm font-semibold text-gray-900 group-hover:text-orange-600 transition-colors line-clamp-2">
							{video.title}
						</p>
					</a>
				{/each}
			</div>
		</section>
	{/if}
</main>

<style>
	.hero-waves {
		animation: wave-sway 12s ease-in-out infinite;
	}
	.church-float {
		animation: church-bob 7s ease-in-out infinite;
	}
	.church-float-slow {
		animation: church-bob 9s ease-in-out infinite 2s;
	}

	@keyframes wave-sway {
		0%, 100% { transform: translate(-20%, -20%) scaleX(1); }
		33% { transform: translate(-18%, -21%) scaleX(1.02); }
		66% { transform: translate(-22%, -19%) scaleX(0.98); }
	}
	@keyframes church-bob {
		0%, 100% { transform: translateY(0); }
		50% { transform: translateY(-8px); }
	}
</style>

