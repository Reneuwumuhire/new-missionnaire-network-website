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
	export let activeClass: string = 'text-accentGray';
	export let inactiveClass: string = 'text-grayWeak';

	const dispatch = createEventDispatcher();

	function handleToggle() {
		dispatch('toggle');
	}

	const closeMenu = (event: any) => {
		if (isOpen && !(event.target as Element).closest('div')) {
			dispatch('close');
		}
	};

	if (typeof window !== 'undefined') {
		window.addEventListener('click', closeMenu);
	}
</script>

<div class="flex flex-col text-sm relative">
	<div
		class="flex flex-row items-center space-x-2 hover:text-missionnaire transition-all duration-75 ease-in-out"
	>
		{#if subMenu && subMenu.length > 0}
			<button
				type="button"
				class="whitespace-nowrap"
				on:click|stopPropagation={handleToggle}>{menuName}</button
			>
		{:else}
			<a href={link} class=" font-normal whitespace-nowrap">
				{menuName}
			</a>
		{/if}
		{#if subMenu && subMenu.length > 0}
			<button
				type="button"
				class={` ${active ? activeClass : inactiveClass}`}
				on:click|stopPropagation={handleToggle}
			>
				<Icon
					className={`w-4 h-4 ml-1 transition
          duration-500 ease-in-out
           ${isOpen ? 'transform rotate-180' : ''}`}
					src={BsChevronDown}
				/>
			</button>
		{/if}
	</div>
	{#if isOpen && subMenu && subMenu.length > 0}
		<div
			class="absolute z-50 self-center w-[450px] mt-10 bg-pureWhite border border-gray-100 flex flex-col rounded-2xl p-4 shadow-2xl shadow-black/5"
		>
			{#each subMenu as { subName, link, subText, image, icon }, i (subName)}
				<a
					href={link}
					class="w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-300 {i === 0 ? 'bg-orange-50/50 hover:bg-orange-50' : 'hover:bg-orange-50/30'}"
					on:click={() => {
						dispatch('close');
					}}
				>
					<div class="flex-shrink-0 w-16 h-16 rounded-2xl overflow-hidden bg-white shadow-sm border border-gray-50 flex items-center justify-center">
						{#if image}
							<img src={image} class="w-full h-full object-cover" alt={subName} />
						{:else if icon}
							<div class="text-orange-500">
								<Icon src={icon} size="32" />
							</div>
						{/if}
					</div>
					<div class="flex flex-col min-w-0">
						<span class="text-sm font-black text-gray-900 group-hover:text-missionnaire leading-tight">
							{subName}
						</span>
						<p class="text-[11px] font-medium text-gray-400 mt-1 line-clamp-2 leading-relaxed">
							{subText}
						</p>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.scale-y-0 {
		transform: scaleY(0);
	}

	.scale-y-100 {
		transform: scaleY(1);
	}

	.opacity-0 {
		opacity: 0;
	}

	.opacity-100 {
		opacity: 1;
	}
</style>
