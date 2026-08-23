<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>YouTube connected — Missionnaire Studio</title></svelte:head>

<main class="flex min-h-screen items-center justify-center bg-cream p-6 text-stone-800">
	<section class="w-full max-w-lg border border-stone-200 bg-white p-8 shadow-sm">
		<h1 class="font-serif text-3xl">YouTube connected</h1>
		<p class="mt-4 text-emerald-700">{data.channel} is ready. Return to Missionnaire Studio.</p>
	</section>
</main>
