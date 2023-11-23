<!--  -->
<script lang="ts">
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import FaBrandsYoutube from 'svelte-icons-pack/fa/FaBrandsYoutube';
	import FaBrandsFacebook from 'svelte-icons-pack/fa/FaBrandsFacebook';
	import RiLogoWhatsappFill from 'svelte-icons-pack/ri/RiLogoWhatsappFill';
	export let isLiveStream: boolean = false;
	let isLiveStreamClass: string = 'bg-red-700 text-white ';
	let isNotLiveStreamClass: string = 'bg-white text-black';
</script>

<div
	class={`flex flex-row items-center justify-center px-5 b h-10 
${isLiveStream ? isLiveStreamClass : isNotLiveStreamClass}
`}
>
	<div class="flex flex-row items-center justify-between w-full max-w-7xl">
		<div class=" flex">
			{#if isLiveStream}
				<svg
					class="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
				>
					<circle
						class="opacity-25"
						cx="12"
						cy="12"
						r="10"
						stroke="currentColor"
						stroke-width="4"
					/>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8v4a4 4 0
    011.17 7.83L12 21.17A8 8 0 014 12z"
					/>
				</svg>

				<p class=" text-sm font-bold">Live Stream</p>
			{/if}
		</div>
		<div>
			<!-- add  youtube, facebook, whatsapp icons in white -->
			<div class="flex flex-row items-center space-x-5">
				<!-- add link to icons -->
				<a href="https://www.youtube.com/channel/UCS3zqpqnCvT0SFa_jI662Kg" target="_blank">
					<Icon color={isLiveStream ? 'white' : 'black'} className="w-4 h-" src={FaBrandsYoutube} />
				</a>
				<a href="https://www.facebook.com/missionnaire.net" target="_blank">
					<Icon
						color={isLiveStream ? 'white' : 'black'}
						className="w-4 h-4"
						src={FaBrandsFacebook}
					/>
				</a>
				<a href="https://wa.me/+250728727726" target="_blank">
					<!-- when hover add a slight grey -->
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
