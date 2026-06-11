<script lang="ts">
	import { page } from '$app/stores';
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsChevronDown from 'svelte-icons-pack/bs/BsChevronDown';
	import type { NavigationLinkSubmenu } from '../../helpers/NavigationLinkList';


	interface Props {
		subMenu: NavigationLinkSubmenu[];
		menuName: string;
		link: string;
		closeMenuFrom: () => void;
		active?: boolean;
		activeClass?: string;
		inactiveClass?: string;
		ontoggle?: () => void;
	}

	let {
		subMenu,
		menuName,
		link,
		closeMenuFrom,
		active = false,
		activeClass = 'text-missionnaire',
		inactiveClass = 'text-stone-400',
		ontoggle
	}: Props = $props();

	let isActive = $derived($page.url.pathname === link || $page.url.pathname.startsWith(link + '/'));
</script>

<div class="flex flex-col w-full border-b border-stone-100 last:border-b-0">
	{#if subMenu && subMenu.length > 0}
		<!-- Entire row is a single button for sub-menu items -->
		<button
			class="flex items-center justify-between w-full py-3.5 transition-colors duration-200 cursor-pointer"
			onclick={() => ontoggle?.()}
		>
			<span class="text-[15px] font-medium whitespace-nowrap {isActive ? 'text-missionnaire' : 'text-stone-700'}">
				{menuName}
			</span>
			<span class="{active ? activeClass : inactiveClass} transition-colors">
				<Icon
					src={BsChevronDown}
					className="w-3.5 h-3.5 transition duration-300 ease-out {active ? 'transform rotate-180' : ''}"
				/>
			</span>
		</button>
	{:else}
		<!-- No sub-menu — the whole row is a link -->
		<a
			href={link}
			class="flex items-center py-3.5 text-[15px] font-medium whitespace-nowrap w-full transition-colors duration-200 {isActive ? 'text-missionnaire' : 'text-stone-700 hover:text-missionnaire'}"
			onclick={() => closeMenuFrom()}
		>
			{menuName}
			{#if isActive}
				<span class="ml-2 w-1.5 h-1.5 rounded-full bg-missionnaire"></span>
			{/if}
		</a>
	{/if}

	{#if active && subMenu && subMenu.length > 0}
		<div class="mobo-submenu flex flex-col ml-4 mb-3 border-l-2 border-missionnaire/20 pl-4">
			{#each subMenu as { subName, link: subLink, icon }, i (subName)}
				{@const isSubActive = $page.url.pathname === subLink || $page.url.pathname.startsWith(subLink + '/')}
				<a
					href={subLink}
					class="flex items-center gap-3 py-2.5 transition-colors duration-200 {isSubActive ? 'text-missionnaire' : 'hover:text-missionnaire'}"
					onclick={() => {
						closeMenuFrom();
					}}
				>
					{#if icon}
						<div class="{isSubActive ? 'text-missionnaire' : 'text-missionnaire/60'}">
							<Icon src={icon} size="14" />
						</div>
					{/if}
					<span class="text-sm font-medium {isSubActive ? 'text-missionnaire font-semibold' : 'text-stone-600'}">
						{subName}
					</span>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.mobo-submenu {
		animation: submenu-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes submenu-in {
		from {
			opacity: 0;
			transform: translateX(-4px);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}
</style>
