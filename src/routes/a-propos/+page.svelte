<script lang="ts">
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import FaBrandsYoutube from 'svelte-icons-pack/fa/FaBrandsYoutube';
	import FaBrandsFacebook from 'svelte-icons-pack/fa/FaBrandsFacebook';
	import RiLogoWhatsappFill from 'svelte-icons-pack/ri/RiLogoWhatsappFill';
	import ArticleParagraph from '$lib/components/+articleParagraph.svelte';
	import { EgliseParagraph1 } from './paragraphs';
	import ContactCard from '$lib/components/+contactCard.svelte';
	import MapComponent from '$lib/components/+mapComponent.svelte';
	import { onMount } from 'svelte';

	let stats: {
		totalVisitors: number;
		todayVisitors: number;
		topCountries: { name: string; count: number }[];
		deviceStats: { type: string; count: number }[];
	} | null = null;

	onMount(async () => {
		try {
			const res = await fetch('/api/analytics');
			if (res.ok) {
				stats = await res.json();
			}
		} catch (e) {
			console.error('Failed to fetch stats:', e);
		}
	});
</script>

<title>Missionnaire Network | A propos de nous</title>
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
			<h1 class=" text-4xl font-black text-[#414141]">Location</h1>
			<MapComponent />
			<h1 class=" text-4xl font-black text-[#414141]">Contacter</h1>
			<ContactCard />
			{#if stats}
				<h1 class=" text-4xl font-black text-[#414141]">Statistiques</h1>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
					<!-- Core Counter Stats -->
					<div class="space-y-4">
						<div class="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col space-y-2">
							<span class="text-sm font-medium text-gray-500 uppercase tracking-wider"
								>Visites Aujourd'hui</span
							>
							<div class="flex items-center space-x-2">
								<div class="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
								<span class="text-3xl font-black text-hardBlack">{stats.todayVisitors}</span>
							</div>
						</div>
						<div class="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col space-y-2">
							<span class="text-sm font-medium text-gray-500 uppercase tracking-wider"
								>Total Visiteurs</span
							>
							<span class="text-3xl font-black text-hardBlack">{stats.totalVisitors}</span>
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
						<span class="text-sm font-medium text-gray-500 uppercase tracking-wider"
							>Top Pays</span
						>
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
				>
					<Icon className="w-8 h-8" src={FaBrandsYoutube} />
					<span class="">https://www.youtube.com/@MissionnaireNetwork</span>
				</a>
				<a
					class="flex flex-row items-center space-x-2 md:space-x-4"
					href="https://www.facebook.com/missionnaire.net"
					target="_blank"
				>
					<Icon className="w-8 h-8" src={FaBrandsFacebook} />
					<span>https://www.facebook.com/missionnaire.net</span>
				</a>
				<a
					class="flex flex-row items-center space-x-2 md:space-x-4"
					href="https://wa.me/+250728727726"
					target="_blank"
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
