<script lang="ts">
	import '../app.css';
	import NavBar from '$lib/components/+navBar.svelte';
	import SocialMediaAbove from '$lib/components/+socialMediaAbove.svelte';
	import Footer from '$lib/components/+footer.svelte';
	import CopyButton from '$lib/components/+copyButton.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
	let isLiveStreamAvailable = data.IsLiveStreamlive.value;
</script>

{#if isLiveStreamAvailable}
	<SocialMediaAbove isLiveStream />
{/if}
<div class="flex flex-col">
	<NavBar />
</div>
<slot />
<Footer />
<CopyButton />
