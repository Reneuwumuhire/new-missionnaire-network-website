<script lang="ts">
	import LiveRadioPlayer from '$lib/components/+liveRadioPlayer.svelte';
</script>

<svelte:head>
	<title>Radio en direct - Missionnaire Network</title>
</svelte:head>

<section class="w-full py-16 px-4 md:px-8">
	<div class="max-w-4xl mx-auto">
		<div
			class="rounded-3xl bg-gradient-to-br from-neutral-950 to-neutral-800 px-6 py-10 md:px-10 md:py-12 text-white shadow-xl"
		>
			<p class="text-xs font-black uppercase tracking-[0.24em] text-orange-300 mb-3">
				Radio en direct
			</p>
			<h1 class="text-3xl md:text-5xl font-black leading-tight">Radio en direct</h1>
			<p class="mt-4 text-sm md:text-base text-neutral-200 max-w-2xl">
				Quand le flux est
				<span class="font-bold text-white">hors ligne</span>,
				la page surveille automatiquement le signal. Appuyez sur
				<span class="font-bold text-white">Ecouter</span>.
			</p>
		</div>
		<div class="mt-8">
			<LiveRadioPlayer />
		</div>
	</div>
</section>
