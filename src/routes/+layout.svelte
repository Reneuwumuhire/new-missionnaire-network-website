<script type="ts">
	import '../app.css';
	import { dict, locale, t } from '../i18n';
	import fr from '../translations/fr';
	import en from '../translations/en';

	const languages = { en, fr };
	let currentLang = 'en';
	dict.set(languages);
	let showDropContents = false;
	const langSwitch = () => {
		showDropContents = !showDropContents;
	};
	let showMoboNav = false;
	import Menu from 'iconsax-svelte/Menu.svelte';
</script>

<nav
	class="max-w-full flex flex-row justify-between xsm:px-[20px] lg:px-[100px] py-3 items-center h-20 bg-zinc-600 shadow mb-12"
>
	<div class=" w-full flex flex-row justify-between items-center max-w-[1200px] mx-auto text-xs">
		<img src="/icons/logo.png" class="w-auto h-10" alt="logo" />
		<div
			class={`xsm:flex-col ${
				!showMoboNav ? 'hidden' : ''
			} xsm:items-start xsm:gap-10 xsm:pt-20 lg:pt-0 lg:items-center lg:flex-row xsm:bg-pureWhite xsm:absolute lg:relative xsm:w-[100%] xsm:left-0 xsm:px-9 lg:py-0 xsm:top-0 z-10 xsm:h-[100vh] lg:w-auto lg:h-auto lg:flex items-center lg:gap-6`}
		>
			<div class="xsm:grid lg:flex gap-7 mdx:gap-12">
				<a class="text-base text-accentGray" href="/">Home</a>
				<a class="text-base text-accentGray" href="/">Predications</a>
				<a class="text-base text-accentGray" href="/">About us</a>
			</div>
			<div class="relative mt-6 mdx:mt-0">
				<button
					on:click={langSwitch}
					class="flex rounded-full border-veryWeakGray border items-center px-4 py-4 space-x-2"
				>
					<img class=" w-5 h-auto" src="/icons/english-flag.png" alt="english flag" />
					<span class="text-sm text-grayWeak">{currentLang.toUpperCase()}</span>
					<img class="w-[20px] h-fit" src="/icons/arrow-down.png" alt="english flag" />
				</button>
				<div
					id="dropdownNavbar"
					class={`z-10 md:absolute ${
						!showDropContents ? 'hidden' : ''
					} font-normal bg-white divide-y divide-gray-100 rounded-lg md:shadow w-32 `}
				>
					<ul class="py-2 text-base md:text-sm text-gray-700" aria-labelledby="dropdownLargeButton">
						{#each Object.keys(languages) as lang}
							<li>
								<button
									on:click={() => {
										locale.set(lang);
										showDropContents = false;
										currentLang = lang;
									}}
									class="block px-4 py-2 hover:bg-gray-100 text-textPrimary tracking-wide"
									>{lang.toUpperCase()}</button
								>
							</li>
						{/each}
					</ul>
				</div>
			</div>
			<button
				class="bg-pureWhite mt-6 mdx:mt-0 gap-2 p-2 rounded-full border-veryWeakGray border-2 items-center"
			>
				<img class="w-[30px] h-fit" src="/icons/moon.png" alt="change mode" />
			</button>
			<div class="w-[1px] opacity-7 hidden lg:block h-[40px] bg-veryWeakGray" />
			<div class="flex mt-6 mdx:mt-0 flex-row items-center space-x-8">
				<img src="/icons/YouTube.png" class="w-[30px] h-fit" alt="YouTube" />
				<img src="/icons/WhatsApp.png" class="w-[30px] h-fit" alt="WhatsApp" />
				<img src="/icons/Facebook.png" class="w-[30px] h-fit" alt="Facebook" />
			</div>
		</div>
		<div class="block md:hidden z-20">
			<button type="button" on:click={() => (showMoboNav = !showMoboNav)}>
				<Menu size={24} color="#fb923c" variant="Linear" />
			</button>
		</div>
	</div>
</nav>

<slot />