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
	import { goto } from '$app/navigation';

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

	const closeMenu = (event: MouseEvent) => {
		if (showMoboNav && !(event.target as Element).closest('nav')) {
			showMoboNav = false;
			openMenuIndex = null;
		}
	};

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

	const toggleMenu = (index: number) => {
		if (openMenuIndex === index) {
			openMenuIndex = null;
		} else {
			openMenuIndex = index;
		}
	};

	let isHovered = false;
	let isFocused = false;

	const searchablePages = [
		'/videos',
		'/predications',
		'/musique',
		'/literature',
		'/transcriptions'
	];
	$: showSearch = searchablePages.some((p) => $page.url.pathname.startsWith(p));

	$: shouldExpand = isHovered || isFocused || $searchTerm.trim().length > 0;
	$: showClearButton = $searchTerm.trim().length > 0;
	$: showPlaceholder = shouldExpand;

	function handleSubmit() {
		if ($searchTerm.trim()) {
			goto(`/videos?search=${encodeURIComponent($searchTerm.trim())}`);
		}
		if (showMoboNav) {
			toggleMobileNav();
		}
	}

	function handleSearchInput() {
		// Search is handled on submit
	}

	function clearInput() {
		searchTerm.set('');
		if (showMoboNav) {
			toggleMobileNav();
		}
	}

	import { onMount } from 'svelte';
	onMount(() => {
		const mediaQuery = window.matchMedia('(min-width: 1024px)');
		const handleMediaChange = (e: MediaQueryListEvent | MediaQueryList) => {
			if (e.matches && showMoboNav) {
				showMoboNav = false;
				document.body.classList.remove('overflow-hidden', 'overscroll-none');
				document.body.style.overflow = 'auto';
				document.body.style.height = 'auto';
				document.body.style.position = 'relative';
				document.body.style.width = 'auto';
				openMenuIndex = null;
			}
		};
		handleMediaChange(mediaQuery);
		mediaQuery.addEventListener('change', handleMediaChange);
		return () => mediaQuery.removeEventListener('change', handleMediaChange);
	});
</script>

