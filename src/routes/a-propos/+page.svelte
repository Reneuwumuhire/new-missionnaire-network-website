<script lang="ts">
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import FaBrandsYoutube from 'svelte-icons-pack/fa/FaBrandsYoutube';
	import FaBrandsFacebook from 'svelte-icons-pack/fa/FaBrandsFacebook';
	import RiLogoWhatsappFill from 'svelte-icons-pack/ri/RiLogoWhatsappFill';
	import ArticleParagraph from '$lib/components/+articleParagraph.svelte';
	import { EgliseParagraph1 } from './paragraphs';
	import ContactCard from '$lib/components/+contactCard.svelte';
	// import MapComponent from '$lib/components/+mapComponent.svelte';
	import { onMount } from 'svelte';

	let stats: {
		totalVisitors: number;
		todayVisitors: number;
		dailyAverage: number;
		monthlyAverage: number;
		topCountries: { name: string; count: number }[];
		deviceStats: { type: string; count: number }[];
	} | null = null;
	let statsError = false;
	let statsLoading = true;

	onMount(async () => {
		try {
			const res = await fetch('/api/analytics');
			if (res.ok) {
				stats = await res.json();
			} else {
				statsError = true;
			}
		} catch (e) {
			console.error('Failed to fetch stats:', e);
			statsError = true;
		} finally {
			statsLoading = false;
		}
	});
</script>

<svelte:head>
	<title>À propos - Missionnaire Network</title>
	<meta
		name="description"
		content="Découvrez la mission de Missionnaire Network, nos contacts et les statistiques de visite du site."
	/>
	<meta property="og:title" content="À propos - Missionnaire Network" />
	<meta
		property="og:description"
		content="Qui nous sommes, comment nous contacter et suivre l'œuvre de Missionnaire Network."
	/>
