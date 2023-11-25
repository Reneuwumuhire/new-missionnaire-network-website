<script lang="ts">
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsChevronDown from 'svelte-icons-pack/bs/BsChevronDown';
	// FiBookOpen
	import type { NavigationLinkSubmenu } from '../../helpers/NavigationLinkList';

	export let subMenu: NavigationLinkSubmenu[];
	export let menuName: string;
	export let link: string;
	export let closeMenuFrom: () => void;

	export let active: boolean = false;
	export let activeClass: string = 'text-accentGray';
	export let inactiveClass: string = 'text-grayWeak';

	let showSubMenu: boolean = false;

	const closeMenu = (event: any) => {
		if (showSubMenu && !(event.target as Element).closest('div')) {
			showSubMenu = false;
		}
	};
	// @ts-ignore
	if (typeof window !== 'undefined') {
		window.addEventListener('click', closeMenu);
	}
</script>

<div class="flex flex-col w-full">
	<div
		class="flex flex-row items-center justify-between space-x-2 hover:text-missionnaire hover:font-bold transition-all duration-75 ease-in-out"
	>
		{#if subMenu && subMenu.length > 0}
			<button
				class="text-base font-normal whitespace-nowrap"
				on:click={() => {
					showSubMenu = !showSubMenu;
				}}>{menuName}</button
			>
		{:else}
			<a
				href={link}
				class="text-base font-normal whitespace-nowrap w-full"
				on:click={() => closeMenuFrom()}
			>
				{menuName}
			</a>
		{/if}
		{#if subMenu && subMenu.length > 0}
			<!-- button to trigger the show subMenu with Icon -->
			<button
				class={`text-base font-normal ${active ? activeClass : inactiveClass}`}
				on:click={() => {
					showSubMenu = !showSubMenu;
				}}
			>
				<Icon
					className={`w-4 h-4 ml-1 transition
          duration-500 ease-in-out
           ${showSubMenu ? 'transform rotate-180' : ''}`}
					src={BsChevronDown}
				/>
			</button>
		{/if}
	</div>
	{#if showSubMenu && subMenu && subMenu.length > 0}
		<div
			class=" self-start w-full items-end mt-2 border-2 bg-missionnaire-50 border-grayWhite flex flex-col transition-all duration-300 ease-in-out"
		>
			{#each subMenu as { subName, link } (subName)}
				<a
					href={link}
					class="text-sm font-normal w-full my-1 p-2 transition duration-500 ease-in-out"
					on:click={() => {
						showSubMenu = false;
						closeMenuFrom();
					}}
				>
					<span class="  font-bold text-hardBlack">
						{subName}
					</span>
				</a>
			{/each}
		</div>
	{/if}
</div>

<!--  -->
<style>
	/* Use specific classes or define styles as needed */
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
