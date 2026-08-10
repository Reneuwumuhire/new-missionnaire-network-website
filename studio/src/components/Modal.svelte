<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	// Settings, Properties and Destinations are dialogs, not permanent panels —
	// the same call OBS makes. They are opened rarely and need room when they
	// are, and the docks stay uncluttered the rest of the time.
	let {
		title,
		onclose,
		children
	}: { title: string; onclose: () => void; children: Snippet } = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8">
	<!-- Click-outside closes; the panel swallows its own clicks. -->
	<button class="absolute inset-0 cursor-default" aria-label="Fermer" onclick={onclose}></button>
	<div
		class="relative flex max-h-full w-full max-w-2xl flex-col border border-ink-600 bg-ink-900 shadow-2xl shadow-black/80"
		role="dialog"
		aria-label={title}
	>
		<header class="flex h-11 shrink-0 items-center justify-between border-b border-ink-700 px-4">
			<h2 class="text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">{title}</h2>
			<button class="studio-icon-btn" aria-label="Fermer" onclick={onclose}><Icon name="close" /></button>
		</header>
		<div class="min-h-0 flex-1 overflow-y-auto">
			{@render children()}
		</div>
	</div>
</div>
