<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { DockId } from '../lib/layout';
	import { studio } from '../lib/state.svelte';

	// OBS's dock: a titled panel in the bottom row. Same chrome everywhere so
	// the row reads as one strip of tools rather than five different panels.
	// Width comes from the operator's dragged layout, keyed by id.
	let {
		id,
		title,
		actions,
		footer,
		children
	}: {
		id: DockId;
		title: string;
		actions?: Snippet;
		footer?: Snippet;
		children: Snippet;
	} = $props();

	const weight = $derived(studio.settings.layout.weights[id] ?? 1);
</script>

<section class="flex min-w-0 flex-col" style="flex: {weight} 1 0">
	<header class="flex h-8 shrink-0 items-center justify-between border-b border-ink-700 bg-ink-850 px-3">
		<h2 class="truncate text-[12px] font-semibold text-fg/80">{title}</h2>
		{#if actions}
			<div class="flex items-center gap-0.5">{@render actions()}</div>
		{/if}
	</header>
	<div class="min-h-0 flex-1 overflow-y-auto">
		{@render children()}
	</div>
	{#if footer}
		<div class="flex h-9 shrink-0 items-center gap-0.5 border-t border-ink-700 bg-ink-850 px-2">
			{@render footer()}
		</div>
	{/if}
</section>
