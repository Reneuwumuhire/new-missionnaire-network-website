<script lang="ts">
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import FaBrandsYoutube from 'svelte-icons-pack/fa/FaBrandsYoutube';
	import FaBrandsFacebook from 'svelte-icons-pack/fa/FaBrandsFacebook';
	import RiLogoWhatsappFill from 'svelte-icons-pack/ri/RiLogoWhatsappFill';
	import ArticleParagraph from '$lib/components/+articleParagraph.svelte';
	import { EgliseParagraph1 } from './paragraphs';
	import ContactCard from '$lib/components/+contactCard.svelte';
	import MapComponent from '$lib/components/+mapComponent.svelte';
</script>

<title>Missionnaire Network | A propos de nous</title>
<div class=" flex flex-col">
	<header>
		<div class="flex flex-row items-center justify-center space-x-2">
			<div class="header-branham flex flex-col items-center justify-center w-full" />
		</div>
	</header>
	<div class="relative flex flex-row justify-center h-auto w-full py-14">
		<div class="relative flex flex-col items-start w-full max-w-3xl space-y-6 px-5">
			<div>
				<small class=" text-missionnaire uppercase leading-6 tracking-widest text-xl font-bold"
					>Eglise</small
				>
				<h1 class=" text-4xl font-black text-[#414141]">Qui nous sommes</h1>
			</div>
			{#each EgliseParagraph1 as paragraph, index}
				<ArticleParagraph text={paragraph.text} />
			{/each}
			<h1 class=" text-4xl font-black text-[#414141]">Location</h1>
			<MapComponent />
			<h1 class=" text-4xl font-black text-[#414141]">Contacter</h1>
			<ContactCard />
			<h1 class=" text-4xl font-black text-[#414141]">Social media links</h1>
			<!-- +250 788 567 415
						https://www.facebook.com/missionnaire.net
						https://www.youtube.com/@MissionnaireNetwork -->
			<div class="flex flex-col items-start space-y-5">
				<!-- add link to icons -->
				<a
					class="flex flex-row space-x-4"
					href="https://www.youtube.com/@MissionnaireNetwork"
					target="_blank"
				>
					<Icon className="w-8 h-8" src={FaBrandsYoutube} />
					<span class="">https://www.youtube.com/@MissionnaireNetwork</span>
				</a>
				<a
					class="flex flex-row space-x-4"
					href="https://www.facebook.com/missionnaire.net"
					target="_blank"
				>
					<Icon className="w-8 h-8" src={FaBrandsFacebook} />
					<span>https://www.facebook.com/missionnaire.net</span>
				</a>
				<a class="flex flex-row space-x-4" href="https://wa.me/+250728727726" target="_blank">
					<!-- when hover add a slight grey -->
					<Icon className="w-8 h-8" src={RiLogoWhatsappFill} />
					<span>+250 788 567 415</span>
				</a>
			</div>
		</div>
	</div>
</div>

<style>
	.header-branham {
		background-image: url('/img/eglise_header.jpg');
		background-color: #cccccc;
		background-repeat: no-repeat;
		background-size: cover;
		background-position: center;
		/* background-attachment: fixed; */
		height: 500px;
	}
</style>
