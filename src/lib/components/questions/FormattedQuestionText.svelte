<script lang="ts">
	import { parseRichText, type InlineNode } from '$lib/questions/rich-text';

	export let text = '';
	export let proseClass = '';

	$: blocks = parseRichText(text);
</script>

{#snippet inline(nodes: InlineNode[])}
	{#each nodes as node}
		{#if node.type === 'text'}
			{node.text}
		{:else if node.type === 'bold'}
			<strong>{@render inline(node.children)}</strong>
		{:else if node.type === 'underline'}
			<u>{@render inline(node.children)}</u>
		{:else}
			<s>{@render inline(node.children)}</s>
		{/if}
	{/each}
{/snippet}

<div class={proseClass}>
	{#each blocks as block}
		{#if block.type === 'quote'}
			<blockquote class="my-4 border-l-4 border-missionnaire/50 bg-missionnaire-50/40 px-4 py-3 font-display text-xl italic leading-8 text-stone-800 whitespace-pre-line">
				{@render inline(block.children)}
			</blockquote>
		{:else if block.type === 'unorderedList'}
			<ul class="my-3 list-disc space-y-1 pl-6">
				{#each block.items as item}
					<li>{@render inline(item)}</li>
				{/each}
			</ul>
		{:else if block.type === 'orderedList'}
			<ol class="my-3 list-decimal space-y-1 pl-6">
				{#each block.items as item}
					<li>{@render inline(item)}</li>
				{/each}
			</ol>
		{:else if block.type === 'paragraph'}
			<p class="my-3 whitespace-pre-line">
				{@render inline(block.children)}
			</p>
		{/if}
	{/each}
</div>
