<script lang="ts">
	import { beginTransition } from '../lib/compositor';
	import { handleFor, mediaVersion, openCamera, openFile, openScreen, release } from '../lib/media.svelte';
	import {
		DEFAULT_TEXT_STYLE,
		activeScene,
		id,
		makeLayer,
		persist,
		studio,
		type Layer,
		type LayerKind
	} from '../lib/state.svelte';

	let adding = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	let pendingFileLayer = $state<Layer | null>(null);
	let renamingId = $state<string | null>(null);

	function switchScene(sceneId: string) {
		if (sceneId === studio.activeSceneId) return;
		beginTransition(studio.activeSceneId, studio.settings.transitionMs);
		studio.activeSceneId = sceneId;
		studio.selectedLayerId = null;
		persist();
	}

	function addScene() {
		const scene = {
			id: id(),
			name: `Scène ${studio.scenes.length + 1}`,
			layers: [makeLayer('color', 'Fond', { color: '#0B0B0D' })]
		};
		studio.scenes = [...studio.scenes, scene];
		switchScene(scene.id);
	}

	function removeScene(sceneId: string) {
		if (studio.scenes.length === 1) return;
		const scene = studio.scenes.find((s) => s.id === sceneId);
		scene?.layers.forEach((l) => release(l.id));
		studio.scenes = studio.scenes.filter((s) => s.id !== sceneId);
		if (studio.activeSceneId === sceneId) studio.activeSceneId = studio.scenes[0].id;
		persist();
	}

	const SOURCE_KINDS: { kind: LayerKind; label: string; hint: string }[] = [
		{ kind: 'camera', label: 'Caméra', hint: 'Webcam ou boîtier de capture' },
		{ kind: 'screen', label: 'Écran / fenêtre', hint: 'Partage un écran ou une application' },
		{ kind: 'image', label: 'Image', hint: 'Logo, verset, arrière-plan' },
		{ kind: 'video', label: 'Vidéo', hint: 'Clip ou boucle, avec son' },
		{ kind: 'text', label: 'Texte', hint: 'Titre, message fixe' },
		{ kind: 'lyrics', label: 'Paroles', hint: 'Ligne en cours du panneau Paroles' },
		{ kind: 'color', label: 'Fond uni', hint: 'Couleur pleine' }
	];

	async function addSource(kind: LayerKind) {
		adding = false;
		const label = SOURCE_KINDS.find((s) => s.kind === kind)?.label ?? kind;
		const layer = makeLayer(kind, label, {
			...(kind === 'text' ? { text: 'Texte', style: { ...DEFAULT_TEXT_STYLE } } : {}),
			...(kind === 'lyrics'
				? {
						rect: { x: 0.06, y: 0.7, w: 0.88, h: 0.24 },
						showNext: true,
						style: { ...DEFAULT_TEXT_STYLE }
					}
				: {}),
			...(kind === 'color' ? { color: '#0B0B0D' } : {}),
			...(kind === 'screen' || kind === 'video' ? { fit: 'contain' as const } : {})
		});
		const scene = activeScene();
		scene.layers = [layer, ...scene.layers];
		studio.selectedLayerId = layer.id;
		persist();

		if (kind === 'camera') await openCamera(layer, studio.settings.width, studio.settings.height);
		if (kind === 'screen') await openScreen(layer);
		if (kind === 'image' || kind === 'video') pickFile(layer);
	}

	function pickFile(layer: Layer) {
		pendingFileLayer = layer;
		if (fileInput) {
			fileInput.accept = layer.kind === 'image' ? 'image/*' : 'video/*';
			fileInput.click();
		}
	}

	function onFileChosen(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || !pendingFileLayer) return;
		pendingFileLayer.fileName = file.name;
		pendingFileLayer.name = file.name.replace(/\.[^.]+$/, '');
		openFile(pendingFileLayer, file);
		persist();
		pendingFileLayer = null;
	}

	function removeLayer(layer: Layer) {
		release(layer.id);
		const scene = activeScene();
		scene.layers = scene.layers.filter((l) => l.id !== layer.id);
		if (studio.selectedLayerId === layer.id) studio.selectedLayerId = null;
		persist();
	}

	function move(layer: Layer, delta: number) {
		const scene = activeScene();
		const from = scene.layers.indexOf(layer);
		const to = from + delta;
		if (to < 0 || to >= scene.layers.length) return;
		const next = [...scene.layers];
		next.splice(from, 1);
		next.splice(to, 0, layer);
		scene.layers = next;
		persist();
	}

	/** Re-open a source: a camera taken by another app, a screen share the
	 *  operator ended from the macOS menu bar, a file lost across a restart. */
	async function reconnect(layer: Layer) {
		if (layer.kind === 'camera') await openCamera(layer, studio.settings.width, studio.settings.height);
		else if (layer.kind === 'screen') await openScreen(layer);
		else pickFile(layer);
	}

	function status(layer: Layer): { text: string; tone: 'ok' | 'warn' | 'idle' } {
		if (!['camera', 'screen', 'image', 'video'].includes(layer.kind)) return { text: '', tone: 'idle' };
		void mediaVersion.n;
		const handle = handleFor(layer.id);
		if (handle?.error) return { text: handle.error, tone: 'warn' };
		if (handle?.el) return { text: '', tone: 'ok' };
		return { text: 'Non connectée', tone: 'warn' };
	}
