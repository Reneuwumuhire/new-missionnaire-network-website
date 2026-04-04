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
	<header class="relative h-[40vh] min-h-[300px] max-h-[500px] overflow-hidden">
		<img src="/img/branham_page_header.jpg" alt="William Marrion Branham" class="absolute inset-0 w-full h-full object-cover" />
		<div class="absolute inset-0 bg-gradient-to-t from-stone-900/70 via-stone-900/30 to-transparent"></div>
		<div class="absolute bottom-0 left-0 right-0 p-8 md:p-12">
			<div class="max-w-3xl mx-auto">
				<h1 class="font-display text-3xl md:text-5xl text-white leading-tight">William Marrion Branham</h1>
			</div>
		</div>
	</header>
	<div class="relative flex flex-row justify-center h-auto w-full py-16">
		<div class="relative flex flex-col items-start w-full max-w-3xl space-y-8 px-6">
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
			<div class="w-full border-t border-stone-200 pt-8 mt-4">
				<p class="text-[10px] font-semibold uppercase tracking-[0.25em] text-missionnaire mb-4 font-body">
					Ressources de William Branham
				</p>
				<div class="flex flex-wrap gap-3">
					<a
						href="/predications?author=William Marrion Branham"
						class="px-4 py-2 bg-stone-900 text-white text-xs font-semibold uppercase tracking-wider hover:bg-missionnaire transition-colors"
					>
						Prédications
					</a>
					<a
						href="/videos?filter=William Branham"
						class="px-4 py-2 border border-stone-200 text-stone-700 text-xs font-semibold uppercase tracking-wider hover:border-missionnaire hover:text-missionnaire transition-colors"
					>
						Vidéos
					</a>
					<a
						href="/literature?author=William Marrion Branham&category=book"
						class="px-4 py-2 border border-stone-200 text-stone-700 text-xs font-semibold uppercase tracking-wider hover:border-missionnaire hover:text-missionnaire transition-colors"
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
