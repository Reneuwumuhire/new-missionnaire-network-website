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
		{:else if node.type === 'scripture'}
			<span
				class="box-decoration-clone rounded-[3px] bg-missionnaire-50 px-1.5 py-0.5 font-display italic text-stone-800"
			>
				<span class="font-semibold not-italic text-missionnaire/60">«</span>{@render inline(
					node.children
				)}<span class="font-semibold not-italic text-missionnaire/60">»</span>{#if node.reference}<span
						class="ms-1.5 inline-block whitespace-nowrap rounded-full bg-missionnaire px-2 py-0.5 align-baseline text-[10px] font-bold not-italic uppercase tracking-wide text-white"
						>{node.reference}</span
					>{/if}
			</span>
		{:else}
			<s>{@render inline(node.children)}</s>
		{/if}
	{/each}
{/snippet}

<div class={proseClass}>
	{#each blocks as block}
		{#if block.type === 'scripture'}
			<aside
				class="my-4 flex gap-3 rounded-lg bg-missionnaire-50 px-4 py-3.5 ring-1 ring-inset ring-missionnaire/10 first:mt-0 last:mb-0 md:px-5 md:py-4"
			>
				<svg
					class="mt-0.5 h-5 w-5 shrink-0 text-missionnaire"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M4 5.5A1.5 1.5 0 0 1 5.5 4H18a2 2 0 0 1 2 2v12.5a1.5 1.5 0 0 1-1.5 1.5H6a2 2 0 0 1-2-2V5.5Z"
					/>
					<path stroke-linecap="round" stroke-linejoin="round" d="M8 4v16M12 8h4M12 11h4" />
				</svg>
				<div class="min-w-0">
					<blockquote class="text-base leading-7 text-stone-800">
						{@render inline(block.children)}
					</blockquote>
					{#if block.reference}
						<cite
							class="mt-2 block text-xs font-bold uppercase not-italic tracking-[0.14em] text-missionnaire"
						>
							{block.reference}
						</cite>
					{/if}
				</div>
			</aside>
		{:else if block.type === 'quote'}
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
		{:else if block.type === 'heading'}
			<p
				class="mb-2 mt-5 font-display text-sm font-bold uppercase tracking-[0.14em] text-missionnaire first:mt-0"
			>
				{@render inline(block.children)}
			</p>
		{:else if block.type === 'paragraph'}
			<p class="my-3 whitespace-pre-line first:mt-0 last:mb-0">
				{@render inline(block.children)}
			</p>
		{/if}
	{/each}
</div>
