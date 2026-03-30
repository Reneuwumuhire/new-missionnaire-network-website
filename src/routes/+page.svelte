<script lang="ts">
	import '../app.css';
	import type { YoutubeVideo } from '$lib/models/youtube';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import IoVideocam from 'svelte-icons-pack/io/IoVideocam';
	import IoMusicalNotes from 'svelte-icons-pack/io/IoMusicalNotes';
	import IoBookOutline from 'svelte-icons-pack/io/IoBookOutline';
	import IoRadioOutline from 'svelte-icons-pack/io/IoRadioOutline';
	import IoDocumentTextOutline from 'svelte-icons-pack/io/IoDocumentTextOutline';
	import IoImagesOutline from 'svelte-icons-pack/io/IoImagesOutline';
	import NotificationBell from '$lib/components/+notificationBell.svelte';

	export let data: {
		data: YoutubeVideo[];
		liveStatus?: any;
		radioStatus?: { isLive: boolean; sourceUrl: string };
	};

	$: radioIsLive = data.radioStatus?.isLive ?? false;
	$: recentVideos = (data.data || []).slice(0, 3);

	const services = [
		{
			title: 'Videos',
			description: 'Retransmissions et enseignements en video',
			href: '/videos',
			icon: IoVideocam,
			bgColor: 'bg-orange-50',
			textColor: 'text-orange-600'
		},
		{
			title: 'Predications',
			description: 'Sermons et enseignements du Message',
			href: '/predications',
			icon: IoDocumentTextOutline,
			bgColor: 'bg-teal-50',
			textColor: 'text-teal-600'
		},
		{
			title: 'Musique',
			description: 'Cantiques et louanges inspirants',
			href: '/musique',
			icon: IoMusicalNotes,
			bgColor: 'bg-blue-50',
			textColor: 'text-blue-600'
		},
		{
			title: 'Radio',
			description: 'Ecouter la radio en direct',
			href: '/live',
			icon: IoRadioOutline,
			bgColor: 'bg-red-50',
			textColor: 'text-red-600'
		},
		{
			title: 'Transcriptions',
			description: 'Textes des predications',
			href: '/transcriptions',
			icon: IoBookOutline,
			bgColor: 'bg-purple-50',
			textColor: 'text-purple-600'
		},
		{
			title: 'Litterature',
			description: 'Livres et brochures du Message',
			href: '/literature',
			icon: IoBookOutline,
			bgColor: 'bg-green-50',
			textColor: 'text-green-600'
		},
		{
			title: 'Galerie',
			description: 'Photos et images historiques',
			href: '/galerie',
			icon: IoImagesOutline,
			bgColor: 'bg-amber-50',
			textColor: 'text-amber-600'
		}
	];

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
	<meta
		property="og:title"
		content="Missionnaire Network - Accueil | Predications et Cantiques du Message"
	/>
	<meta
		property="og:description"
		content="Decouvrez les predications et cantiques inspirants du Message de l'Heure pour votre edification spirituelle."
	/>
	<meta property="og:url" content="https://missionnaire.net/" />
	<meta
		name="twitter:title"
		content="Missionnaire Network - Accueil | Predications et Cantiques du Message"
	/>
	<meta
		name="twitter:description"
		content="Decouvrez les predications et cantiques inspirants du Message de l'Heure pour votre edification spirituelle."
	/>
</svelte:head>

