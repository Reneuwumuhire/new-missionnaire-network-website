<script lang="ts">
	import '../app.css';
	import NavBar from '$lib/components/+navBar.svelte';
	import SocialMediaAbove from '$lib/components/+socialMediaAbove.svelte';
	import Footer from '$lib/components/+footer.svelte';
	import CopyButton from '$lib/components/+copyButton.svelte';
	import type { LayoutData } from './$types';
	import { QueryClientProvider } from '@tanstack/svelte-query';

	export let data: LayoutData;

	let isLiveStreamAvailable = data.IsLiveStreamlive;
</script>

<QueryClientProvider client={data.queryClient}>
	<div class="flex flex-col fixed top-0 z-10 bg-white w-full">
		{#if !isLiveStreamAvailable}
			<SocialMediaAbove isLiveStream />
		{/if}
		<NavBar />
	</div>
	<slot />
	<Footer />
	<CopyButton />
</QueryClientProvider>
