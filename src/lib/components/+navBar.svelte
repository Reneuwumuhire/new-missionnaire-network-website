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
	let navEl: HTMLElement;
	let ignoreNextClick = false;

	const handleWindowClick = (event: MouseEvent) => {
		if (ignoreNextClick) {
			ignoreNextClick = false;
			return;
		}
		if (openMenuIndex !== null && navEl && !navEl.contains(event.target as Node)) {
			openMenuIndex = null;
		}
		if (showMoboNav && navEl && !navEl.contains(event.target as Node)) {
			showMoboNav = false;
			openMenuIndex = null;
		}
	};

	const toggleMobileNav = () => {
		ignoreNextClick = true;
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
		ignoreNextClick = true;
		if (openMenuIndex === index) {
			openMenuIndex = null;
		} else {
			openMenuIndex = index;
		}
	};

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

<svelte:window on:click={handleWindowClick} />

<nav class="navbar relative z-50 max-w-full border-b border-stone-200/40 backdrop-blur-md bg-[#FAF8F3]/90" bind:this={navEl}>
	<div class="flex items-center justify-between max-w-[1600px] mx-auto px-4 md:px-6 h-16">
		<!-- Logo -->
		<a href="/" class="flex items-center shrink-0">
			<picture>
				<source srcset="/icons/logo.webp" type="image/webp" />
				<img src="/icons/logo.png" class="w-auto h-7" alt="logo" width="75" height="32" fetchpriority="high" />
			</picture>
		</a>

		<!-- Desktop nav -->
		<div class="hidden lg:flex items-center gap-1">
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
			on:click|stopPropagation={toggleMobileNav}
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
		<div class="mobo-menu absolute left-0 right-0 top-full z-50 bg-[#FAF8F3] overflow-y-auto border-t border-stone-100 h-screen">
			<div class="flex flex-col px-6 py-8 max-w-lg mx-auto pb-32">
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
