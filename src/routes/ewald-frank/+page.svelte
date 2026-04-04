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
<div class="flex flex-col">
	<header class="relative h-[40vh] min-h-[300px] max-h-[500px] overflow-hidden">
		<img src="/img/ewald_frank_page_header.jpg" alt="Ewald Frank" class="absolute inset-0 w-full h-full object-cover img-zoom" />
		<div class="absolute inset-0 bg-gradient-to-t from-stone-900/60 via-transparent to-transparent"></div>
		<div class="absolute bottom-0 left-0 right-0 p-8 md:p-12">
			<div class="max-w-3xl mx-auto">
				<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-3 font-body" style="color: rgba(255,255,255,0.7);">Missionnaire international</p>
				<h1 class="font-display text-3xl md:text-5xl text-white leading-tight">Ewald Frank</h1>
			</div>
		</div>
	</header>
	<div class="relative flex flex-row justify-center h-auto w-full pt-16 pb-12">
		<div class="relative flex flex-col items-start w-full max-w-3xl space-y-8 px-6">
			<Quotes
				quote={`"Or le Seigneur, l'Eternel, ne faira rien qu'll ne révèle Son secret à Ses serviteurs les prophètes" (Amos 3:7)`}
			/>
			{#each EwaldFrankParagraph1 as paragraph, index}
				<ArticleParagraph text={paragraph.text} />
			{/each}
			<Quotes
				quote={`«Le Seigneur est mon aide, et je n'aurai pas peur de ce que l'homme pourrait me faire» (Héb. 13 : 6).`}
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
			<div class="w-full border-t border-stone-200/60 pt-8 mt-4">
				<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-4 font-body">
					Ressources d'Ewald Frank
				</p>
				<div class="flex flex-wrap gap-3">
					<a
						href="/predications?author=Ewald Frank"
						class="card-lift px-4 py-2 border border-stone-200/60 bg-white/40 text-stone-900 text-xs font-semibold uppercase tracking-wider hover:border-missionnaire hover:text-missionnaire transition-colors"
					>
						Prédications
					</a>
					<a
						href="/videos?filter=Ewald Frank"
						class="card-lift px-4 py-2 border border-stone-200/60 bg-white/40 text-stone-700 text-xs font-semibold uppercase tracking-wider hover:border-missionnaire hover:text-missionnaire transition-colors"
					>
						Vidéos
					</a>
					<a
						href="/literature?author=Ewald Frank&category=book"
						class="card-lift px-4 py-2 border border-stone-200/60 bg-white/40 text-stone-700 text-xs font-semibold uppercase tracking-wider hover:border-missionnaire hover:text-missionnaire transition-colors"
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
