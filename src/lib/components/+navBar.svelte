<script lang="ts">
	import { page } from '$app/stores';
	import HeaderMenuLink from '$lib/components/+headerMenuLink.svelte';
	import { locale, setLocale, t, type Locale } from '../../i18n';
	import { NavigationLinkList } from '../../helpers/NavigationLinkList';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import HiSolidMenuAlt3 from 'svelte-icons-pack/hi/HiSolidMenuAlt3';
	import IoCloseSharp from 'svelte-icons-pack/io/IoCloseSharp';
	import HeaderMenuLinkMobo from './+headerMenuLinkMobo.svelte';
	import { browser } from '$app/environment';
	import { afterNavigate } from '$app/navigation';
	import { onMount } from 'svelte';
	import { focusTrap } from '$lib/actions/focusTrap';

	let openMenuIndex: number | null = $state(null);

	const switchLanguage = (next: Locale) => {
		if (next !== $locale) setLocale(next);
	};
	let showMoboNav = $state(false);
	let navEl: HTMLElement | undefined = $state();
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
	};

	// Body scroll-lock, driven reactively from `showMoboNav` (see the
	// `$:` below). Centralising it here means EVERY way the menu can
	// close restores the body — the X button, a menu link, an outside
	// click, a route change, the desktop breakpoint. Previously each
	// handler locked/unlocked inline and the outside-click path forgot
	// to, leaving the body stuck at `position:fixed` — which froze page
	// scrolling and surfaced a stray horizontal scrollbar.
	function syncBodyScrollLock(locked: boolean) {
		const body = document.body;
		if (locked) {
			body.classList.add('overflow-hidden', 'overscroll-none');
			body.style.overflow = 'hidden';
			body.style.height = '100vh';
			body.style.position = 'fixed';
			body.style.width = '100%';
		} else {
			body.classList.remove('overflow-hidden', 'overscroll-none');
			// Clear the inline styles rather than forcing values: forcing
			// `overflow:auto` gives the body its own scroll container and a
			// stray horizontal scrollbar; an empty string reverts each
			// property to the stylesheet default.
			body.style.overflow = '';
			body.style.height = '';
			body.style.position = '';
			body.style.width = '';
		}
	}

	$effect(() => {
		if (browser) syncBodyScrollLock(showMoboNav);
	});

	// Any route change closes the menu (and so unlocks the body via the
	// reactive statement above).
	afterNavigate(() => {
		showMoboNav = false;
		openMenuIndex = null;
	});

	const toggleMenu = (index: number) => {
		ignoreNextClick = true;
		if (openMenuIndex === index) {
			openMenuIndex = null;
		} else {
			openMenuIndex = index;
		}
	};

	onMount(() => {
		const mediaQuery = window.matchMedia('(min-width: 1024px)');
		const handleMediaChange = (e: MediaQueryListEvent | MediaQueryList) => {
			// Crossing into desktop closes the mobile menu; the reactive
			// `syncBodyScrollLock` then restores the body.
			if (e.matches && showMoboNav) {
				showMoboNav = false;
				openMenuIndex = null;
			}
		};
		handleMediaChange(mediaQuery);
		mediaQuery.addEventListener('change', handleMediaChange);

		// The bottom navigation bar's "more" button opens this same menu —
		// it dispatches a window event rather than reaching into NavBar's
		// internals, so the toggle (and its body-scroll lock) stays in one
		// place.
		const handleExternalToggle = () => toggleMobileNav();
		window.addEventListener('missionnaire:toggle-mobile-nav', handleExternalToggle);

		return () => {
			mediaQuery.removeEventListener('change', handleMediaChange);
			window.removeEventListener('missionnaire:toggle-mobile-nav', handleExternalToggle);
		};
	});
</script>

<svelte:window onclick={handleWindowClick} />

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
						ontoggle={() => toggleMenu(index)}
						onclose={() => (openMenuIndex = null)}
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

			<!-- Language toggle -->
			<div
				class="ml-3 flex items-center border border-stone-200/60 rounded-full p-0.5"
				role="group"
				aria-label={$t('lang.label')}
			>
				<button
					type="button"
					class="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-full font-body transition-colors {$locale ===
					'fr'
						? 'bg-stone-900 text-white'
						: 'text-stone-400 hover:text-stone-700'}"
					aria-pressed={$locale === 'fr'}
					onclick={() => switchLanguage('fr')}
				>
					FR
				</button>
				<button
					type="button"
					class="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-full font-body transition-colors {$locale ===
					'en'
						? 'bg-stone-900 text-white'
						: 'text-stone-400 hover:text-stone-700'}"
					aria-pressed={$locale === 'en'}
					onclick={() => switchLanguage('en')}
				>
					EN
				</button>
			</div>
		</div>

		<!-- Mobile hamburger -->
		<button
			class="relative lg:hidden flex items-center justify-center w-9 h-9 text-stone-700 transition-colors hover:text-missionnaire"
			onclick={(e) => {
				e.stopPropagation();
				toggleMobileNav();
			}}
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
		<div
			class="mobo-menu absolute left-0 right-0 top-full z-50 bg-[#FAF8F3] overflow-y-auto border-t border-stone-100 h-screen"
			use:focusTrap={{
				onEscape: () => {
					showMoboNav = false;
					openMenuIndex = null;
				}
			}}
		>
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
							ontoggle={() => toggleMenu(index)}
							closeMenuFrom={toggleMobileNav}
						/>
					{/each}
				</div>

				<!-- Language toggle -->
				<div class="mt-8 pt-6 border-t border-stone-100">
					<p class="text-[10px] uppercase tracking-[0.3em] text-stone-400 font-body mb-3">
						{$t('lang.label')}
					</p>
					<div class="flex items-center gap-2" role="group" aria-label={$t('lang.label')}>
						<button
							type="button"
							class="px-4 py-2.5 min-h-11 text-[12px] font-bold uppercase tracking-wider font-body border transition-colors {$locale ===
							'fr'
								? 'bg-stone-900 text-white border-stone-900'
								: 'text-stone-500 border-stone-200/60 hover:border-stone-400'}"
							aria-pressed={$locale === 'fr'}
							onclick={() => switchLanguage('fr')}
						>
							{$t('lang.french')}
						</button>
						<button
							type="button"
							class="px-4 py-2.5 min-h-11 text-[12px] font-bold uppercase tracking-wider font-body border transition-colors {$locale ===
							'en'
								? 'bg-stone-900 text-white border-stone-900'
								: 'text-stone-500 border-stone-200/60 hover:border-stone-400'}"
							aria-pressed={$locale === 'en'}
							onclick={() => switchLanguage('en')}
						>
							{$t('lang.english')}
						</button>
					</div>
					<a
						href="/predications?language=english"
						class="mt-3 inline-block text-[12px] text-stone-500 hover:text-missionnaire font-body underline underline-offset-2 transition-colors"
					>
						{$t('nav.englishSermons')} →
					</a>
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
