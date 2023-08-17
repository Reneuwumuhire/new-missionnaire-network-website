<script type="ts">
	import '../app.css';
	import { dict, locale, t } from '../i18n';
	import fr from '../translations/fr';
	import en from '../translations/en';

	const languages = { en, fr };
    let currentLang = "en";
	dict.set(languages);
	let showDropContents = false;
	const langSwitch = () => {
		showDropContents = !showDropContents;
	};
    let showMoboNav = false;
</script>

<nav
	class="w-[100vw] flex flex-row justify-between xsm:px-[20px] lg:px-[100px] py-3 items-center h-[100px] bg-zinc-600 shadow"
>
	<img src="/icons/logo.png" class="w-[140px] h-fit" alt="logo" />
    <button on:click={()=>showMoboNav = !showMoboNav} data-collapse-toggle="navbar-dropdown" type="button" class="inline-flex absolute md:relative right-4 z-50 items-center p-2 w-10 h-10 justify-center text-sm text-gray-500 rounded-lg mdx:hidden hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 " aria-controls="navbar-dropdown" aria-expanded="false">
        <span class="sr-only">Open main menu</span>
        <svg class="w-5 h-5" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 17 14">
            <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M1 1h15M1 7h15M1 13h15" />
        </svg>
    </button>
	<div
		class={`xsm:flex-col ${!showMoboNav ? "hidden" : ""} xsm:items-start xsm:gap-10 xsm:pt-20 lg:pt-0 lg:items-center lg:flex-row xsm:bg-pureWhite xsm:absolute lg:relative xsm:w-[100%] xsm:left-0 xsm:px-9 lg:py-0 xsm:top-0 z-10 xsm:h-[100vh] lg:w-auto lg:h-auto lg:flex items-center lg:gap-6`}
	>
		<div class="xsm:grid lg:flex gap-7 mdx:gap-12">
			<a class="text-accentGray font-medium spacing" href="/">Home</a>
			<a class="text-accentGray font-medium spacing" href="/">Predications</a>
			<a class="text-accentGray font-medium spacing" href="/">About us</a>
		</div>
		<div class="relative mt-6 mdx:mt-0">
			<button
				on:click={langSwitch}
				class="flex gap-2 p-2 px-4 rounded-full border-veryWeakGray border-2 items-center"
			>
				<img class="w-[30px] h-fit" src="/icons/english-flag.png" alt="english flag" />
				<span class="text-[20px] text-grayWeak">{currentLang.toUpperCase()}</span>
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
                                    currentLang = lang
								}}
								class="block px-4 py-2 hover:bg-gray-100 text-textPrimary tracking-wide"
								>{lang.toUpperCase()}</button
							>
						</li>
					{/each}
				</ul>
			</div>
		</div>

		<button class="bg-pureWhite  mt-6 mdx:mt-0 gap-2 p-2 rounded-full border-veryWeakGray border-2 items-center">
			<img class="w-[30px] h-fit" src="/icons/moon.png" alt="english flag" />
		</button>
		<div class="w-[2px] opacity-7 xsm:hidden lg:block h-[40px] bg-veryWeakGray" />
		<div class="flex space-x-7  mt-6 mdx:mt-0">
			<img src="/icons/YouTube.png" class="w-[30px] h-fit" alt="YouTube" />
			<img src="/icons/WhatsApp.png" class="w-[30px] h-fit" alt="WhatsApp" />
			<img src="/icons/Facebook.png" class="w-[30px] h-fit" alt="Facebook" />
		</div>
	</div>
</nav>

<slot />
