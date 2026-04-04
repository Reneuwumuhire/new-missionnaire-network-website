<script lang="ts">
	import ArticleParagraph from '$lib/components/+articleParagraph.svelte';
	import Quotes from '$lib/components/+quotes.svelte';
	import { EwaldFrankParagraph1, EwaldFrankParagraph2, EwaldFrankParagraph3 } from './paragraphs';
	import ArticleImage from '$lib/components/+articleImage.svelte';
	import ArticleCornerImage from '$lib/components/+articleCornerImage.svelte';
</script>

<svelte:head>
	<title>Ewald Frank - Missionnaire Network</title>
	<meta
		name="description"
		content="Biographie et enseignements d'Ewald Frank, avec citations et contenus d'édification."
	/>
	<meta property="og:title" content="Ewald Frank - Missionnaire Network" />
	<meta
		property="og:description"
		content="Parcours du ministère d'Ewald Frank et ressources du Message."
	/>
</svelte:head>
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

			<!-- Resource Links -->
			<div class="w-full border-t border-gray-200 pt-8 mt-4">
				<p class="text-[11px] font-black uppercase tracking-[0.2em] text-orange-600 mb-4">
					Ressources d'Ewald Frank
				</p>
				<div class="flex flex-wrap gap-3">
					<a
						href="/predications?author=Ewald Frank"
						class="px-4 py-2 rounded-full bg-orange-500 text-white text-xs font-black uppercase tracking-wider hover:bg-orange-600 transition-colors"
					>
						Prédications
					</a>
					<a
						href="/videos?filter=Ewald Frank"
						class="px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-700 text-xs font-black uppercase tracking-wider hover:border-orange-300 hover:text-orange-600 transition-colors"
					>
						Vidéos
					</a>
					<a
						href="/literature?author=Ewald Frank&category=book"
						class="px-4 py-2 rounded-full border border-gray-200 bg-white text-gray-700 text-xs font-black uppercase tracking-wider hover:border-orange-300 hover:text-orange-600 transition-colors"
					>
						Littérature
					</a>
				</div>
			</div>

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
