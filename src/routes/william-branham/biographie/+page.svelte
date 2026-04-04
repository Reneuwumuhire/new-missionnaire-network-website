<script lang="ts">
	import ArticleParagraph from '$lib/components/+articleParagraph.svelte';
	import Quotes from '$lib/components/+quotes.svelte';
	import { BranhamsBiographyParagraphsPart1, BranhamsBiographyParagraphsPart2 } from './paragraphs';
	import ArticleImage from '$lib/components/+articleImage.svelte';
	import ArticleCornerImage from '$lib/components/+articleCornerImage.svelte';
</script>

<svelte:head>
	<title>William Branham - Missionnaire Network</title>
	<meta
		name="description"
		content="Biographie de William Marrion Branham, ministère, citations et ressources du Message."
	/>
	<meta property="og:title" content="William Branham - Missionnaire Network" />
	<meta
		property="og:description"
		content="Découvrez la biographie de William Branham et son impact dans le Message de l'Heure."
	/>
</svelte:head>
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

			<!-- Resource Links -->
			<div class="w-full border-t border-gray-200 pt-8 mt-4">
				<p class="text-[11px] font-black uppercase tracking-[0.2em] text-orange-600 mb-4">
					Ressources de William Branham
				</p>
				<div class="flex flex-wrap gap-3">
					<a
						href="/predications?author=William Marrion Branham"
						class="px-4 py-2 rounded-full bg-orange-500 text-white text-xs font-black uppercase tracking-wider hover:bg-orange-600 transition-colors"
					>
						Prédications
					</a>
					<a
						href="/videos?filter=William Branham"
						class="px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-700 text-xs font-black uppercase tracking-wider hover:border-orange-300 hover:text-orange-600 transition-colors"
					>
						Vidéos
					</a>
					<a
						href="/literature?author=William Marrion Branham&category=book"
						class="px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-700 text-xs font-black uppercase tracking-wider hover:border-orange-300 hover:text-orange-600 transition-colors"
					>
						Littérature
					</a>
				</div>
			</div>

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