<main class="max-w-[1640px] mx-auto px-5">
	<!-- A. Hero Section -->
	<section class="relative rounded-3xl overflow-hidden bg-gradient-to-br from-orange-50 via-white to-orange-50/30 py-16 md:py-24 px-6 md:px-16 mb-10 mt-5">
		<div class="max-w-3xl mx-auto text-center">
			<p class="text-[11px] font-black uppercase tracking-[0.2em] text-orange-600 mb-4">
				Missionnaire Network
			</p>
			<h1 class="text-3xl md:text-5xl lg:text-6xl font-black text-gray-900 leading-tight">
				Ressources du Message de l'Heure
			</h1>
			<p class="mt-5 text-base md:text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
				Retrouvez les predications, cantiques, transcriptions et publications
				pour fortifier votre communion et votre marche quotidienne.
			</p>
			<div class="mt-8 flex flex-wrap justify-center gap-3">
				<a
					href="/videos"
					class="px-6 py-3 rounded-full bg-orange-500 text-white text-xs font-black uppercase tracking-wider hover:bg-orange-600 transition-colors shadow-sm"
				>
					Explorer les ressources
				</a>
				<a
					href="/live"
					class="px-6 py-3 rounded-full border border-gray-200 bg-white text-gray-700 text-xs font-black uppercase tracking-wider hover:border-orange-300 hover:text-orange-600 transition-colors"
				>
					Ecouter la radio
				</a>
			</div>
		</div>
	</section>

	<!-- B. Live Radio Callout -->
	<section class="mb-10">
		<div
			class="flex items-center gap-4 rounded-2xl border px-5 py-4 {radioIsLive
				? 'border-red-200 bg-red-50/60'
				: 'border-gray-100 bg-white'}"
		>
			<a href="/live" class="flex items-center gap-4 flex-1 min-w-0 hover:opacity-80 transition-opacity">
				<span class="relative flex h-3 w-3 shrink-0">
					{#if radioIsLive}
						<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75"></span>
						<span class="relative inline-flex h-3 w-3 rounded-full bg-red-500"></span>
					{:else}
						<span class="relative inline-flex h-3 w-3 rounded-full bg-gray-300"></span>
					{/if}
				</span>
				<div class="flex-1 min-w-0">
					<p class="text-sm font-bold text-gray-900">
						{radioIsLive ? 'Radio en direct' : 'Radio Missionnaire'}
					</p>
					<p class="text-xs text-gray-500 truncate">
						{radioIsLive
							? 'La radio est en cours de diffusion — Ecouter maintenant'
							: 'Actuellement hors antenne'}
					</p>
				</div>
				<span class="text-[11px] font-black uppercase tracking-wider shrink-0 {radioIsLive ? 'text-red-600' : 'text-gray-400'}">
					{radioIsLive ? 'En direct' : 'Hors ligne'}
				</span>
			</a>
			<NotificationBell />
		</div>
	</section>

	<!-- C. Services Grid -->
	<section class="mb-16">
		<div class="mb-6">
			<h2 class="text-xs font-black uppercase tracking-[0.2em] text-orange-600 mb-2">Nos services</h2>
			<p class="text-2xl md:text-3xl font-bold text-gray-900">Explorez nos contenus</p>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
			{#each services as service}
				<a
					href={service.href}
					class="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md transition-all"
				>
					<div class="flex items-start gap-4">
						<div class="w-10 h-10 rounded-xl {service.bgColor} flex items-center justify-center shrink-0">
							<Icon src={service.icon} size="20" className={service.textColor} />
						</div>
						<div class="min-w-0">
							<h3 class="text-sm font-bold text-gray-900 group-hover:text-orange-600 transition-colors">
								{service.title}
							</h3>
							<p class="text-xs text-gray-500 mt-1">{service.description}</p>
							<span class="inline-block mt-3 text-[10px] font-black uppercase tracking-wider text-orange-600 opacity-0 group-hover:opacity-100 transition-opacity">
								Voir tout &rarr;
							</span>
						</div>
					</div>
				</a>
			{/each}
		</div>
	</section>

	<!-- D. About / Mission Section -->
	<section class="mb-16">
		<div class="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
			<div class="grid md:grid-cols-2 gap-0">
				<div class="p-6 md:p-10 flex flex-col justify-center">
					<p class="text-[11px] font-black uppercase tracking-[0.2em] text-orange-600 mb-3">
						Notre mission
					</p>
					<h2 class="text-xl md:text-2xl font-bold text-gray-900 leading-snug">
						Repandre le Message de l'Heure a travers le monde
					</h2>
					<p class="mt-4 text-sm text-gray-600 leading-relaxed">
						Missionnaire Network met a disposition des ressources spirituelles — predications,
						cantiques, litterature et transcriptions — pour l'edification des croyants du
						Message. Notre objectif est de rendre ces ressources accessibles a tous, partout.
					</p>
					<div class="mt-6 flex flex-wrap gap-3">
						<a
							href="/a-propos"
							class="px-4 py-2 rounded-full bg-orange-500 text-white text-xs font-black uppercase tracking-wider hover:bg-orange-600 transition-colors"
						>
							En savoir plus
						</a>
						<a
							href="/eglise"
							class="px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-700 text-xs font-black uppercase tracking-wider hover:border-orange-300 hover:text-orange-600 transition-colors"
						>
							Notre eglise
						</a>
					</div>
				</div>
				<div class="relative min-h-[250px] md:min-h-0">
					<img
						src="/img/eglise_inside.jpg"
						alt="Interieur de l'eglise"
						class="absolute inset-0 w-full h-full object-cover"
					/>
				</div>
			</div>
		</div>
	</section>

	<!-- E. Key Figures -->
	<section class="mb-16">
		<div class="mb-6">
			<h2 class="text-xs font-black uppercase tracking-[0.2em] text-orange-600 mb-2">Figures cles</h2>
			<p class="text-2xl md:text-3xl font-bold text-gray-900">Serviteurs du Message</p>
		</div>
		<div class="grid md:grid-cols-2 gap-4">
			<a
				href="/william-branham/biographie"
				class="group flex items-center gap-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md transition-all"
			>
				<img
					src="/img/branham_icon.png"
					alt="William Branham"
					class="w-16 h-16 rounded-full object-cover shrink-0"
				/>
				<div class="min-w-0">
					<h3 class="text-sm font-bold text-gray-900 group-hover:text-orange-600 transition-colors">
						William Marrion Branham
					</h3>
					<p class="text-xs text-gray-500 mt-1">
						Le prophete du Message de l'Heure
					</p>
					<span class="inline-block mt-2 text-[10px] font-black uppercase tracking-wider text-orange-600">
						Decouvrir &rarr;
					</span>
				</div>
			</a>
			<a
				href="/ewald-frank"
				class="group flex items-center gap-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md transition-all"
			>
				<img
					src="/img/ewald_frank_second_img.jpg"
					alt="Ewald Frank"
					class="w-16 h-16 rounded-full object-cover shrink-0"
				/>
				<div class="min-w-0">
					<h3 class="text-sm font-bold text-gray-900 group-hover:text-orange-600 transition-colors">
						Ewald Frank
					</h3>
					<p class="text-xs text-gray-500 mt-1">
						Serviteur de Dieu et missionnaire international
					</p>
					<span class="inline-block mt-2 text-[10px] font-black uppercase tracking-wider text-orange-600">
						Decouvrir &rarr;
					</span>
				</div>
			</a>
		</div>
	</section>

	<!-- F. Latest Content Teaser -->
	{#if recentVideos.length > 0}
		<section class="mb-16">
			<div class="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-5">
				<div>
					<h2 class="text-xs font-black uppercase tracking-[0.2em] text-orange-600 mb-2">
						Nouveautes
					</h2>
					<p class="text-2xl md:text-3xl font-bold text-gray-900">Publications recentes</p>
				</div>
				<a
					href="/videos"
					class="text-[11px] font-black uppercase tracking-wider text-gray-500 hover:text-orange-600 transition-colors"
				>
					Voir toutes les videos &rarr;
				</a>
			</div>
			<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
				{#each recentVideos as video (video._id)}
					{@const publishedLabel = getVideoDateLabel(video)}
					{@const videoPageUrl = `/videos?v=${video.id || video._id}`}
					<a
						href={videoPageUrl}
						class="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm hover:shadow-md transition-shadow block group"
					>
						{#if video.thumbnail}
							<div class="rounded-xl overflow-hidden mb-4 aspect-video">
								<img
									src={video.thumbnail}
									alt={video.title}
									class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
								/>
							</div>
						{/if}
						{#if publishedLabel}
							<span class="text-[10px] font-bold uppercase tracking-wider text-gray-400">
								{publishedLabel}
							</span>
						{/if}
						<p class="mt-2 text-base font-bold text-gray-900 group-hover:text-orange-600 transition-colors line-clamp-2">
							{video.title}
						</p>
						<p class="mt-2 text-sm text-gray-600 line-clamp-2">
							{video.description || 'Nouvel ajout disponible sur Missionnaire Network.'}
						</p>
					</a>
				{/each}
			</div>
		</section>
	{/if}
</main>
