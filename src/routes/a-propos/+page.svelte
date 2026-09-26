<script lang="ts">
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import FaBrandsYoutube from 'svelte-icons-pack/fa/FaBrandsYoutube';
	import FaBrandsFacebook from 'svelte-icons-pack/fa/FaBrandsFacebook';
	import RiLogoWhatsappFill from 'svelte-icons-pack/ri/RiLogoWhatsappFill';
	import ArticleParagraph from '$lib/components/+articleParagraph.svelte';
	import { EgliseParagraph1 } from './paragraphs';
	import ContactCard from '$lib/components/+contactCard.svelte';
	import { onMount } from 'svelte';
	import LoadingRing from '$lib/components/LoadingRing.svelte';

	let stats: {
		totalVisitors: number;
		todayVisitors: number;
		dailyAverage: number;
		monthlyAverage: number;
		topCountries: { name: string; count: number }[];
		deviceStats: { type: string; count: number }[];
	} | null = $state(null);
	let statsError = $state(false);
	let statsLoading = $state(true);

	const formatNumber = new Intl.NumberFormat('fr-FR').format;
	const percentage = (count: number) =>
		stats?.totalVisitors ? Math.round((count / stats.totalVisitors) * 1000) / 10 : 0;
	const deviceLabel = (type: string) =>
		({ Desktop: 'Ordinateur', Mobile: 'Mobile', Tablet: 'Tablette', Unknown: 'Autre' })[type] ||
		type;

	async function loadStats() {
		statsLoading = true;
		statsError = false;
		try {
			const res = await fetch('/api/analytics');
			if (!res.ok) throw new Error(`Analytics request failed: ${res.status}`);
			stats = await res.json();
		} catch (e) {
			console.error('Failed to fetch stats:', e);
			statsError = true;
		} finally {
			statsLoading = false;
		}
	}

	onMount(loadStats);
</script>

<!-- Title/description/og:*/canonical come from `meta` in this route's
     load — the root layout renders the single canonical tag set ($lib/seo). -->
