<script lang="ts">
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import FaBrandsYoutube from 'svelte-icons-pack/fa/FaBrandsYoutube';
	import FaBrandsFacebook from 'svelte-icons-pack/fa/FaBrandsFacebook';
	import RiLogoWhatsappFill from 'svelte-icons-pack/ri/RiLogoWhatsappFill';
	export let isLiveStream: boolean = false;
	export let liveUrl: string | undefined = undefined;
</script>

<div
	class="relative flex items-center justify-center h-9 text-[11px] font-body tracking-wide transition-colors duration-300 {isLiveStream
		? 'bg-red-700'
		: 'bg-stone-900'}"
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
		class="relative z-10 flex items-center justify-between w-full max-w-[1600px] px-4 md:px-6 pointer-events-none"
	>
		<div class="flex items-center">
			{#if isLiveStream}
				<div class="flex items-center gap-2.5 pointer-events-auto">
					<span class="relative flex h-2 w-2">
						<span
							class="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"
						></span>
						<span class="relative inline-flex h-2 w-2 rounded-full bg-red-300"></span>
					</span>
					<span class="font-semibold uppercase tracking-[0.2em] text-white">
						Live en cours
					</span>
				</div>
			{:else}
				<span class="text-stone-400 uppercase tracking-[0.2em] hidden sm:block">
					Missionnaire Network
				</span>
			{/if}
		</div>
		<div class="pointer-events-auto">
			<div class="flex items-center gap-1">
				<a
					href="https://www.youtube.com/channel/UCS3zqpqnCvT0SFa_jI662Kg"
					target="_blank"
					rel="noopener noreferrer"
					aria-label="YouTube"
					class="text-stone-400 hover:text-white transition-colors duration-200 p-2 flex items-center justify-center"
				>
					<Icon
						color={isLiveStream ? 'white' : 'currentColor'}
						className="w-3.5 h-3.5"
						src={FaBrandsYoutube}
					/>
				</a>
				<a
					href="https://www.facebook.com/missionnaire.net"
					target="_blank"
					rel="noopener noreferrer"
					aria-label="Facebook"
					class="text-stone-400 hover:text-white transition-colors duration-200 p-2 flex items-center justify-center"
				>
					<Icon
						color={isLiveStream ? 'white' : 'currentColor'}
						className="w-3.5 h-3.5"
						src={FaBrandsFacebook}
					/>
				</a>
				<a
					href="https://wa.me/250788567415"
					target="_blank"
					rel="noopener noreferrer"
					aria-label="WhatsApp"
					class="text-stone-400 hover:text-white transition-colors duration-200 p-2 flex items-center justify-center"
				>
					<Icon
						color={isLiveStream ? 'white' : 'currentColor'}
						className="w-3.5 h-3.5"
						src={RiLogoWhatsappFill}
					/>
				</a>
			</div>
		</div>
	</div>
</div>

