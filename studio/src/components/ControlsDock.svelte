<script lang="ts">
	import { broadcast } from '../lib/broadcast.svelte';
	import Dock from './Dock.svelte';
	import { destinationUrl, persist, studio } from '../lib/state.svelte';

	let {
		onToggleLive,
		onDestinations,
		onSettings,
		confirmStop
	}: {
		onToggleLive: () => void;
		onDestinations: () => void;
		onSettings: () => void;
		confirmStop: boolean;
	} = $props();

	const enabled = $derived(studio.destinations.filter((d) => d.enabled && destinationUrl(d).length > 8));
</script>

<Dock id="controls" title="Contrôles">
	<div class="space-y-1.5 p-2">
		<button
			class="h-10 w-full text-[11px] font-semibold uppercase tracking-[0.16em] transition-colors {broadcast.live
				? confirmStop
					? 'bg-red-600 text-white'
					: 'border border-red-500/50 text-red-400 hover:bg-red-600/15'
				: 'bg-primary text-black hover:bg-missionnaire-400'} disabled:cursor-not-allowed disabled:opacity-40"
			disabled={broadcast.starting || (!broadcast.live && enabled.length === 0)}
			onclick={onToggleLive}
		>
			{#if broadcast.starting}
				Démarrage…
			{:else if broadcast.live}
				{confirmStop ? 'Confirmer l’arrêt' : 'Arrêter la diffusion'}
			{:else}
				Passer en direct
			{/if}
		</button>

		<button
			class="h-9 w-full border text-[11px] uppercase tracking-[0.14em] transition-colors {studio.settings
				.studioMode
				? 'border-primary/60 bg-primary/15 text-primary'
				: 'border-ink-600 text-white/60 hover:border-ink-500 hover:text-white'}"
			onclick={() => {
				// Entering Studio Mode, the scene on air is whatever is showing now.
				// Leaving it, the edit scene becomes the program scene by definition
				// (see onAirSceneId), so there is nothing to reconcile.
				if (!studio.settings.studioMode) studio.programSceneId = studio.activeSceneId;
				studio.settings.studioMode = !studio.settings.studioMode;
				persist();
			}}>Mode studio</button
		>

		<button class="h-9 w-full border border-ink-600 text-[11px] uppercase tracking-[0.14em] text-white/60 transition-colors hover:border-ink-500 hover:text-white" onclick={onDestinations}>
			Destinations
			<span class="ml-1 font-mono text-[10px] {enabled.length ? 'text-emerald-400' : 'text-amber-400'}"
				>{enabled.length}</span
			>
		</button>
		<button class="h-9 w-full border border-ink-600 text-[11px] uppercase tracking-[0.14em] text-white/60 transition-colors hover:border-ink-500 hover:text-white" onclick={onSettings}>
			Réglages
		</button>
	</div>
</Dock>
