<script type="ts">
	import '../app.css';
	import Menu from 'iconsax-svelte/Menu.svelte';
</script>

<nav
	class="max-w-full flex flex-row justify-between xsm:px-[20px] lg:px-[100px] py-3 items-center h-20 bg-zinc-600 shadow mb-12"
>
	<div class=" w-full flex flex-row justify-between items-center max-w-[1200px] mx-auto text-xs">
		<img src="/icons/logo.png" class="w-auto h-10" alt="logo" />
		<div class=" hidden md:flex flex-row justify-between items-center space-x-4 text-sm">
			<div class=" flex flex-row items-center space-x-8">
				<a class="text-accentGray" href="/">Home</a>
				<a class="text-accentGray" href="/">Predications</a>
				<a class="text-accentGray" href="/">About us</a>
			</div>
			<button class="flex rounded-full border-veryWeakGray border items-center px-4 py-4 space-x-2">
				<img class=" w-5 h-auto" src="/icons/english-flag.png" alt="english flag" />
				<span class="text-sm text-grayWeak">EN</span>
				<img class="w-[20px] h-fit" src="/icons/arrow-down.png" alt="english flag" />
			</button>

			<button class="bg-pureWhite gap-2 p-2 rounded-full border-veryWeakGray border-2 items-center">
				<img class="w-[30px] h-fit" src="/icons/moon.png" alt="english flag" />
			</button>
			<div class="w-[1px] opacity-7 xsm:hidden lg:block h-[40px] bg-veryWeakGray" />
			<div class="hidden md:flex flex-row items-center space-x-8">
				<img src="/icons/YouTube.png" class="w-[30px] h-fit" alt="YouTube" />
				<img src="/icons/WhatsApp.png" class="w-[30px] h-fit" alt="WhatsApp" />
				<img src="/icons/Facebook.png" class="w-[30px] h-fit" alt="Facebook" />
			</div>
		</div>
		<div class="block md:hidden">
			<Menu size={24} color="#fb923c" variant="Linear" />
		</div>
	</div>
</nav>

<slot />
