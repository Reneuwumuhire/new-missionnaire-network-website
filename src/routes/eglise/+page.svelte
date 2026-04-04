<script lang="ts">
	import ArticleParagraph from '$lib/components/+articleParagraph.svelte';
	import Quotes from '$lib/components/+quotes.svelte';
	import { EgliseParagraph1, EgliseParagraph2 } from './paragraphs';
	import ArticleImage from '$lib/components/+articleImage.svelte';
	import ArticleCornerImage from '$lib/components/+articleCornerImage.svelte';
</script>

<svelte:head>
	<title>Église Locale - Missionnaire Network</title>
	<meta
		name="description"
		content="Présentation de l'assemblée locale de Kigali/Gatenga/Murambi et de son ministère sur Missionnaire Network."
	/>
	<meta property="og:title" content="Église Locale - Missionnaire Network" />
	<meta
		property="og:description"
		content="Découvrez l'assemblée locale et son engagement pour le Message de l'Heure."
	/>
</svelte:head>
<div class="flex flex-col">
	<header class="relative h-[40vh] min-h-[300px] max-h-[500px] overflow-hidden">
		<img src="/img/eglise_header.jpg" alt="Église Murambi" class="absolute inset-0 w-full h-full object-cover img-zoom" />
		<div class="absolute inset-0 bg-gradient-to-t from-stone-900/60 via-transparent to-transparent"></div>
		<div class="absolute bottom-0 left-0 right-0 p-8 md:p-12">
			<div class="max-w-4xl mx-auto">
				<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-white/70 mb-3 font-body">Église</p>
				<h1 class="font-display text-3xl md:text-5xl text-white leading-tight">Assemblée de Kigali/Gatenga/Murambi</h1>
			</div>
		</div>
	</header>
	<div class="relative flex flex-row justify-center h-auto w-full py-16">
		<div class="relative flex flex-col items-start w-full max-w-4xl space-y-8 mx-auto px-6">
			{#each EgliseParagraph1 as paragraph, index}
				<ArticleParagraph text={paragraph.text} />
			{/each}
			<ArticleImage image="/img/eglise_inside.jpg" alt="Église Murambi - Missionnaire Network" />
			{#each EgliseParagraph2 as paragraph, index}
				<ArticleParagraph text={paragraph.text} />
			{/each}
			<div class="hidden lg:block absolute -right-[400px]">
				<ArticleCornerImage image="/img/chauffeur.jpg" />
			</div>
		</div>
	</div>
</div>
