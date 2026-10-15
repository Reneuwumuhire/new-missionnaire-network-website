<script lang="ts">
	let { data } = $props();
	let closeBlocked = $state(false);

	function closeWindow() {
		window.close();
		window.setTimeout(() => (closeBlocked = !window.closed), 500);
	}

	$effect(() => {
		// Studio detects the new channel and raises its window independently.
		const timer = window.setTimeout(closeWindow, 400);
		return () => window.clearTimeout(timer);
	});
</script>

<svelte:head><title>YouTube connected — Missionnaire Studio</title></svelte:head>

<main class="flex min-h-screen items-center justify-center bg-cream p-6 text-stone-800">
	<section class="w-full max-w-lg border border-stone-200 bg-white p-8 shadow-sm">
		<h1 class="font-serif text-3xl">YouTube connected</h1>
		<p class="mt-4 text-emerald-700">{data.channel} is ready. Returning to Missionnaire Studio…</p>
		{#if closeBlocked}
			<p class="mt-3 text-sm text-stone-600">
				Your browser kept this tab open. You can close it safely.
			</p>
			<button type="button" class="admin-btn-primary mt-5" onclick={closeWindow}
				>Close this tab</button
			>
		{/if}
	</section>
</main>
