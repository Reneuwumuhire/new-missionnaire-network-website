<script lang="ts">
	import ArticleParagraph from '$lib/components/+articleParagraph.svelte';
	import Quotes from '$lib/components/+quotes.svelte';
	import { EgliseParagraph1, EgliseParagraph2 } from './paragraphs';
	import ArticleImage from '$lib/components/+articleImage.svelte';
	import ArticleCornerImage from '$lib/components/+articleCornerImage.svelte';
</script>

<title> Missionnaire Network</title>
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
				<h1 class=" text-2xl md:text-4xl font-black text-[#414141]">
					Assemble de Kigali/Gatenga/Murambi
				</h1>
			</div>
			{#each EgliseParagraph1 as paragraph, index}
				<ArticleParagraph text={paragraph.text} />
			{/each}
			<ArticleImage image="/img/eglise_inside.jpg" alt="Eglise Murambi- Missionnaire Nerwork" />
			{#each EgliseParagraph2 as paragraph, index}
				<ArticleParagraph text={paragraph.text} />
			{/each}
			<div class="hidden lg:block absolute -right-[400px]">
				<ArticleCornerImage image="/img/chauffeur.jpg" />
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
