<script lang="ts">
	import { page } from '$app/stores';
	import HeaderMenuLink from '$lib/components/+headerMenuLink.svelte';
	import { dict, locale, t } from '../../i18n';
	import fr from '../../translations/fr';
	import en from '../../translations/en';
	import { NavigationLinkList } from '../../helpers/NavigationLinkList';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import HiSolidMenuAlt3 from 'svelte-icons-pack/hi/HiSolidMenuAlt3';
	import IoCloseSharp from 'svelte-icons-pack/io/IoCloseSharp';
	import SearchNormal1 from 'iconsax-svelte/SearchNormal1.svelte';
	import CloseCircle from 'iconsax-svelte/CloseCircle.svelte';
	import HeaderMenuLinkMobo from './+headerMenuLinkMobo.svelte';
	import { searchTerm } from '$lib/stores/videoStore';
	import { createEventDispatcher } from 'svelte';
	import { fetchInitialVideos } from '../../utils/videoUtils';

	const languages = { en, fr };
	let currentLang = 'en';
	let preventScroll = false;
	let openMenuIndex: number | null = null;
	dict.set(languages);
	let showDropContents = false;
	const dispatch = createEventDispatcher();

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
			document.body.style.overflow = 'hidden';
			document.body.style.height = '100vh';
			document.body.style.position = 'fixed';
			document.body.style.width = '100%';
		} else {
			document.body.classList.remove('overflow-hidden', 'overscroll-none');
			document.body.style.overflow = 'auto';
			document.body.style.height = 'auto';
			document.body.style.position = 'relative';
			document.body.style.width = 'auto';
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

	let isHovered = false;
	let isFocused = false;

	$: shouldExpand = isHovered || isFocused || $searchTerm.trim().length > 0;
	$: showClearButton = $searchTerm.trim().length > 0;
	$: showPlaceholder = shouldExpand;

	function handleSubmit() {
		dispatch('search', $searchTerm);
	}

	function handleSearchInput() {
		dispatch('search', $searchTerm);
	}

	function clearInput() {
		searchTerm.set('');
		fetchInitialVideos();
		dispatch('search', '');
	}
</script>

<nav class="relative z-50 max-w-full flex flex-row justify-between items-center px-3 md:px-6 my-4">
	<div class=" w-full flex flex-row justify-between items-center max-w-[1600px] mx-auto">
		<a href="/" class="flex flex-row items-center">
			<img src="/icons/logo.png" class="w-auto h-8" alt="logo" />
		</a>
		<div class=" hidden lg:flex items-center space-x-8">
			<!-- svelte-ignore a11y-no-static-element-interactions -->
			<!-- shows the search input only when the user is on the home page -->
			{#if $page.url.pathname == '/'}
				<div
					class="relative inline-block"
					on:mouseenter={() => (isHovered = true)}
					on:mouseleave={() => (isHovered = false)}
				>
					<form on:submit|preventDefault={handleSubmit}>
						<div class="flex items-center">
							<div
								class="w-10 h-10 rounded-full border-[1px] border-[#ccc] bg-white flex flex-row items-center justify-center transition-all duration-300 ease-in-out"
								class:w-72={shouldExpand}
								class:bg-white={shouldExpand}
								class:border={shouldExpand}
							>
								<div
									class="w-6 h-6 rounded-full -mr-9 flex items-center justify-center"
									class:pl-2={shouldExpand}
								>
									<SearchNormal1 size={12} color="#ccc" variant="Linear" />
								</div>
								<input
									type="text"
									placeholder={showPlaceholder ? 'Search...' : ''}
									bind:value={$searchTerm}
									class=" indent-8 px-4 py-2 text-gray-600 bg-transparent outline-none w-full font-normal text-current"
									on:focus={() => (isFocused = true)}
									on:blur={() => (isFocused = false)}
									on:input={handleSearchInput}
								/>
								{#if showClearButton}
									<button
										type="button"
										class=" w-6 h-6 rounded-full flex items-center justify-center pr-2"
										on:click={clearInput}
									>
										<CloseCircle size={80} color="#ccc" variant="Linear" />
									</button>
								{/if}
							</div>
						</div>
					</form>
				</div>
			{/if}
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
					/>
				{/each}
			</div>
		</div>
		<div class=" relative block lg:hidden text-black text-4xl">
			<!-- menu -->
			<button
				class="flex flex-row items-center w-8 h-8 transition-all duration-75 ease-in-out text-missionnaire"
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
			<div
				class={`absolute z-50 ${
					$page.url.pathname === '/' ? 'top-[140px]' : 'top-[40px]'
				} left-0 w-full h-screen bg-white border-t-2 py-6`}
			>
				<div class="relative flex flex-col space-y-2 w-full h-full bg-white">
					<!-- svelte-ignore a11y-no-static-element-interactions -->
					<div
						class="relative inline-block self-start ml-4"
						on:mouseenter={() => (isHovered = true)}
						on:mouseleave={() => (isHovered = false)}
					>
						<form on:submit|preventDefault={handleSubmit}>
							<div class="flex items-center">
								<div
									class="w-72 h-10 rounded-full border-2 boder-[#C9C9C9] bg-gray-50 flex flex-row items-center justify-center transition-all duration-300 ease-in-out"
									class:bg-white={shouldExpand}
									class:border={shouldExpand}
									class:border-gray-300={shouldExpand}
								>
									<div
										class="w-6 h-6 rounded-full -mr-9 flex items-center justify-center"
										class:pl-2={shouldExpand}
									>
										<SearchNormal1 size={20} color="#C9C9C9" variant="Linear" />
									</div>
									<input
										type="text"
										placeholder="Search..."
										bind:value={$searchTerm}
										class=" indent-8 px-4 py-2 text-gray-600 bg-transparent outline-none w-full font-light"
										on:focus={() => (isFocused = true)}
										on:blur={() => (isFocused = false)}
									/>
									{#if showClearButton}
										<button
											type="button"
											class=" w-6 h-6 rounded-full flex items-center justify-center pr-2"
											on:click={clearInput}
										>
											<CloseCircle size={80} color="#fb923c" variant="Linear" />
										</button>
									{/if}
								</div>
							</div>
						</form>
					</div>
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
