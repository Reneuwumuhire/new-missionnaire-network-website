<script lang="ts">
	import { selectScene, takeToProgram } from '../lib/compositor';
	import { release } from '../lib/media.svelte';
	import Dock from './Dock.svelte';
	import Icon from './Icon.svelte';
	import { t } from '../lib/i18n.svelte';
	import { id, makeLayer, onAirSceneId, persist, studio } from '../lib/state.svelte';

	let renamingId = $state<string | null>(null);

	function addScene() {
		const scene = {
			id: id(),
			name: t('scenes.new', { number: studio.scenes.length + 1 }),
			layers: [makeLayer('color', 'Fond', { color: '#0B0B0D' })]
		};
		studio.scenes = [...studio.scenes, scene];
		selectScene(scene.id);
	}

	function removeScene(sceneId: string) {
		if (studio.scenes.length === 1) return;
		const scene = studio.scenes.find((s) => s.id === sceneId);
		scene?.layers.forEach((l) => release(l.id));
		studio.scenes = studio.scenes.filter((s) => s.id !== sceneId);
		if (studio.activeSceneId === sceneId) selectScene(studio.scenes[0].id);
		// A deleted scene must never stay on air.
		if (onAirSceneId() === sceneId) takeToProgram(studio.scenes[0].id, 0);
		persist();
	}

	function move(sceneId: string, delta: number) {
		const from = studio.scenes.findIndex((s) => s.id === sceneId);
		const to = from + delta;
		if (to < 0 || to >= studio.scenes.length) return;
		const next = [...studio.scenes];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		studio.scenes = next;
		persist();
	}

	const selectedIndex = $derived(studio.scenes.findIndex((s) => s.id === studio.activeSceneId));
</script>

<Dock id="scenes" title={t('dock.scenes')}>
	<ul>
		{#each studio.scenes as scene, index (scene.id)}
			<li class="group flex items-center">
				{#if renamingId === scene.id}
					<!-- svelte-ignore a11y_autofocus -->
					<input
						class="studio-input mx-1 my-0.5 h-7 flex-1"
						value={scene.name}
						autofocus
						onblur={(e) => {
							scene.name = (e.currentTarget as HTMLInputElement).value.trim() || scene.name;
							renamingId = null;
							persist();
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
							if (e.key === 'Escape') renamingId = null;
						}}
					/>
				{:else}
					<button
						class="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors {scene.id ===
						studio.activeSceneId
							? 'bg-primary font-medium text-black'
							: 'text-fg/70 hover:bg-fg/5'}"
						onclick={() => selectScene(scene.id)}
						ondblclick={() => (renamingId = scene.id)}
					>
						<span class="w-3 shrink-0 font-mono text-[10px] text-fg/25">{index + 1}</span>
						<span class="min-w-0 flex-1 truncate">{scene.name}</span>
						{#if scene.id === onAirSceneId()}
							<!-- Which scene is actually on air. Only ambiguous in Studio Mode,
							     but that is exactly when getting it wrong matters. -->
							<span
								class="shrink-0 bg-red-600 px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-fg"
							>
								{t('preview.onAir')}
							</span>
						{/if}
					</button>
				{/if}
			</li>
		{/each}
	</ul>

	{#snippet footer()}
		<button class="studio-icon-btn" title={t('scenes.addScene')} aria-label={t('scenes.addScene')} onclick={addScene}><Icon name="plus" /></button>
		<button
			class="studio-icon-btn"
			title={t('scenes.removeScene')}
			aria-label={t('scenes.removeScene')}
			disabled={studio.scenes.length === 1}
			onclick={() => removeScene(studio.activeSceneId)}><Icon name="trash" /></button
		>
		<button
			class="studio-icon-btn"
			title={t('common.rename')}
			aria-label={t('common.rename')}
			onclick={() => (renamingId = studio.activeSceneId)}><Icon name="pencil" /></button
		>
		<span class="mx-1 h-4 w-px bg-ink-600"></span>
		<button
			class="studio-icon-btn"
			title={t('common.moveUp')}
			aria-label={t('common.moveUp')}
			disabled={selectedIndex <= 0}
			onclick={() => move(studio.activeSceneId, -1)}><Icon name="up" /></button
		>
		<button
			class="studio-icon-btn"
			title={t('common.moveDown')}
			aria-label={t('common.moveDown')}
			disabled={selectedIndex === studio.scenes.length - 1}
			onclick={() => move(studio.activeSceneId, 1)}><Icon name="down" /></button
		>
	{/snippet}
</Dock>
