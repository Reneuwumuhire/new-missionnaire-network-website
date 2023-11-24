<script lang="ts">
	import ArticleParagraph from '$lib/components/+articleParagraph.svelte';
	import Quotes from '$lib/components/+quotes.svelte';
	import { BranhamsBiographyParagraphsPart1, BranhamsBiographyParagraphsPart2 } from './paragraphs';
	import ArticleImage from '$lib/components/+articleImage.svelte';
	import ArticleCornerImage from '$lib/components/+articleCornerImage.svelte';
</script>

<title> William Branham </title>
<div class=" flex flex-col">
	<header>
		<div class="flex flex-row items-center justify-center space-x-2">
			<!-- "/img/branham_page_header.jpg" use the image as the background for the next div -->
			<div class="header-branham flex flex-col items-center justify-center w-full" />
		</div>
	</header>
	<div class="relative flex flex-row justify-center h-auto w-full py-14">
		<div class="relative flex flex-col items-start w-full max-w-3xl space-y-6 px-5">
			<h1 class=" text-4xl font-black text-[#414141]">William Marrion Branham</h1>
			<Quotes
				quote={`"Or le Seigneur, l'Eternel, ne faira rien qu'll ne révèle Son secret à Ses serviteurs les prophètes" (Amos 3:7)`}
			/>
			{#each BranhamsBiographyParagraphsPart1 as paragraph, index}
				<ArticleParagraph text={paragraph.text} />
			{/each}
			<ArticleImage image="/img/cloud.jpg" alt="William Branham" />
			{#each BranhamsBiographyParagraphsPart2 as paragraph, index}
				<ArticleParagraph text={paragraph.text} />
			{/each}
			<div class="hidden lg:block absolute -right-[400px]">
				<ArticleCornerImage image="/img/william_marrion_second_img.jpg" />
			</div>
		</div>
	</div>
</div>

<style>
	.header-branham {
		background-image: url('/img/branham_page_header.jpg');
		background-color: #cccccc;
		background-repeat: no-repeat;
		background-size: cover;
		background-position: center;
		/* background-attachment: fixed; */
		height: 500px;
	}
</style>
