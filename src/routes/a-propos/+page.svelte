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
		content="Qui nous sommes, comment nous contacter et suivre l'oeuvre de Missionnaire Network."
	/>
</svelte:head>
<div class=" flex flex-col overflow-hidden">
	<header>
		<div class="flex flex-row items-center justify-center space-x-2">
			<div class="header-branham flex flex-col items-center justify-center w-full" />
		</div>
	</header>
	<div class="relative flex flex-row justify-center h-auto w-full py-14">
		<div class="relative flex flex-col items-start w-full max-w-3xl space-y-6 px-5">
			<div>
				<small class=" text-missionnaire uppercase leading-6 tracking-widest text-xl font-bold"
					>Eglise</small
				>
				<h1 class=" text-4xl font-black text-[#414141]">Qui nous sommes</h1>
			</div>
			{#each EgliseParagraph1 as paragraph, index}
				<ArticleParagraph text={paragraph.text} />
			{/each}
			<!-- <h1 class=" text-4xl font-black text-[#414141]">Location</h1>
			<MapComponent /> -->
			<h1 class=" text-4xl font-black text-[#414141]">Contacter</h1>
			<ContactCard />
			{#if statsLoading}
				<h1 class=" text-4xl font-black text-[#414141]">Statistiques</h1>
				<div class="w-full bg-gray-50 rounded-2xl border border-gray-100 p-8 flex items-center justify-center">
					<div class="flex items-center gap-3 text-gray-400">
						<div class="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-orange-500"></div>
						<span class="text-sm font-medium">Chargement des statistiques...</span>
					</div>
				</div>
			{:else if statsError}
				<h1 class=" text-4xl font-black text-[#414141]">Statistiques</h1>
				<div class="w-full bg-red-50 rounded-2xl border border-red-100 p-8 text-center">
					<p class="text-red-600 font-medium text-sm">Impossible de charger les statistiques.</p>
					<button
						class="mt-3 text-sm text-orange-500 hover:text-orange-600 font-bold"
						on:click={() => { statsLoading = true; statsError = false; fetch('/api/analytics').then(r => r.ok ? r.json() : Promise.reject()).then(d => { stats = d; }).catch(() => { statsError = true; }).finally(() => { statsLoading = false; }); }}
					>
						Reessayer
					</button>
				</div>
			{:else if stats}
				<h1 class=" text-4xl font-black text-[#414141]">Statistiques</h1>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
					<!-- Core Counter Stats -->
					<div class="space-y-4">
						<div class="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col space-y-2">
							<span class="text-sm font-medium text-gray-500 uppercase tracking-wider"
								>Visiteurs Aujourd'hui</span
							>
							<div class="flex items-center space-x-2">
								<div class="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
								<span class="text-3xl font-black text-hardBlack">{stats.todayVisitors}</span>
							</div>
						</div>
						<div class="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col space-y-2">
							<span class="text-sm font-medium text-gray-500 uppercase tracking-wider"
								>Visiteurs Uniques</span
							>
							<span class="text-3xl font-black text-hardBlack">{stats.totalVisitors}</span>
						</div>
						<div class="grid grid-cols-2 gap-4">
							<div class="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col space-y-2">
								<span class="text-sm font-medium text-gray-500 uppercase tracking-wider"
									>Moy. / Jour</span
								>
								<span class="text-3xl font-black text-hardBlack">{stats.dailyAverage}</span>
							</div>
							<div class="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col space-y-2">
								<span class="text-sm font-medium text-gray-500 uppercase tracking-wider"
									>Moy. / Mois</span
								>
								<span class="text-3xl font-black text-hardBlack">{stats.monthlyAverage}</span>
							</div>
						</div>

						<!-- Device Stats -->
						<div class="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col space-y-4">
							<span class="text-sm font-medium text-gray-500 uppercase tracking-wider"
								>Appareils</span
							>
							<div class="flex flex-col space-y-2">
								{#each stats.deviceStats as device}
									<div class="flex justify-between items-center">
										<span class="text-gray-600 capitalize">{device.type}</span>
										<span class="text-hardBlack font-bold">{device.count}</span>
									</div>
								{/each}
							</div>
						</div>
					</div>

					<!-- Country Stats -->
					<div class="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col space-y-4">
						<span class="text-sm font-medium text-gray-500 uppercase tracking-wider">Top Pays</span>
						<div class="flex flex-col space-y-3">
							{#each stats.topCountries as country}
								<div class="flex justify-between items-center">
									<div class="flex items-center space-x-2">
										<span class="text-gray-600"
											>{country.name === 'Unknown' ? '🌍 Autre' : country.name}</span
										>
									</div>
									<span class="text-hardBlack font-bold">{country.count}</span>
								</div>
							{/each}
						</div>
					</div>
				</div>
			{/if}

			<h1 class=" text-4xl font-black text-[#414141]">Social media links</h1>

			<div class="flex flex-col items-start space-y-2 md:space-y-4 text-xs md:text-base">
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

<style>
	.header-branham {
		background-image: url('/img/eglise_header.jpg');
		background-color: #cccccc;
		background-repeat: no-repeat;
		background-size: cover;
		background-position: center;
		/* background-attachment: fixed; */
		height: 500px;
	}
</style>
