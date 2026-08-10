<script lang="ts">
	import Dock from './Dock.svelte';
	import { t } from '../lib/i18n.svelte';
	import { persist, studio } from '../lib/state.svelte';

	// Only two transitions exist here, and "Coupure" is just a zero-length fade.
	// A plugin architecture for wipes and stingers is not what a church service
	// is short of. ponytail: add real transition types when someone asks.
	const DURATIONS = [0, 150, 350, 700, 1000];
</script>

<Dock id="transition" title={t('dock.sceneTransitions')}>
	<div class="space-y-2 p-2">
		<select
			class="studio-input h-8 w-full py-0 text-[12px]"
			value={studio.settings.transitionMs === 0 ? 'cut' : 'fade'}
			onchange={(e) => {
				studio.settings.transitionMs =
					(e.currentTarget as HTMLSelectElement).value === 'cut' ? 0 : 350;
				persist();
			}}
		>
			<option value="fade">{t('transitions.fade')}</option>
			<option value="cut">{t('transitions.cut')}</option>
		</select>

		{#if studio.settings.transitionMs > 0}
			<label class="block">
				<span class="mb-1 block text-[11px] text-white/45">{t('transitions.duration')}</span>
				<div class="flex flex-wrap gap-1">
					{#each DURATIONS.filter((d) => d > 0) as ms (ms)}
						<button
							class="studio-chip flex-1 px-1 text-[10px] {studio.settings.transitionMs === ms
								? 'bg-primary/20 text-primary'
								: ''}"
							onclick={() => {
								studio.settings.transitionMs = ms;
								persist();
							}}>{ms}</button
						>
					{/each}
				</div>
			</label>
		{/if}
	</div>
</Dock>