</script>

<input bind:this={fileInput} type="file" class="hidden" onchange={onFileChosen} />

<div class="flex h-full min-h-0 flex-col divide-y divide-ink-700">
	<!-- ── Scenes ─────────────────────────────────────────── -->
	<section class="flex min-h-0 flex-1 flex-col">
		<header class="flex items-center justify-between px-3 py-2">
			<h2 class="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Scènes</h2>
			<button class="studio-icon-btn" title="Nouvelle scène" onclick={addScene} aria-label="Nouvelle scène">+</button>
		</header>
		<ul class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
			{#each studio.scenes as scene, index (scene.id)}
				<li class="group flex items-center gap-1">
					{#if renamingId === scene.id}
						<!-- svelte-ignore a11y_autofocus -->
						<input
							class="studio-input my-0.5 flex-1"
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
							class="flex-1 truncate border-l-2 px-2 py-2 text-left text-sm transition-colors {scene.id ===
							studio.activeSceneId
								? 'border-primary bg-primary/10 text-white'
								: 'border-transparent text-white/60 hover:bg-white/5 hover:text-white'}"
							onclick={() => switchScene(scene.id)}
							ondblclick={() => (renamingId = scene.id)}
						>
							<span class="mr-2 font-mono text-[10px] text-white/30">{index + 1}</span>{scene.name}
						</button>
						<button
							class="studio-icon-btn opacity-0 group-hover:opacity-100"
							title="Supprimer la scène"
							aria-label="Supprimer la scène"
							disabled={studio.scenes.length === 1}
							onclick={() => removeScene(scene.id)}>×</button
						>
					{/if}
				</li>
			{/each}
		</ul>
	</section>

	<!-- ── Sources of the active scene ────────────────────── -->
	<section class="flex min-h-0 flex-[1.4] flex-col">
		<header class="relative flex items-center justify-between px-3 py-2">
			<h2 class="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Sources</h2>
			<button class="studio-icon-btn" title="Ajouter une source" aria-label="Ajouter une source" onclick={() => (adding = !adding)}>+</button>
			{#if adding}
				<div class="absolute right-2 top-9 z-20 w-60 border border-ink-600 bg-ink-850 py-1 shadow-2xl shadow-black/70">
					{#each SOURCE_KINDS as source (source.kind)}
						<button
							class="block w-full px-3 py-2 text-left hover:bg-primary/15"
							onclick={() => addSource(source.kind)}
						>
							<span class="block text-sm text-white/90">{source.label}</span>
							<span class="block text-[11px] text-white/40">{source.hint}</span>
						</button>
					{/each}
				</div>
			{/if}
		</header>
		<ul class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
			{#each activeScene().layers as layer, index (layer.id)}
				{@const state = status(layer)}
				<li
					class="group flex items-center gap-1 border-l-2 px-1 {layer.id === studio.selectedLayerId
						? 'border-primary bg-primary/10'
						: 'border-transparent hover:bg-white/5'}"
				>
					<button
						class="studio-icon-btn"
						title={layer.visible ? 'Masquer' : 'Afficher'}
						aria-label={layer.visible ? 'Masquer' : 'Afficher'}
						onclick={() => {
							layer.visible = !layer.visible;
							persist();
						}}>{layer.visible ? '👁' : '–'}</button
					>
					<button class="min-w-0 flex-1 py-2 text-left" onclick={() => (studio.selectedLayerId = layer.id)}>
						<span class="block truncate text-sm {layer.visible ? 'text-white/85' : 'text-white/35'}"
							>{layer.name}</span
						>
						{#if state.text}
							<span class="block truncate text-[10px] {state.tone === 'warn' ? 'text-amber-400/80' : 'text-white/40'}"
								>{state.text}</span
							>
						{/if}
					</button>
					<div class="flex opacity-0 group-hover:opacity-100">
						{#if ['camera', 'screen', 'image', 'video'].includes(layer.kind)}
							<button class="studio-icon-btn" title="Reconnecter" aria-label="Reconnecter" onclick={() => reconnect(layer)}>⟳</button>
						{/if}
						<button class="studio-icon-btn" title="Monter" aria-label="Monter" disabled={index === 0} onclick={() => move(layer, -1)}>↑</button>
						<button
							class="studio-icon-btn"
							title="Descendre"
							aria-label="Descendre"
							disabled={index === activeScene().layers.length - 1}
							onclick={() => move(layer, 1)}>↓</button
						>
						<button class="studio-icon-btn" title="Supprimer" aria-label="Supprimer" onclick={() => removeLayer(layer)}>×</button>
					</div>
				</li>
			{/each}
		</ul>
	</section>
</div>
