<script lang="ts">
	import type { Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
</script>

<div class="mx-auto max-w-3xl px-6 py-16 text-stone-800">
	<p class="mb-4 text-sm font-semibold uppercase tracking-widest text-stone-500">
		Missionnaire Network
	</p>
	<nav aria-label="Studio information" class="mb-10 flex flex-wrap gap-5 text-sm">
		<a href="/studio">Missionnaire Studio</a>
		<a href="/privacy">Privacy policy</a>
		<a href="/terms">Terms of service</a>
	</nav>
	<article lang="en">{@render children()}</article>
</div>

<style>
	:global(article[lang='en'] h1) {
		font-family: var(--font-display, Georgia, serif);
		font-size: clamp(2rem, 5vw, 3rem);
		line-height: 1.15;
		margin-bottom: 1.5rem;
	}
	:global(article[lang='en'] h2) {
		font-size: 1.3rem;
		font-weight: 600;
		margin: 2rem 0 0.75rem;
	}
	:global(article[lang='en'] p),
	:global(article[lang='en'] ul),
	:global(article[lang='en'] ol) {
		line-height: 1.8;
		margin-bottom: 1rem;
	}
	:global(article[lang='en'] ul) {
		list-style: disc;
		padding-left: 1.5rem;
	}
	:global(article[lang='en'] ol) {
		list-style: decimal;
		padding-left: 1.5rem;
	}
	a,
	:global(article[lang='en'] a) {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>
