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

<main class="max-w-5xl mx-auto px-5 pb-20">

	<!-- Hero — tight, text-only, no card wrapper -->
	<section class="pt-10 pb-12 md:pt-16 md:pb-16 text-center">
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
				class="px-5 py-2.5 rounded-full bg-orange-500 text-white text-xs font-bold uppercase tracking-wider hover:bg-orange-600 transition-colors"
			>
				Explorer
			</a>
			<a
				href="/live"
				class="px-5 py-2.5 rounded-full border border-orange-200 text-orange-600 text-xs font-bold uppercase tracking-wider hover:bg-orange-50 transition-colors"
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
					<span class="font-semibold text-orange-600">Notifications activees</span> — vous serez alerte quand la radio est en direct
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
					<img
						src="/img/eglise_inside.jpg"
						alt="Interieur de l'eglise"
						class="absolute inset-0 w-full h-full object-cover"
					/>
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
						<a href="/a-propos" class="text-xs font-bold text-orange-600 hover:text-orange-700 uppercase tracking-wider">
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
				<img src="/img/branham_icon.png" alt="William Branham" class="w-20 h-20 rounded-full object-cover mx-auto" />
				<p class="text-sm font-bold text-gray-900 group-hover:text-orange-600 transition-colors mt-4">William M. Branham</p>
				<p class="text-xs text-gray-400 mt-1.5 leading-relaxed">
					Prophete du Message de l'Heure (1909–1965). Son ministere a marque des millions de croyants a travers le monde.
				</p>
				<span class="inline-block mt-3 text-[10px] font-bold text-orange-600 uppercase tracking-wider">Biographie &rarr;</span>
			</a>
			<a
				href="/ewald-frank"
				class="group rounded-2xl border border-gray-100 p-5 hover:border-gray-200 transition-colors flex-1 text-center"
			>
				<img src="/img/ewald_frank_second_img.jpg" alt="Ewald Frank" class="w-20 h-20 rounded-full object-cover mx-auto" />
				<p class="text-sm font-bold text-gray-900 group-hover:text-orange-600 transition-colors mt-4">Ewald Frank</p>
				<p class="text-xs text-gray-400 mt-1.5 leading-relaxed">
					Missionnaire international base a Krefeld, Allemagne. Il porte le Message aux nations depuis plus de 60 ans.
				</p>
				<span class="inline-block mt-3 text-[10px] font-bold text-orange-600 uppercase tracking-wider">En savoir plus &rarr;</span>
			</a>
		</div>
	</section>

	<!-- Latest videos — clean, no heavy borders -->
	{#if recentVideos.length > 0}
		<section class="mb-8">
			<div class="flex items-end justify-between mb-6">
				<h2 class="text-lg font-bold text-gray-900">Recemment ajoute</h2>
				<a href="/videos" class="text-xs font-bold text-gray-400 hover:text-orange-600 uppercase tracking-wider transition-colors">
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
									src={video.thumbnail}
									alt={video.title}
									class="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
								/>
							</div>
						{/if}
						{#if publishedLabel}
							<p class="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">
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
