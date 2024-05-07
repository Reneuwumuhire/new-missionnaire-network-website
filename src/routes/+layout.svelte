<script lang="ts">
	import '../app.css';
	import NavBar from '$lib/components/+navBar.svelte';
	import SocialMediaAbove from '$lib/components/+socialMediaAbove.svelte';
	import Footer from '$lib/components/+footer.svelte';
	import CopyButton from '$lib/components/+copyButton.svelte';
	import type { PageData } from './$types';
	import { QueryClientProvider } from '@tanstack/svelte-query';

	export let data: PageData;
	// fix :>>>>>>>> data.IsLiveStreamlive.value
	let isLiveStreamAvailable = false;
</script>

<QueryClientProvider client={data.queryClient}>
	<div class="flex flex-col fixed top-0 z-10 bg-white w-full">
		{#if isLiveStreamAvailable}
			<SocialMediaAbove isLiveStream />
		{/if}
		<NavBar />
	</div>
	<div class=" mt-28">
		<slot />
	</div>
	<Footer />
	<CopyButton />
</QueryClientProvider>