</svelte:head>
<div class="flex flex-col overflow-hidden">
	<header class="relative h-[40vh] min-h-[300px] max-h-[500px] overflow-hidden">
		<img src="/img/eglise_header.jpg" alt="Église Murambi" class="absolute inset-0 w-full h-full object-cover" />
		<div class="absolute inset-0 bg-gradient-to-t from-stone-900/70 via-stone-900/30 to-transparent"></div>
		<div class="absolute bottom-0 left-0 right-0 p-8 md:p-12">
			<div class="max-w-3xl mx-auto">
				<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-3 font-body" style="color: rgba(255,255,255,0.7);">À propos</p>
				<h1 class="font-display text-3xl md:text-5xl text-white leading-tight">Qui nous sommes</h1>
			</div>
		</div>
	</header>
	<div class="relative flex flex-row justify-center h-auto w-full pt-16 pb-12">
		<div class="relative flex flex-col items-start w-full max-w-6xl space-y-8 mx-auto px-6">
			{#each EgliseParagraph1 as paragraph, index}
				<ArticleParagraph text={paragraph.text} />
			{/each}
			<!-- <h2 class="font-display text-2xl md:text-3xl text-stone-900">Location</h2>
			<MapComponent /> -->
			<h2 class="font-display text-2xl md:text-3xl font-semibold text-stone-900">Contacter</h2>
			<ContactCard />
			{#if statsLoading}
				<h2 class="font-display text-2xl md:text-3xl font-semibold text-stone-900">Statistiques</h2>
				<div class="w-full bg-stone-50 border border-stone-100 p-8 flex items-center justify-center">
					<div class="flex items-center gap-3 text-stone-400">
						<div class="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-missionnaire"></div>
						<span class="text-sm font-medium">Chargement des statistiques...</span>
					</div>
				</div>
			{:else if statsError}
				<h2 class="font-display text-2xl md:text-3xl font-semibold text-stone-900">Statistiques</h2>
				<div class="w-full bg-red-50 border border-red-100 p-8 text-center">
					<p class="text-red-600 font-medium text-sm">Impossible de charger les statistiques.</p>
					<button
						class="mt-3 text-sm text-missionnaire hover:text-missionnaire font-bold"
						on:click={() => { statsLoading = true; statsError = false; fetch('/api/analytics').then(r => r.ok ? r.json() : Promise.reject()).then(d => { stats = d; }).catch(() => { statsError = true; }).finally(() => { statsLoading = false; }); }}
					>
						Réessayer
					</button>
				</div>
			{:else if stats}
				<h2 class="font-display text-2xl md:text-3xl font-semibold text-stone-900">Statistiques</h2>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
					<!-- Core Counter Stats -->
					<div class="space-y-4">
						<div class="border border-stone-200/60 bg-white/40 p-6 card-lift flex flex-col space-y-2">
							<span class="text-sm font-medium text-stone-500 font-body uppercase tracking-wider"
								>Visiteurs Aujourd'hui</span
							>
							<div class="flex items-center space-x-2">
								<div class="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
								<span class="text-3xl font-black text-stone-900">{stats.todayVisitors}</span>
							</div>
						</div>
						<div class="border border-stone-200/60 bg-white/40 p-6 card-lift flex flex-col space-y-2">
							<span class="text-sm font-medium text-stone-500 font-body uppercase tracking-wider"
								>Visiteurs Cumulés</span
							>
							<span class="text-3xl font-black text-stone-900">{stats.totalVisitors}</span>
						</div>
						<div class="grid grid-cols-2 gap-4">
							<div class="border border-stone-200/60 bg-white/40 p-6 card-lift flex flex-col space-y-2">
								<span class="text-sm font-medium text-stone-500 font-body uppercase tracking-wider"
									>Moy. / Jour</span
								>
								<span class="text-3xl font-black text-stone-900">{stats.dailyAverage}</span>
							</div>
							<div class="border border-stone-200/60 bg-white/40 p-6 card-lift flex flex-col space-y-2">
								<span class="text-sm font-medium text-stone-500 font-body uppercase tracking-wider"
									>Moy. / Mois</span
								>
								<span class="text-3xl font-black text-stone-900">{stats.monthlyAverage}</span>
							</div>
						</div>

						<!-- Device Stats -->
						<div class="border border-stone-200/60 bg-white/40 p-6 card-lift flex flex-col space-y-4">
							<span class="text-sm font-medium text-stone-500 uppercase tracking-wider"
								>Appareils</span
							>
							<div class="flex flex-col space-y-2">
								{#each stats.deviceStats as device}
									<div class="flex justify-between items-center">
										<span class="text-stone-600 capitalize">{device.type}</span>
										<span class="text-stone-900 font-bold">{device.count}</span>
									</div>
								{/each}
							</div>
						</div>
					</div>

					<!-- Country Stats -->
					<div class="border border-stone-200/60 bg-white/40 p-6 card-lift flex flex-col space-y-4">
						<span class="text-sm font-medium text-stone-500 uppercase tracking-wider">Top Pays</span>
						<div class="flex flex-col space-y-3">
							{#each stats.topCountries as country}
								<div class="flex justify-between items-center">
									<div class="flex items-center space-x-2">
										<span class="text-stone-600"
											>{country.name === 'Unknown' ? '🌍 Autre' : country.name}</span
										>
									</div>
									<span class="text-stone-900 font-bold">{country.count}</span>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<h2 class="font-display text-2xl md:text-3xl font-semibold text-stone-900">Réseaux sociaux</h2>

			<div class="flex flex-col items-start space-y-2 md:space-y-4 text-xs md:text-base text-stone-500 font-body">
				<!-- add link to icons -->
				<a
					class="flex flex-row items-center space-x-2 md:space-x-4"
					href="https://www.youtube.com/@MissionnaireNetwork"
					target="_blank"
					rel="noopener noreferrer"
				>
					<Icon className="w-8 h-8" src={FaBrandsYoutube} />
					<span class="">https://www.youtube.com/@MissionnaireNetwork</span>
				</a>
				<a
					class="flex flex-row items-center space-x-2 md:space-x-4"
					href="https://www.facebook.com/missionnaire.net"
					target="_blank"
					rel="noopener noreferrer"
				>
					<Icon className="w-8 h-8" src={FaBrandsFacebook} />
					<span>https://www.facebook.com/missionnaire.net</span>
				</a>
				<a
					class="flex flex-row items-center space-x-2 md:space-x-4"
					href="https://wa.me/250788567415"
					target="_blank"
					rel="noopener noreferrer"
				>
					<!-- when hover add a slight grey -->
					<Icon className="w-8 h-8" src={RiLogoWhatsappFill} />
					<span>+250 788 567 415</span>
				</a>
			</div>
		</div>
	</div>
</div>
