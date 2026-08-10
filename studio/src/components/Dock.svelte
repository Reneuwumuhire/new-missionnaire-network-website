<script lang="ts">
	import type { Snippet } from 'svelte';

	// OBS's dock: a titled panel in the bottom row. Same chrome everywhere so
	// the row reads as one strip of tools rather than five different panels.
	let {
		title,
		grow = 1,
		actions,
		footer,
		children
	}: {
		title: string;
		/** flex-grow, so the mixer gets the room and Transitions does not. */
		grow?: number;
		actions?: Snippet;
		footer?: Snippet;
		children: Snippet;
	} = $props();
</script>

<section class="flex min-w-0 flex-col border-r border-ink-700 last:border-r-0" style="flex: {grow} 1 0">
	<header class="flex h-8 shrink-0 items-center justify-between border-b border-ink-700 bg-ink-850 px-3">
		<h2 class="truncate text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">{title}</h2>
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
