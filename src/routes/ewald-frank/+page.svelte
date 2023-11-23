<script lang="ts">
	import ArticleParagraph from '$lib/components/+articleParagraph.svelte';
	import Quotes from '$lib/components/+quotes.svelte';
	import { EwaldFrankParagraph1, EwaldFrankParagraph2, EwaldFrankParagraph3 } from './paragraphs';
	import ArticleImage from '$lib/components/+articleImage.svelte';
	import ArticleCornerImage from '$lib/components/+articleCornerImage.svelte';
</script>

<title> Ewald Frank</title>
<div class=" flex flex-col">
	<header>
		<div class="flex flex-row items-center justify-center space-x-2">
			<div class="header-branham flex flex-col items-center justify-center w-full" />
		</div>
	</header>
	<div class="relative flex flex-row justify-center h-auto w-full py-14">
		<div class="relative flex flex-col items-start w-full max-w-3xl space-y-6 px-5">
			<h1 class=" text-4xl font-black text-[#414141]">Ewald Frank</h1>
			<Quotes
				quote={`"Or le Seigneur, l'Eternel, ne faira rien qu'll ne révèle Son secret à Ses serviteurs les prophètes" (Amos 3:7)`}
			/>
			{#each EwaldFrankParagraph1 as paragraph, index}
				<ArticleParagraph text={paragraph.text} />
			{/each}
			<Quotes
				quote={`«Le Seigneur est mon aide, et je n’aurai pas peur de ce que l’homme pourrait me faire» (Héb. 13 : 6).`}
			/>
			{#each EwaldFrankParagraph2 as paragraph, index}
				<ArticleParagraph text={paragraph.text} />
			{/each}
			<Quotes
				quote={`"Que celui qui a des oreilles écoute ce que l'Esprit dit aux assemblées!" Apoc 3:22`}
			/>
			{#each EwaldFrankParagraph3 as paragraph, index}
				<ArticleParagraph text={paragraph.text} />
			{/each}
			<div class="hidden lg:block absolute -right-[400px]">
				<ArticleCornerImage image="/img/ewald_frank_second_img.jpg" />
			</div>
		</div>
	</div>
</div>

<style>
	.header-branham {
		background-image: url('/img/ewald_frank_page_header.jpg');
		background-color: #cccccc;
		background-repeat: no-repeat;
		background-size: cover;
		background-position: center;
		/* background-attachment: fixed; */
		height: 500px;
	}
</style>
