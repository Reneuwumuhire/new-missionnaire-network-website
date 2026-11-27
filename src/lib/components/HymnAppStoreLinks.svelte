<script lang="ts">
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import FaBrandsGooglePlay from 'svelte-icons-pack/fa/FaBrandsGooglePlay';
	import FaBrandsApple from 'svelte-icons-pack/fa/FaBrandsApple';

	const stores = [
		{
			name: 'Google Play',
			href: 'https://play.google.com/store/apps/details?id=bi.indirimbozikunzwe&hl=en',
			icon: FaBrandsGooglePlay
		},
		{
			name: 'App Store',
			href: 'https://apps.apple.com/fr/app/indirimbo-zikundwa/id6782562783',
			icon: FaBrandsApple
		}
	];
</script>

<div class="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
	{#each stores as store (store.name)}
		<a
			href={store.href}
			target="_blank"
			rel="noopener noreferrer"
			class="inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded border border-stone-300 bg-white px-2 font-body text-xs font-semibold text-stone-900 hover:border-stone-600 hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-missionnaire-Yellow-600 sm:gap-2 sm:px-3 sm:text-sm"
		>
			<span aria-hidden="true"><Icon src={store.icon} size="16" /></span>
			{store.name}
		</a>
	{/each}
</div>
