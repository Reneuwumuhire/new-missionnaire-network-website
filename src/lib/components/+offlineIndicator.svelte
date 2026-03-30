<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	let isOffline = false;

	onMount(() => {
		if (!browser) return;
		isOffline = !navigator.onLine;

		const goOffline = () => { isOffline = true; };
		const goOnline = () => { isOffline = false; };

		window.addEventListener('offline', goOffline);
		window.addEventListener('online', goOnline);

		return () => {
			window.removeEventListener('offline', goOffline);
			window.removeEventListener('online', goOnline);
		};
	});
</script>

{#if isOffline}
	<div class="fixed top-0 left-0 right-0 z-[9998] bg-gray-900 text-white text-center text-sm py-2 px-4 font-medium">
		Vous etes hors ligne. Certaines fonctionnalites peuvent etre limitees.
	</div>
{/if}
