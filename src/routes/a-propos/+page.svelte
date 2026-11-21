<script lang="ts">
	import { t } from '../../i18n';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import FaBrandsYoutube from 'svelte-icons-pack/fa/FaBrandsYoutube';
	import FaBrandsFacebook from 'svelte-icons-pack/fa/FaBrandsFacebook';
	import RiLogoWhatsappFill from 'svelte-icons-pack/ri/RiLogoWhatsappFill';
	import ArticleParagraph from '$lib/components/+articleParagraph.svelte';
	import ContactCard from '$lib/components/+contactCard.svelte';
</script>

<!-- Title/description/og:*/canonical come from `meta` in this route's
     load — the root layout renders the single canonical tag set ($lib/seo). -->
<div class="flex flex-col overflow-hidden">
	<header class="relative h-[40vh] min-h-[300px] max-h-[500px] overflow-hidden">
		<img
			src="/img/eglise_header.jpg"
			alt={$t('about.churchAlt')}
			class="absolute inset-0 w-full h-full object-cover"
		/>
		<div
			class="absolute inset-0 bg-gradient-to-t from-stone-900/70 via-stone-900/30 to-transparent"
		></div>
		<div class="absolute bottom-0 left-0 right-0 p-8 md:p-12">
			<div class="max-w-3xl mx-auto">
				<p
					class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-3 font-body"
					style="color: rgba(255,255,255,0.7);"
				>
					{$t('about.kicker')}
				</p>
				<h1 class="font-display text-3xl md:text-5xl text-white leading-tight">
					{$t('about.title')}
				</h1>
			</div>
		</div>
	</header>
	<div class="relative flex flex-row justify-center h-auto w-full pt-16 pb-12">
		<div class="relative flex flex-col items-start w-full max-w-6xl space-y-8 mx-auto px-6">
			<ArticleParagraph text={$t('about.intro')} />
			<h2 class="font-display text-2xl md:text-3xl font-semibold text-stone-900">
				{$t('about.contact')}
			</h2>
			<ContactCard />

			<h2 class="font-display text-2xl md:text-3xl font-semibold text-stone-900">
				{$t('about.social')}
			</h2>

			<div
				class="flex flex-col items-start space-y-2 md:space-y-4 text-xs md:text-base text-stone-500 font-body"
			>
				<!-- add link to icons -->
				<a
					class="flex flex-row items-center space-x-2 md:space-x-4"
					href="https://www.youtube.com/@MissionnaireNetwork"
					target="_blank"
					rel="noopener noreferrer"
				>
					<Icon className="w-8 h-8" src={FaBrandsYoutube} />
					<span class="">https://www.youtube.com/@MissionnaireNetwork</span>
				</a>
				<a
					class="flex flex-row items-center space-x-2 md:space-x-4"
					href="https://www.facebook.com/missionnaire.net"
					target="_blank"
					rel="noopener noreferrer"
				>
					<Icon className="w-8 h-8" src={FaBrandsFacebook} />
					<span>https://www.facebook.com/missionnaire.net</span>
				</a>
				<a
					class="flex flex-row items-center space-x-2 md:space-x-4"
					href="https://wa.me/250788567415"
					target="_blank"
					rel="noopener noreferrer"
				>
					<!-- when hover add a slight grey -->
					<Icon className="w-8 h-8" src={RiLogoWhatsappFill} />
					<span>+250 788 567 415</span>
				</a>
			</div>
		</div>
	</div>
</div>
