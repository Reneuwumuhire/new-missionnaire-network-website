<script lang="ts">
	import Dock from './Dock.svelte';
	import { t } from '../lib/i18n.svelte';
	import { persist, studio } from '../lib/state.svelte';

	// Fade and Cut only. A plugin architecture for wipes and stingers is not
	// what a church service is short of.
	// ponytail: add real transition types when someone asks for one.
	const DURATIONS = [150, 350, 700, 1000];
</script>

<Dock id="transition" title={t('dock.sceneTransitions')}>
	<div class="space-y-2 p-2">
		<select
			class="studio-input h-8 w-full py-0 text-[12px]"
			value={studio.settings.transitionType}
			onchange={(e) => {
				studio.settings.transitionType = (e.currentTarget as HTMLSelectElement).value as
					typeof studio.settings.transitionType;
				persist();
			}}
		>
			<option value="fade">{t('transitions.fade')}</option>
			<option value="cut">{t('transitions.cut')}</option>
			<option value="fadeToBlack">{t('transitions.fadeToBlack')}</option>
		</select>

		<!-- Shown even for Cut, greyed rather than hidden: the chosen duration is
		     remembered, and a control that vanishes reads as a bug. -->
		<div class={studio.settings.transitionType === 'cut' ? 'opacity-40' : ''}>
			<span class="mb-1 block text-[11px] text-fg/45">{t('transitions.duration')}</span>
			<div class="flex flex-wrap gap-1">
				{#each DURATIONS as ms (ms)}
					<button
						class="studio-chip flex-1 px-1 text-[10px] {studio.settings.transitionMs === ms
							? 'bg-primary/20 text-primary'
							: ''}"
						disabled={studio.settings.transitionType === 'cut'}
						onclick={() => {
							studio.settings.transitionMs = ms;
							persist();
						}}>{ms}</button
					>
				{/each}
			</div>
		</div>
	</div>
</Dock>
