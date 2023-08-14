<script type="ts">
</script>

<nav
	class="w-[100vw] flex flex-row justify-between xsm:px-[40px] lg:px-[100px] py-3 items-center h-[100px] bg-zinc-600 shadow"
>
	<img src="/icons/logo.png" class="w-[140px] h-fit" alt="logo" />
	<div class="xsm:flex xsm:flex-col xsm:hidden xsm:items-start xsm:gap-10 xsm:pt-20 lg:pt-0 lg:items-center  lg:flex-row xsm:bg-pureWhite xsm:absolute lg:relative xsm:w-[100%] xsm:left-0 xsm:px-9 lg:py-0 xsm:top-0 z-10 xsm:h-[100vh] lg:w-auto lg:h-auto lg:flex items-center lg:gap-6">
        <div class="xsm:grid lg:flex gap-12">
            <a class="text-accentGray font-medium spacing" href="/">Home</a>
            <a class="text-accentGray font-medium spacing" href="/">Predications</a>
            <a class="text-accentGray font-medium spacing" href="/">About us</a>
        </div>
        <button class="flex gap-2 p-2 px-4 rounded-full border-veryWeakGray border-2 items-center">
            <img class="w-[30px] h-fit" src="/icons/english-flag.png" alt="english flag" />
            <span class="text-[20px] text-grayWeak">EN</span>
            <img class="w-[20px] h-fit" src="/icons/arrow-down.png" alt="english flag" />
        </button>
       
        <button class="bg-pureWhite gap-2 p-2 rounded-full border-veryWeakGray border-2 items-center">
            <img class="w-[30px] h-fit" src="/icons/moon.png" alt="english flag" />
        </button> 
        <div class="w-[2px] opacity-7 xsm:hidden lg:block h-[40px] bg-veryWeakGray"></div>
		<div class="flex space-x-7">
			<img src="/icons/YouTube.png" class="w-[30px] h-fit" alt="YouTube" />
			<img src="/icons/WhatsApp.png" class="w-[30px] h-fit" alt="WhatsApp" />
			<img src="/icons/Facebook.png" class="w-[30px] h-fit" alt="Facebook" />
		</div>
	</div>
</nav>

<slot />
