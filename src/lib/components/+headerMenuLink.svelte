<script lang="ts">
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsChevronDown from 'svelte-icons-pack/bs/BsChevronDown';
	import { createEventDispatcher } from 'svelte';
	import type { NavigationLinkSubmenu } from '../../helpers/NavigationLinkList';

	export let subMenu: NavigationLinkSubmenu[];
	export let menuName: string;
	export let link: string;

	export let active: boolean = false;
	export let isOpen: boolean = false;
	export let activeClass: string = 'text-stone-600';
	export let inactiveClass: string = 'text-stone-400';

	import { onDestroy } from 'svelte';

	const dispatch = createEventDispatcher();

	let menuEl: HTMLDivElement;

	function handleToggle() {
		dispatch('toggle');
	}

	const closeMenu = (event: MouseEvent) => {
		if (isOpen && menuEl && !menuEl.contains(event.target as Node)) {
			dispatch('close');
		}
	};

	if (typeof window !== 'undefined') {
		window.addEventListener('click', closeMenu);
	}

	onDestroy(() => {
		if (typeof window !== 'undefined') {
			window.removeEventListener('click', closeMenu);
		}
	});
</script>

<div class="flex flex-col text-[13px] relative" bind:this={menuEl}>
	{#if subMenu && subMenu.length > 0}
		<button
			type="button"
			class="flex items-center gap-1 px-3 py-2 whitespace-nowrap text-stone-600 hover:text-missionnaire transition-colors duration-200"
			on:click|stopPropagation={handleToggle}
			aria-label="{menuName} - {isOpen ? 'fermer' : 'ouvrir'} le sous-menu"
		>
			{menuName}
			<Icon
				className="w-3 h-3 transition duration-300 ease-out {isOpen ? 'transform rotate-180' : ''}"
				src={BsChevronDown}
			/>
		</button>
	{:else}
		<a href={link} class="flex items-center px-3 py-2 whitespace-nowrap text-stone-600 hover:text-missionnaire transition-colors duration-200">
			{menuName}
		</a>
	{/if}
	{#if isOpen && subMenu && subMenu.length > 0}
		<div
			class="submenu-dropdown absolute z-50 self-center w-[400px] mt-10 bg-white border border-stone-200 flex flex-col p-2 shadow-xl shadow-stone-900/5"
		>
			{#each subMenu as { subName, link: subLink, subText, image, icon }, i (subName)}
				<a
					href={subLink}
					class="w-full flex items-center gap-4 p-3.5 transition-colors duration-200 hover:bg-stone-50"
					on:click={() => {
						dispatch('close');
					}}
				>
					<div class="flex-shrink-0 w-10 h-10 overflow-hidden bg-stone-100 border border-stone-200 flex items-center justify-center">
						{#if image}
							<img src={image} class="w-full h-full object-cover" alt={subName} />
						{:else if icon}
							<div class="text-missionnaire">
								<Icon src={icon} size="18" />
							</div>
						{/if}
					</div>
					<div class="flex flex-col min-w-0">
						<span class="text-sm font-semibold text-stone-800 leading-tight">
							{subName}
						</span>
						{#if subText}
							<p class="text-[11px] text-stone-400 mt-0.5 line-clamp-2 leading-relaxed">
								{subText}
							</p>
						{/if}
					</div>
				</a>
				{#if i < subMenu.length - 1}
					<div class="mx-3.5 border-b border-stone-100"></div>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.submenu-dropdown {
		animation: dropdown-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes dropdown-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
