<script lang="ts">
	import Dock from './Dock.svelte';
	import { toggleProgramBlack } from '../lib/compositor';
	import { t } from '../lib/i18n.svelte';
	import { persist, studio } from '../lib/state.svelte';

	let { embedded = false }: { embedded?: boolean } = $props();
	const DURATIONS = [150, 350, 700, 1000];
</script>

{#snippet settings()}
	<div class="space-y-2 {embedded ? 'border-t border-ink-700 pt-2.5' : 'p-2'}">
		{#if !embedded}
			<select
				class="studio-input h-8 w-full py-0 text-[12px]"
				aria-label={t('dock.sceneTransitions')}
				value={studio.settings.transitionType}
				onchange={(e) => {
					studio.settings.transitionType = (e.currentTarget as HTMLSelectElement)
						.value as typeof studio.settings.transitionType;
					persist();
				}}
			>
				<option value="fade">{t('transitions.fade')}</option>
				<option value="cut">{t('transitions.cut')}</option>
				<option value="fadeToBlack">{t('transitions.fadeToBlack')}</option>
			</select>
		{/if}

		<!-- Shown even for Cut, greyed rather than hidden: the chosen duration is
		     remembered, and a control that vanishes reads as a bug. -->
		<div>
			<label class="mb-2 flex items-center justify-between gap-2 text-[12px] text-muted">
				{t('transitions.duration')}
				<span class="flex items-center gap-1">
					<input
						type="number"
						min="50"
						max="10000"
						step="50"
						class="studio-input h-8 min-w-0 text-right tabular-nums {embedded ? 'w-16' : 'w-20'}"
						disabled={!embedded && studio.settings.transitionType === 'cut'}
						value={studio.settings.transitionMs}
						onchange={(event) => {
							const value = event.currentTarget.valueAsNumber;
							if (Number.isFinite(value))
								studio.settings.transitionMs = Math.min(10000, Math.max(50, value));
							event.currentTarget.value = String(studio.settings.transitionMs);
							persist();
						}}
					/>
					<span>ms</span>
				</span>
			</label>
			<div class="grid grid-cols-4 gap-1">
				{#each DURATIONS as ms (ms)}
					<button
						class="studio-chip min-w-0 px-0.5 tabular-nums {studio.settings.transitionMs === ms
							? 'border-primary/60 bg-primary/15 text-accent'
							: ''}"
						disabled={!embedded && studio.settings.transitionType === 'cut'}
						aria-pressed={studio.settings.transitionMs === ms}
						onclick={() => {
							studio.settings.transitionMs = ms;
							persist();
						}}>{ms}</button
					>
				{/each}
			</div>
		</div>
		{#if !embedded}
			<button
				class="studio-chip w-full justify-center"
				aria-pressed={studio.programBlack}
				onclick={() => toggleProgramBlack()}
			>
				{t(studio.programBlack ? 'transitions.fadeFromBlack' : 'transitions.fadeToBlack')}
			</button>
		{/if}
	</div>
{/snippet}

{#if embedded}
	{@render settings()}
{:else}
	<Dock id="transition" title={t('dock.sceneTransitions')}>
		{@render settings()}
	</Dock>
{/if}
