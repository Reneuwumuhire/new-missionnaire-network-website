<script lang="ts">
	import { onMount } from 'svelte';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();

	onMount(() => {
		if (form?.approved) setTimeout(() => window.close(), 800);
	});
</script>

<svelte:head><title>Connect Missionnaire Studio</title></svelte:head>

<div class="flex min-h-screen items-center justify-center bg-cream px-4">
	<div class="w-full max-w-md border border-stone-200 bg-white p-8 shadow-4xl">
		<h1 class="font-display text-2xl text-stone-800">Connect Missionnaire Studio</h1>
		{#if form?.approved}
			<p class="mt-4 text-emerald-700">Studio is connected. Returning to the desktop app…</p>
		{:else}
			<p class="mt-3 text-sm text-stone-600">Signed in as {data.name}. Allow this Studio computer to manage live sessions for 30 minutes?</p>
			<form method="POST" class="mt-6"><input type="hidden" name="code" value={data.code} /><button class="admin-btn-primary">Continue with this session</button></form>
		{/if}
	</div>
</div>