<div class="flex flex-col overflow-hidden">
	<header class="relative h-[40vh] min-h-[300px] max-h-[500px] overflow-hidden">
		<img
			src="/img/eglise_header.jpg"
			alt="Église Murambi"
			class="absolute inset-0 w-full h-full object-cover"
		/>
		<div
			class="absolute inset-0 bg-gradient-to-t from-stone-900/70 via-stone-900/30 to-transparent"
		></div>
		<div class="absolute bottom-0 left-0 right-0 p-8 md:p-12">
			<div class="max-w-3xl mx-auto">
				<p
					class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-3 font-body"
					style="color: rgba(255,255,255,0.7);"
				>
					À propos
				</p>
				<h1 class="font-display text-3xl md:text-5xl text-white leading-tight">Qui nous sommes</h1>
			</div>
		</div>
	</header>
	<div class="relative flex flex-row justify-center h-auto w-full pt-16 pb-12">
		<div class="relative flex flex-col items-start w-full max-w-6xl space-y-8 mx-auto px-6">
			{#each EgliseParagraph1 as paragraph, index}
				<ArticleParagraph text={paragraph.text} />
			{/each}
			<h2 class="font-display text-2xl md:text-3xl font-semibold text-stone-900">Contacter</h2>
			<ContactCard />
			{#if statsLoading}
				<h2 class="font-display text-2xl md:text-3xl font-semibold text-stone-900">Statistiques</h2>
				<div
					class="w-full bg-stone-50 border border-stone-100 p-8 flex items-center justify-center"
				>
					<div class="flex items-center gap-3 text-stone-400">
						<LoadingRing size={20} className="text-missionnaire" />
						<span class="text-sm font-medium">Chargement des statistiques...</span>
					</div>
				</div>
			{:else if statsError}
				<h2 class="font-display text-2xl md:text-3xl font-semibold text-stone-900">Statistiques</h2>
				<div class="w-full bg-red-50 border border-red-100 p-8 text-center">
					<p class="text-red-600 font-medium text-sm">Impossible de charger les statistiques.</p>
					<button
						class="mt-3 text-sm text-missionnaire hover:text-missionnaire font-bold"
						onclick={loadStats}
					>
						Réessayer
					</button>
				</div>
			{:else if stats}
				<h2 class="font-display text-2xl md:text-3xl font-semibold text-stone-900">Statistiques</h2>
				<p class="-mt-5 text-sm text-stone-500">
					Visiteurs actifs estimés. Les robots reconnus et les visites trop brèves sont exclus.
				</p>
				<div class="grid grid-cols-2 lg:grid-cols-4 gap-4 w-full">
					<div class="border border-stone-200/60 bg-white/40 p-5 card-lift space-y-2">
						<span class="text-xs font-medium text-stone-500 uppercase tracking-wider"
							>Aujourd'hui</span
						>
						<div class="flex items-center gap-2">
							<div class="w-2.5 h-2.5 rounded-full bg-green-500"></div>
							<span class="text-3xl font-black text-stone-900"
								>{formatNumber(stats.todayVisitors)}</span
							>
						</div>
					</div>
					<div class="border border-stone-200/60 bg-white/40 p-5 card-lift space-y-2">
						<span class="text-xs font-medium text-stone-500 uppercase tracking-wider"
							>Depuis le début</span
						>
						<div class="text-3xl font-black text-stone-900">
							{formatNumber(stats.totalVisitors)}
						</div>
					</div>
					<div class="border border-stone-200/60 bg-white/40 p-5 card-lift space-y-2">
						<span class="text-xs font-medium text-stone-500 uppercase tracking-wider"
							>Moyenne par jour</span
						>
						<div class="text-3xl font-black text-stone-900">{formatNumber(stats.dailyAverage)}</div>
						<p class="text-xs text-stone-400">Jours complets</p>
					</div>
					<div class="border border-stone-200/60 bg-white/40 p-5 card-lift space-y-2">
						<span class="text-xs font-medium text-stone-500 uppercase tracking-wider"
							>Moyenne par mois</span
						>
						<div class="text-3xl font-black text-stone-900">
							{formatNumber(stats.monthlyAverage)}
						</div>
						<p class="text-xs text-stone-400">Mois complets</p>
					</div>
				</div>

				<div class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full items-start">
					<div class="border border-stone-200/60 bg-white/40 p-6 card-lift space-y-5">
						<span class="text-sm font-medium text-stone-500 uppercase tracking-wider"
							>Appareils</span
						>
						<div class="space-y-4">
							{#each stats.deviceStats as device}
								<div class="space-y-1.5">
									<div class="flex justify-between gap-4 text-sm">
										<span class="text-stone-600">{deviceLabel(device.type)}</span>
										<span class="font-bold text-stone-900"
											>{formatNumber(device.count)}
											<span class="font-normal text-stone-400">({percentage(device.count)} %)</span
											></span
										>
									</div>
									<div class="h-1.5 rounded-full bg-stone-100 overflow-hidden">
										<div
											class="h-full rounded-full bg-missionnaire"
											style={`width: ${percentage(device.count)}%`}
										></div>
									</div>
								</div>
							{/each}
						</div>
					</div>

					<div class="border border-stone-200/60 bg-white/40 p-6 card-lift space-y-5">
						<span class="text-sm font-medium text-stone-500 uppercase tracking-wider"
							>Principaux pays</span
						>
						<div class="space-y-3">
							{#each stats.topCountries as country}
								<div class="space-y-1.5">
									<div class="flex justify-between gap-4 text-sm">
										<span class="text-stone-600 truncate"
											>{country.name === 'Unknown' ? 'Autre' : country.name}</span
										>
										<span class="font-bold text-stone-900 shrink-0"
											>{formatNumber(country.count)}
											<span class="font-normal text-stone-400">({percentage(country.count)} %)</span
											></span
										>
									</div>
									<div class="h-1.5 rounded-full bg-stone-100 overflow-hidden">
										<div
											class="h-full rounded-full bg-missionnaire"
											style={`width: ${percentage(country.count)}%`}
										></div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<h2 class="font-display text-2xl md:text-3xl font-semibold text-stone-900">
				Réseaux sociaux
			</h2>

			<div
				class="flex flex-col items-start space-y-2 md:space-y-4 text-xs md:text-base text-stone-500 font-body"
			>
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
