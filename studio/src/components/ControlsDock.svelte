<script lang="ts">
	import { broadcast } from '../lib/broadcast.svelte';
	import Dock from './Dock.svelte';
	import { t } from '../lib/i18n.svelte';
	import { destinationUrl, persist, studio } from '../lib/state.svelte';

	let {
		onToggleLive,
		onSettings,
		confirmStop
	}: {
		onToggleLive: () => void;
		onSettings: () => void;
		confirmStop: boolean;
	} = $props();

	const enabled = $derived(studio.destinations.filter((d) => d.enabled && destinationUrl(d).length > 8));
</script>

<Dock id="controls" title={t('dock.controls')}>
	<div class="space-y-1.5 p-2">
		<button
			class="h-10 w-full text-[13px] font-medium transition-colors {broadcast.live
				? confirmStop
					? 'bg-red-600 text-white'
					: 'border border-red-500/50 text-red-400 hover:bg-red-600/15'
				: 'bg-primary text-black hover:bg-missionnaire-400'} disabled:cursor-not-allowed disabled:opacity-40"
			disabled={broadcast.starting || (!broadcast.live && enabled.length === 0)}
			onclick={onToggleLive}
		>
			{#if broadcast.starting}
				{t('controls.starting')}
			{:else if broadcast.live}
				{confirmStop ? t('controls.confirmStop') : t('controls.stopStreaming')}
			{:else}
				{t('controls.startStreaming')}
			{/if}
		</button>

		<button
			class="h-9 w-full border text-[13px] transition-colors {studio.settings
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
			}}>{t('controls.studioMode')}</button
		>

		<button
			class="h-9 w-full border border-ink-600 text-[13px] text-white/70 transition-colors hover:border-ink-500 hover:text-white"
			onclick={onSettings}
		>
			{t('controls.settings')}
			<!-- No enabled destination means Start Streaming is disabled; say so
			     here rather than leaving a dead button with no explanation. -->
			{#if enabled.length === 0}
				<span class="ml-1 font-mono text-[10px] text-amber-400">!</span>
			{/if}
		</button>
	</div>
</Dock>
