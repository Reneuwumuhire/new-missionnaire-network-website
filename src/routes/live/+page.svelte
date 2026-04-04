<script lang="ts">
	import LiveRadioPlayer from '$lib/components/+liveRadioPlayer.svelte';
	import NotificationBell from '$lib/components/+notificationBell.svelte';

	let bellRef: any;
</script>

<svelte:head>
	<title>Radio en direct - Missionnaire Network</title>
	<meta name="description" content="Écoutez la radio Missionnaire Network en direct. Prédications et cantiques du Message de l'Heure en streaming continu." />
	<link rel="canonical" href="https://missionnaire.net/live" />
	<meta property="og:title" content="Radio en direct - Missionnaire Network" />
	<meta property="og:description" content="Écoutez la radio Missionnaire Network en direct. Prédications et cantiques du Message de l'Heure en streaming continu." />
	<meta property="og:url" content="https://missionnaire.net/live" />
</svelte:head>

<section class="w-full py-14 md:py-20 px-6">
	<div class="max-w-2xl mx-auto">
		<!-- Header -->
		<div class="text-center mb-12">
			<div class="flex justify-center mb-5">
				<svg width="20" height="28" viewBox="0 0 28 38" fill="none">
					<rect x="10" y="0" width="8" height="38" rx="1.5" fill="#FF880C" fill-opacity="0.2" />
					<rect x="0" y="8" width="28" height="8" rx="1.5" fill="#FF880C" fill-opacity="0.2" />
				</svg>
			</div>
			<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-3 font-body">
				Radio Missionnaire
			</p>
			<h1 class="font-display text-3xl md:text-4xl font-semibold text-stone-900">Radio en direct</h1>
			<p class="mt-3 text-[15px] text-stone-400 font-body font-light max-w-md mx-auto leading-relaxed">
				La page se met à jour automatiquement. Dès que le direct commence, appuyez sur Lecture.
			</p>
		</div>

		<!-- Player -->
		<LiveRadioPlayer />

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
					<p class="text-[11px] text-stone-400 mt-0.5">Soyez alerté quand la radio est en direct</p>
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
