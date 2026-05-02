<script lang="ts">
	import { parseRichText, type InlineNode } from '$lib/questions/rich-text';

	export let text = '';
	export let proseClass = '';

	$: blocks = parseRichText(text);

	function isExternalHref(href: string): boolean {
		return /^https?:\/\//i.test(href);
	}
</script>

{#snippet inline(nodes: InlineNode[])}
	{#each nodes as node}
		{#if node.type === 'text'}
			{node.text}
		{:else if node.type === 'bold'}
			<strong>{@render inline(node.children)}</strong>
		{:else if node.type === 'italic'}
			<em>{@render inline(node.children)}</em>
		{:else if node.type === 'underline'}
			<u>{@render inline(node.children)}</u>
		{:else if node.type === 'link'}
			<a
				href={node.href}
				target={isExternalHref(node.href) ? '_blank' : undefined}
				rel={isExternalHref(node.href) ? 'noopener noreferrer' : undefined}
				class="font-semibold text-missionnaire underline decoration-missionnaire/35 underline-offset-4 transition hover:text-stone-950"
			>
				{@render inline(node.children)}
			</a>
		{:else}
			<s>{@render inline(node.children)}</s>
		{/if}
	{/each}
{/snippet}

<div class={proseClass}>
	{#each blocks as block}
		{#if block.type === 'quote'}
			<blockquote class="my-2 border-l-4 border-missionnaire/50 bg-missionnaire-50/40 px-3 py-2 font-display text-lg italic leading-7 text-stone-800 whitespace-pre-line">
				{@render inline(block.children)}
			</blockquote>
		{:else if block.type === 'unorderedList'}
			<ul class="my-2 list-disc space-y-0.5 pl-5">
				{#each block.items as item}
					<li>{@render inline(item)}</li>
				{/each}
			</ul>
		{:else if block.type === 'orderedList'}
			<ol class="my-2 list-decimal space-y-0.5 pl-5">
				{#each block.items as item}
					<li>{@render inline(item)}</li>
				{/each}
			</ol>
		{:else if block.type === 'paragraph'}
			<p class="my-2 whitespace-pre-line">
				{@render inline(block.children)}
			</p>
		{/if}
	{/each}
</div>