<nav class="navbar relative z-50 max-w-full border-b border-stone-200/60 backdrop-blur-md bg-white/90">
	<div class="flex items-center justify-between max-w-[1600px] mx-auto px-4 md:px-6 h-14">
		<!-- Logo -->
		<a href="/" class="flex items-center shrink-0">
			<picture>
				<source srcset="/icons/logo.webp" type="image/webp" />
				<img src="/icons/logo.png" class="w-auto h-7" alt="logo" width="75" height="32" fetchpriority="high" />
			</picture>
		</a>

		<!-- Desktop nav -->
		<div class="hidden lg:flex items-center gap-1">
			{#if showSearch}
				<!-- svelte-ignore a11y-no-static-element-interactions -->
				<div
					class="relative mr-2"
					on:mouseenter={() => (isHovered = true)}
					on:mouseleave={() => (isHovered = false)}
				>
					<form on:submit|preventDefault={handleSubmit}>
						<div
							class="flex items-center h-9 border border-stone-200 bg-stone-50/50 transition-all duration-300 ease-out"
							class:w-9={!shouldExpand}
							class:w-60={shouldExpand}
							class:bg-white={shouldExpand}
							class:border-stone-300={shouldExpand}
						>
							<div class="flex items-center justify-center w-9 shrink-0">
								<SearchNormal1 size={14} color="#a8a29e" variant="Linear" />
							</div>
							{#if shouldExpand}
								<input
									type="text"
									placeholder="Rechercher..."
									aria-label="Rechercher"
									bind:value={$searchTerm}
									class="w-full pr-3 py-1.5 text-sm text-stone-700 bg-transparent outline-none font-body placeholder:text-stone-400"
									on:focus={() => (isFocused = true)}
									on:blur={() => (isFocused = false)}
									on:input={handleSearchInput}
								/>
								{#if showClearButton}
									<button
										type="button"
										class="flex items-center justify-center w-7 h-7 shrink-0 mr-1"
										on:click={clearInput}
										aria-label="Effacer la recherche"
									>
										<CloseCircle size={16} color="#a8a29e" variant="Linear" />
									</button>
								{/if}
							{/if}
						</div>
					</form>
				</div>
			{/if}

			<div class="flex items-center gap-0.5">
				{#each NavigationLinkList as link, index}
					<HeaderMenuLink
						menuName={link.menuName}
						link={link.link}
						isOpen={openMenuIndex === index}
						on:toggle={() => toggleMenu(index)}
						on:close={() => (openMenuIndex = null)}
						subMenu={link.subMenu
							? link.subMenu.map((subLink) => ({
									subName: subLink.subName,
									link: subLink.link,
									subText: subLink.subText,
									image: subLink.image,
									icon: subLink.icon
								}))
							: []}
					/>
				{/each}
			</div>
		</div>

		<!-- Mobile hamburger -->
		<button
			class="relative lg:hidden flex items-center justify-center w-9 h-9 text-stone-700 transition-colors hover:text-missionnaire"
			on:click={toggleMobileNav}
			aria-label={showMoboNav ? 'Fermer le menu' : 'Ouvrir le menu'}
		>
			{#if showMoboNav}
				<Icon src={IoCloseSharp} className="w-5 h-5" />
			{:else}
				<Icon src={HiSolidMenuAlt3} className="w-5 h-5" />
			{/if}
		</button>

	</div>

	<!-- Mobile menu overlay — direct child of nav for correct absolute positioning -->
	{#if showMoboNav}
		<div class="mobo-menu absolute left-0 right-0 top-full z-50 bg-white overflow-y-auto border-t border-stone-100 h-screen">
			<div class="flex flex-col px-6 py-8 max-w-lg mx-auto pb-32">
				{#if showSearch}
					<!-- svelte-ignore a11y-no-static-element-interactions -->
					<div
						class="mb-8"
						on:mouseenter={() => (isHovered = true)}
						on:mouseleave={() => (isHovered = false)}
					>
						<form on:submit|preventDefault={handleSubmit}>
							<div
								class="flex items-center h-11 border border-stone-200 bg-stone-50"
							>
								<div class="flex items-center justify-center w-11 shrink-0">
									<SearchNormal1 size={18} color="#a8a29e" variant="Linear" />
								</div>
								<input
									type="text"
									placeholder="Rechercher..."
									aria-label="Rechercher"
									bind:value={$searchTerm}
									class="w-full pr-4 py-2 text-base text-stone-700 bg-transparent outline-none font-body placeholder:text-stone-400"
									on:focus={() => (isFocused = true)}
									on:blur={() => (isFocused = false)}
								/>
								{#if showClearButton}
									<button
										type="button"
										class="flex items-center justify-center w-9 h-9 shrink-0 mr-1"
										on:click={clearInput}
										aria-label="Effacer la recherche"
									>
										<CloseCircle size={20} color="#FF880C" variant="Linear" />
									</button>
								{/if}
							</div>
						</form>
					</div>
				{/if}

				<div class="flex flex-col gap-1">
					{#each NavigationLinkList as link, index}
						<HeaderMenuLinkMobo
							menuName={link.menuName}
							link={link.link}
							subMenu={link.subMenu
								? link.subMenu.map((subLink) => ({
										subName: subLink.subName,
										link: subLink.link,
										subText: subLink.subText,
										icon: subLink.icon
									}))
								: []}
							active={openMenuIndex === index}
							activeClass="text-missionnaire"
							inactiveClass="text-stone-400"
							on:toggle={() => toggleMenu(index)}
							closeMenuFrom={toggleMobileNav}
						/>
					{/each}
				</div>

				<!-- Mobile footer accent -->
				<div class="mt-12 pt-8 border-t border-stone-100">
					<p class="text-[10px] uppercase tracking-[0.3em] text-stone-400 font-body">
						Missionnaire Network
					</p>
				</div>
			</div>
		</div>
	{/if}
</nav>

<style>
	.mobo-menu {
		animation: mobo-slide 0.25s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes mobo-slide {
		from {
			opacity: 0;
			transform: translateY(-8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
