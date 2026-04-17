<script lang="ts">
	import LiveRadioPlayer from '$lib/components/+liveRadioPlayer.svelte';
	import NotificationBell from '$lib/components/+notificationBell.svelte';
	import RecentRecordings from '$lib/components/+recentRecordings.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
	let bellRef: any;
</script>

<svelte:head>
	<title>Audio en direct - Missionnaire Network</title>
	<meta name="description" content="Écoutez Missionnaire Network en direct audio. Prédications et cantiques du Message de l'Heure en streaming continu." />
	<link rel="canonical" href="https://missionnaire.net/live" />
	<meta property="og:title" content="Audio en direct - Missionnaire Network" />
	<meta property="og:description" content="Écoutez Missionnaire Network en direct audio. Prédications et cantiques du Message de l'Heure en streaming continu." />
	<meta property="og:url" content="https://missionnaire.net/live" />
</svelte:head>

<section class="w-full py-14 md:py-20 px-6">
	<div class="max-w-2xl mx-auto">
		<!-- Header -->
		<div class="text-center mb-12">
			<div class="flex justify-center mb-5">
				<!-- Audio waveform icon -->
				<svg width="32" height="28" viewBox="0 0 32 28" fill="none">
					<rect x="0" y="8" width="4" height="12" rx="2" fill="#FF880C" fill-opacity="0.3">
						<animate attributeName="height" values="12;20;12" dur="1.2s" repeatCount="indefinite" />
						<animate attributeName="y" values="8;4;8" dur="1.2s" repeatCount="indefinite" />
					</rect>
					<rect x="7" y="4" width="4" height="20" rx="2" fill="#FF880C" fill-opacity="0.4">
						<animate attributeName="height" values="20;10;20" dur="1s" repeatCount="indefinite" />
						<animate attributeName="y" values="4;9;4" dur="1s" repeatCount="indefinite" />
					</rect>
					<rect x="14" y="2" width="4" height="24" rx="2" fill="#FF880C" fill-opacity="0.5">
						<animate attributeName="height" values="24;14;24" dur="1.4s" repeatCount="indefinite" />
						<animate attributeName="y" values="2;7;2" dur="1.4s" repeatCount="indefinite" />
					</rect>
					<rect x="21" y="6" width="4" height="16" rx="2" fill="#FF880C" fill-opacity="0.4">
						<animate attributeName="height" values="16;22;16" dur="1.1s" repeatCount="indefinite" />
						<animate attributeName="y" values="6;3;6" dur="1.1s" repeatCount="indefinite" />
					</rect>
					<rect x="28" y="9" width="4" height="10" rx="2" fill="#FF880C" fill-opacity="0.3">
						<animate attributeName="height" values="10;18;10" dur="1.3s" repeatCount="indefinite" />
						<animate attributeName="y" values="9;5;9" dur="1.3s" repeatCount="indefinite" />
					</rect>
				</svg>
			</div>
			<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-3 font-body">
				Direct Audio
			</p>
			<h1 class="font-display text-3xl md:text-4xl font-semibold text-stone-900">Écoute en direct</h1>
			<p class="mt-3 text-[15px] text-stone-400 font-body font-light max-w-md mx-auto leading-relaxed">
				La page se met à jour automatiquement. Dès que le direct audio commence, appuyez sur Lecture.
			</p>
		</div>

		<!-- Player -->
		<LiveRadioPlayer />

		<!-- Recent recordings -->
		<RecentRecordings recordings={data.recentRecordings} />

		<!-- Notification opt-in -->
		<button
			on:click={() => bellRef?.toggle()}
			class="flex items-center gap-4 w-full text-left border px-5 py-4 mt-6 transition-all duration-300 cursor-pointer group {bellRef?.isSubscribed
				? 'border-missionnaire/30 bg-missionnaire/5'
				: 'border-stone-200/60 bg-white/40 hover:border-missionnaire/30 hover:bg-missionnaire/5 hover:-translate-y-0.5 hover:shadow-sm'}"
		>
			<div class="w-10 h-10 flex items-center justify-center shrink-0 border transition-colors duration-300 {bellRef?.isSubscribed
				? 'border-missionnaire/30 text-missionnaire'
				: 'border-stone-200/60 text-stone-400 group-hover:border-missionnaire/30 group-hover:text-missionnaire'}"
			>
				<NotificationBell bind:this={bellRef} />
			</div>
			<div class="font-body flex-1 min-w-0">
				{#if bellRef?.isSubscribed}
					<p class="text-sm font-semibold text-missionnaire">Notifications activées</p>
					<p class="text-[11px] text-stone-400 mt-0.5">Cliquez pour désactiver</p>
				{:else}
					<p class="text-sm font-semibold text-stone-700 group-hover:text-missionnaire transition-colors">Activer les notifications</p>
					<p class="text-[11px] text-stone-400 mt-0.5">Soyez alerté quand le direct audio commence</p>
				{/if}
			</div>
			<span class="text-[11px] font-bold uppercase tracking-[0.15em] font-body shrink-0 transition-colors duration-300 {bellRef?.isSubscribed
				? 'text-missionnaire/60'
				: 'text-stone-300 group-hover:text-missionnaire'}">
				{bellRef?.isSubscribed ? 'Activé' : 'Activer →'}
			</span>
		</button>

		<!-- Info when offline -->
		<div class="mt-8 text-center">
			<p class="ornament-line text-stone-200 mb-6">
				<svg width="10" height="10" viewBox="0 0 14 14" fill="none"><path d="M7 0L8.5 5.5L14 7L8.5 8.5L7 14L5.5 8.5L0 7L5.5 5.5L7 0Z" fill="currentColor"/></svg>
			</p>
			<p class="font-display text-lg italic text-stone-400 leading-relaxed">
				« Voici, je me tiens à la porte, et je frappe. »
			</p>
			<p class="text-[11px] font-bold uppercase tracking-[0.25em] text-missionnaire/60 mt-2 font-body">
				— Apocalypse 3:20
			</p>
		</div>
	</div>
</section>
