<script lang="ts">
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsChevronDown from 'svelte-icons-pack/bs/BsChevronDown';
	// FiBookOpen
	import type { NavigationLinkSubmenu } from '../../helpers/NavigationLinkList';

	export let subMenu: NavigationLinkSubmenu[];
	export let menuName: string;
	export let link: string;

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
	// when clicked outside the menu close the menu and when window is available
	// add the event listener
	if (typeof window !== 'undefined') {
		window.addEventListener('click', closeMenu);
	}
</script>

<div class="flex flex-col text-sm">
	<div
		class="flex flex-row items-center space-x-2 hover:text-missionnaire transition-all duration-75 ease-in-out"
	>
		{#if subMenu && subMenu.length > 0}
			<button
				class="whitespace-nowrap"
				on:click={() => {
					showSubMenu = !showSubMenu;
				}}>{menuName}</button
			>
		{:else}
			<a href={link} class=" font-normal whitespace-nowrap">
				{menuName}
			</a>
		{/if}
		{#if subMenu && subMenu.length > 0}
			<!-- button to trigger the show subMenu with Icon -->
			<button
				class={` ${active ? activeClass : inactiveClass}`}
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
			class="absolute z-50 self-center w-fit items-end max-w-md mt-10 bg-pureWhite border-2 border-grayWhite flex flex-col rounded-md p-3 transition-all duration-300 ease-in-out"
		>
			{#each subMenu as { subName, link, subText, image, icon } (subName)}
				<a
					href={link}
					class="w-full hover:bg-missionnaire-50 my-1 p-2 rounded-md transition duration-500 ease-in-out"
					on:click={() => {
						showSubMenu = false;
					}}
				>
					<div class=" flex flex-row space-x-2 items-start">
						<!-- if image render if not hide -->
						<div class=" w-12 h-12 flex items-center justify-center">
							{#if image}
								<img src={image} class="w-full h-auto rounded-md mt-1" alt={subName} />
							{:else if icon}
								<div class="text-orange-500">
									<Icon src={icon} size="12" />
								</div>
							{/if}
						</div>
						<div>
							<span class=" text-hardBlack">
								{subName}
							</span>
							<p>
								{subText}
							</p>
						</div>
					</div>
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
