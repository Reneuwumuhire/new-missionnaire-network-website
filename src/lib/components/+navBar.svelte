<script lang="ts">
	import Menu from 'iconsax-svelte/Menu.svelte';
	import HeaderMenuLink from '$lib/components/+headerMenuLink.svelte';
	import { dict, locale, t } from '../../i18n';
	import fr from '../../translations/fr';
	import en from '../../translations/en';
	import { NavigationLinkList } from '../../helpers/NavigationLinkList';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import HiSolidMenuAlt3 from 'svelte-icons-pack/hi/HiSolidMenuAlt3';
	import IoCloseSharp from 'svelte-icons-pack/io/IoCloseSharp';
	import BsChevronDown from 'svelte-icons-pack/bs/BsChevronDown';
	import HeaderMenuLinkMobo from './+headerMenuLinkMobo.svelte';

	const languages = { en, fr };
	let currentLang = 'en';
	let preventScroll = false;
	let openMenuIndex: number | null = null;
	dict.set(languages);
	let showDropContents = false;
	const langSwitch = () => {
		showDropContents = !showDropContents;
	};
	let showMoboNav = false;
	// close the menu when clicked outside
	const closeMenu = (event: any) => {
		if (showMoboNav && !(event.target as Element).closest('nav')) {
			showMoboNav = false;
			openMenuIndex = null;
		}
	};
	// Function to toggle preventScroll when mobile navigation is shown/hidden
	const toggleMobileNav = () => {
		showMoboNav = !showMoboNav;
		if (showMoboNav) {
			document.body.classList.add('overflow-hidden', 'overscroll-none');
		} else {
			document.body.classList.remove('overflow-hidden', 'overscroll-none');
		}
	};
	// toggle the menu when clicked
	const toggleMenu = (index: number) => {
		if (openMenuIndex === index) {
			openMenuIndex = null;
			toggleMobileNav();
		} else {
			openMenuIndex = index;
			toggleMobileNav();
		}
	};
</script>

<nav class="max-w-full flex flex-row justify-between items-center h-20 px-3 md:px-6 my-4">
	<div class=" w-full flex flex-row justify-between items-center max-w-7xl mx-auto">
		<a href="/" class="flex flex-row items-center">
			<img src="/icons/logo.png" class="w-auto h-10" alt="logo" />
		</a>
		<div class=" hidden md:block">
			<div class=" flex flex-row space-x-4 justify-between">
				{#each NavigationLinkList as link, index}
					<HeaderMenuLink
						menuName={link.menuName}
						link={link.link}
						subMenu={link.subMenu
							? link.subMenu.map((subLink) => ({
									subName: subLink.subName,
									link: subLink.link,
									subText: subLink.subText,
									image: subLink.image
							  }))
							: []}
						on:click={() => toggleMenu(index)}
					/>
				{/each}
			</div>
		</div>
		<div class=" block md:hidden text-black text-4xl">
			<!-- menu -->
			<button
				class="flex flex-row items-center w-10 h-10 transition-all duration-75 ease-in-out text-missionnaire"
				on:click={toggleMobileNav}
			>
				{#if showMoboNav}
					<Icon src={IoCloseSharp} />
				{:else}
					<Icon src={HiSolidMenuAlt3} />
				{/if}
			</button>
		</div>
		<!-- mobo menu -->
		{#if showMoboNav}
			<div class="absolute z-50 top-32 left-0 w-full h-full bg-white border-t-2 py-6">
				<div class="relative flex flex-col space-y-2 w-full h-full">
					<div class="relative flex flex-col space-y-5 text-3xl px-5">
						{#each NavigationLinkList as link, index}
							<HeaderMenuLinkMobo
								menuName={link.menuName}
								link={link.link}
								subMenu={link.subMenu
									? link.subMenu.map((subLink) => ({
											subName: subLink.subName,
											link: subLink.link,
											subText: subLink.subText
									  }))
									: []}
								active={openMenuIndex === index}
								activeClass="text-missionnaire"
								inactiveClass="text-black"
								on:click={() => toggleMenu(index)}
								closeMenuFrom={toggleMobileNav}
							/>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</div>
</nav>
