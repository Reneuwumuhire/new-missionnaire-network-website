<!--  -->
<script lang="ts">
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import FaBrandsYoutube from 'svelte-icons-pack/fa/FaBrandsYoutube';
	import FaBrandsFacebook from 'svelte-icons-pack/fa/FaBrandsFacebook';
	import RiLogoWhatsappFill from 'svelte-icons-pack/ri/RiLogoWhatsappFill';
	export let isLiveStream: boolean = false;
	export let liveUrl: string | undefined = undefined;
	let isLiveStreamClass: string = 'bg-red-700 text-white ';
	let isNotLiveStreamClass: string = 'bg-white text-black';
</script>

<div
	class={`relative flex flex-row items-center justify-center px-5 h-10 transition-colors duration-300 ${
		isLiveStream ? 'bg-red-700 hover:bg-red-800' : 'bg-white'
	}`}
>
	{#if isLiveStream}
		<a
			href={liveUrl || 'https://www.youtube.com/@MissionnaireNetwork/live'}
			target="_blank"
			class="absolute inset-0 z-0"
			aria-label="Watch live stream"
		/>
	{/if}

	<div
		class="relative z-10 flex flex-row items-center justify-between w-full max-w-7xl pointer-events-none"
	>
		<div class="flex">
			{#if isLiveStream}
				<div class="flex items-center space-x-2">
					<div class="relative flex h-3 w-3">
						<span
							class="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"
						></span>
						<span class="relative inline-flex rounded-full h-3 w-3 bg-red-400"></span>
					</div>
					<span class="text-sm font-black uppercase tracking-widest text-white">
						Live en cours
					</span>
				</div>
			{/if}
		</div>
		<div class="pointer-events-auto">
			<div class="flex flex-row items-center space-x-5">
				<a
					href="https://www.youtube.com/channel/UCS3zqpqnCvT0SFa_jI662Kg"
					target="_blank"
					class="hover:opacity-70 transition-opacity"
				>
					<Icon color={isLiveStream ? 'white' : 'black'} className="w-4 h-4" src={FaBrandsYoutube} />
				</a>
				<a
					href="https://www.facebook.com/missionnaire.net"
					target="_blank"
					class="hover:opacity-70 transition-opacity"
				>
					<Icon color={isLiveStream ? 'white' : 'black'} className="w-4 h-4" src={FaBrandsFacebook} />
				</a>
				<a
					href="https://wa.me/+250728727726"
					target="_blank"
					class="hover:opacity-70 transition-opacity"
				>
					<Icon
						color={isLiveStream ? 'white' : 'black'}
						className="w-4 h-4"
						src={RiLogoWhatsappFill}
					/>
				</a>
			</div>
		</div>
	</div>
</div>
