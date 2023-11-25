<script lang="ts">
	import '../app.css';
	import NavBar from '$lib/components/+navBar.svelte';
	import SocialMediaAbove from '$lib/components/+socialMediaAbove.svelte';
	import Footer from '$lib/components/+footer.svelte';
</script>

<SocialMediaAbove isLiveStream />
<div class="flex flex-col">
	<NavBar />
</div>

<slot />
<Footer />
