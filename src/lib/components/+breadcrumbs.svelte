<script lang="ts">
	export let items: { label: string; href?: string }[] = [];
</script>

<nav aria-label="Fil d'Ariane" class="w-full max-w-7xl mx-auto mb-4">
	<ol class="flex items-center gap-1.5 text-xs font-medium text-gray-400 flex-wrap">
		<li>
			<a href="/" class="hover:text-orange-600 transition-colors">Accueil</a>
		</li>
		{#each items as item, i}
			<li class="flex items-center gap-1.5">
				<span class="text-gray-300">/</span>
				{#if item.href && i < items.length - 1}
					<a href={item.href} class="hover:text-orange-600 transition-colors">{item.label}</a>
				{:else}
					<span class="text-gray-600 font-bold truncate max-w-[200px] md:max-w-none">{item.label}</span>
				{/if}
			</li>
		{/each}
	</ol>
</nav>
