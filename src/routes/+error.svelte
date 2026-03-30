<script lang="ts">
	import { page } from '$app/stores';
</script>

<div class="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
	<h1 class="text-6xl font-black text-gray-900 mb-2">{$page.status}</h1>
	<p class="text-lg text-gray-500 mb-8 max-w-md">
		{#if $page.status === 404}
			Cette page n'existe pas ou a ete deplacee.
		{:else}
			Une erreur est survenue. Veuillez reessayer plus tard.
		{/if}
	</p>
	{#if $page.error?.message}
		<p class="text-sm text-gray-400 mb-6">{$page.error.message}</p>
	{/if}
	<a
		href="/"
		class="px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition-colors"
	>
		Retour a l'accueil
	</a>
</div>
