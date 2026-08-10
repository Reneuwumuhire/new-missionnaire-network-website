<script lang="ts">
	import { handleFor, mediaVersion, openCamera, openFile, openScreen, release } from '../lib/media.svelte';
	import Dock from './Dock.svelte';
	import Icon, { type IconName } from './Icon.svelte';
	import { popoverFit } from '../lib/layout';
	import {
		DEFAULT_TEXT_STYLE,
		activeScene,
		makeLayer,
		persist,
		studio,
		type Layer,
		type LayerKind
	} from '../lib/state.svelte';

	let { onproperties }: { onproperties: () => void } = $props();

	let adding = $state(false);
	let addButton = $state<HTMLButtonElement | null>(null);
	// Measured on open: the docks are resizable, so how much room a menu has
	// is not something the stylesheet can know.
	let menuFit = $state({ direction: 'up' as 'up' | 'down', maxHeight: 320 });

	function openMenu() {
		if (!adding && addButton) {
			const rect = addButton.getBoundingClientRect();
			menuFit = popoverFit(rect.top, rect.bottom, window.innerHeight);
		}
		adding = !adding;
	}

	/** Any click that is not on the menu closes it — a menu you can only
	 *  dismiss by picking something is a trap. Capture phase so it runs before
	 *  the toggle button's own handler re-opens it. */
	$effect(() => {
		if (!adding) return;
		const close = (event: Event) => {
			if (!(event.target as HTMLElement | null)?.closest('[data-add-menu]')) adding = false;
		};
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') adding = false;
		};
		window.addEventListener('pointerdown', close);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('pointerdown', close);
			window.removeEventListener('keydown', onKey);
		};
	});
	let fileInput = $state<HTMLInputElement | null>(null);
	let pendingFileLayer = $state<Layer | null>(null);

	const SOURCE_KINDS: { kind: LayerKind; label: string; hint: string; icon: IconName }[] = [
		{ kind: 'camera', label: 'Caméra', hint: 'Webcam ou boîtier de capture', icon: 'camera' },
		{ kind: 'screen', label: 'Écran / fenêtre', hint: 'Partage un écran ou une application', icon: 'monitor' },
		{ kind: 'image', label: 'Image', hint: 'Logo, verset, arrière-plan', icon: 'image' },
		{ kind: 'video', label: 'Vidéo', hint: 'Clip ou boucle, avec son', icon: 'film' },
		{ kind: 'text', label: 'Texte', hint: 'Titre, message fixe', icon: 'text' },
		{ kind: 'lyrics', label: 'Paroles', hint: 'Ligne en cours du panneau Paroles', icon: 'music' },
		{ kind: 'color', label: 'Fond uni', hint: 'Couleur pleine', icon: 'droplet' }
	];

	const iconFor = (kind: LayerKind): IconName =>
		SOURCE_KINDS.find((s) => s.kind === kind)?.icon ?? 'droplet';

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

	function removeLayer(layer: Layer | null) {
		if (!layer) return;
		release(layer.id);
		const scene = activeScene();
		scene.layers = scene.layers.filter((l) => l.id !== layer.id);
		if (studio.selectedLayerId === layer.id) studio.selectedLayerId = null;
		persist();
	}

	function move(layer: Layer | null, delta: number) {
		if (!layer) return;
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

	/** Re-open a source: a camera taken by another app, a screen share ended
	 *  from the menu bar, a file lost across a restart. */
	async function reconnect(layer: Layer) {
		if (layer.kind === 'camera') await openCamera(layer, studio.settings.width, studio.settings.height);
		else if (layer.kind === 'screen') await openScreen(layer);
		else pickFile(layer);
	}

	const selected = $derived(activeScene().layers.find((l) => l.id === studio.selectedLayerId) ?? null);
	const selectedIndex = $derived(
		selected ? activeScene().layers.findIndex((l) => l.id === selected.id) : -1
	);

	function problem(layer: Layer): string | null {
		if (!['camera', 'screen', 'image', 'video'].includes(layer.kind)) return null;
		void mediaVersion.n;
		const handle = handleFor(layer.id);
		if (handle?.error) return handle.error;
		if (!handle?.el) return 'Non connectée';
		return null;
	}
</script>

<input bind:this={fileInput} type="file" class="hidden" onchange={onFileChosen} />

<Dock id="sources" title="Sources">
	<ul>
		{#each activeScene().layers as layer (layer.id)}
			{@const issue = problem(layer)}
			<li
				class="group flex items-center gap-1 pr-1 {layer.id === studio.selectedLayerId
					? 'bg-primary/20'
					: 'hover:bg-white/5'}"
			>
				<button
					class="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-3 text-left"
					onclick={() => (studio.selectedLayerId = layer.id)}
					ondblclick={onproperties}
				>
					<Icon name={iconFor(layer.kind)} size={13} class="text-white/45" />
					<span class="min-w-0 flex-1 truncate text-[13px] {layer.visible ? 'text-white/85' : 'text-white/35'}"
						>{layer.name}</span
					>
				</button>
				{#if issue}
					<button
						class="shrink-0 bg-amber-500/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-400 hover:bg-amber-500/30"
						title={issue}
						onclick={() => reconnect(layer)}>Reconnecter</button
					>
				{/if}
				<button
					class="studio-icon-btn"
					title={layer.visible ? 'Masquer' : 'Afficher'}
					aria-label={layer.visible ? 'Masquer' : 'Afficher'}
					onclick={() => {
						layer.visible = !layer.visible;
						persist();
					}}>
					<Icon name={layer.visible ? 'eye' : 'eyeOff'} size={14} />
				</button>
				<button
					class="studio-icon-btn"
					title={layer.locked ? 'Déverrouiller' : 'Verrouiller'}
					aria-label={layer.locked ? 'Déverrouiller' : 'Verrouiller'}
					onclick={() => {
						layer.locked = !layer.locked;
						persist();
					}}>
					<Icon name={layer.locked ? 'lock' : 'unlock'} size={13} />
				</button>
			</li>
		{:else}
			<p class="px-3 py-4 text-[11px] text-white/30">Aucune source. Cliquez + ci-dessous.</p>
		{/each}
	</ul>

	{#snippet footer()}
		<div class="relative" data-add-menu>
			<button
				bind:this={addButton}
				class="studio-icon-btn"
				title="Ajouter une source"
				aria-label="Ajouter une source"
				onclick={openMenu}
			>
				<Icon name="plus" />
			</button>
			{#if adding}
				<!-- Flips to whichever side has more room and scrolls inside what is
				     left, so no entry is ever clipped off the window however the
				     operator has sized the docks. -->
				<div
					class="absolute left-0 z-30 w-60 overflow-y-auto border border-ink-600 bg-ink-850 py-1 shadow-2xl shadow-black/70 {menuFit.direction ===
					'up'
						? 'bottom-8'
						: 'top-8'}"
					style="max-height: {menuFit.maxHeight}px"
				>
					{#each SOURCE_KINDS as source (source.kind)}
						<button
							class="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-primary/15"
							onclick={() => addSource(source.kind)}
						>
							<Icon name={source.icon} size={14} class="mt-0.5 text-white/45" />
							<span class="min-w-0">
								<span class="block text-[13px] text-white/90">{source.label}</span>
								<span class="block text-[11px] text-white/40">{source.hint}</span>
							</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
		<button class="studio-icon-btn" title="Supprimer" aria-label="Supprimer" disabled={!selected} onclick={() => removeLayer(selected)}><Icon name="trash" /></button>
		<button class="studio-icon-btn" title="Propriétés" aria-label="Propriétés" disabled={!selected} onclick={onproperties}><Icon name="gear" /></button>
		<span class="mx-1 h-4 w-px bg-ink-600"></span>
		<button class="studio-icon-btn" title="Monter" aria-label="Monter" disabled={selectedIndex <= 0} onclick={() => move(selected, -1)}><Icon name="up" /></button>
		<button
			class="studio-icon-btn"
			title="Descendre"
			aria-label="Descendre"
			disabled={selectedIndex < 0 || selectedIndex === activeScene().layers.length - 1}
			onclick={() => move(selected, 1)}>↓</button
		>
	{/snippet}
</Dock>
