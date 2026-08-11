<script lang="ts">
	import {
		handleFor,
		mediaVersion,
		openCamera,
		openFile,
		openScreen,
		release,
		report
	} from '../lib/media.svelte';
	import {
		DESKTOP_AUDIO,
		appAudio,
		listWindows,
		matchApp,
		matchWindow,
		refreshApps
	} from '../lib/appaudio.svelte';
	import { addAppAudio, addAudioInput } from '../lib/state.svelte';
	import Dock from './Dock.svelte';
	import Icon, { type IconName } from './Icon.svelte';
	import { popoverFit } from '../lib/layout';
	import { t } from '../lib/i18n.svelte';
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

	/** false closed, 'menu' the source kinds, 'apps' the list of applications. */
	let adding = $state<'menu' | 'apps' | false>(false);
	let addButton = $state<HTMLButtonElement | null>(null);
	// Measured on open: the docks are resizable, so how much room a menu has
	// is not something the stylesheet can know.
	let menuFit = $state({ direction: 'up' as 'up' | 'down', maxHeight: 320 });

	function openMenu() {
		if (!adding && addButton) {
			const rect = addButton.getBoundingClientRect();
			menuFit = popoverFit(rect.top, rect.bottom, window.innerHeight);
		}
		adding = adding ? false : 'menu';
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

	/** The two audio kinds are not layers: they have no picture, and they are
	 *  global to the show. They are offered here because OBS offers them here,
	 *  and appear where they belong — in the Audio Mixer. */
	type MenuKind = LayerKind | 'audioInput' | 'audioApp';

	const SOURCE_KINDS: {
		kind: MenuKind;
		label: () => string;
		hint: () => string;
		icon: IconName;
	}[] = [
		{
			kind: 'audioInput',
			label: () => t('sources.audioInput'),
			hint: () => t('sources.audioInputHint'),
			icon: 'mic'
		},
		{
			kind: 'audioApp',
			label: () => t('sources.audioApp'),
			hint: () => t('sources.audioAppHint'),
			icon: 'volume'
		},
		{ kind: 'camera', label: () => t('sources.camera'), hint: () => t('sources.cameraHint'), icon: 'camera' },
		{ kind: 'screen', label: () => t('sources.screen'), hint: () => t('sources.screenHint'), icon: 'monitor' },
		{ kind: 'image', label: () => t('sources.image'), hint: () => t('sources.imageHint'), icon: 'image' },
		{ kind: 'video', label: () => t('sources.video'), hint: () => t('sources.videoHint'), icon: 'film' },
		{ kind: 'text', label: () => t('sources.text'), hint: () => t('sources.textHint'), icon: 'text' },
		{ kind: 'lyrics', label: () => t('sources.lyrics'), hint: () => t('sources.lyricsHint'), icon: 'music' },
		{ kind: 'color', label: () => t('sources.color'), hint: () => t('sources.colorHint'), icon: 'droplet' }
	];

	const iconFor = (kind: LayerKind): IconName =>
		SOURCE_KINDS.find((s) => s.kind === kind)?.icon ?? 'droplet';

	async function addSource(kind: MenuKind) {
		if (kind === 'audioInput') {
			adding = false;
			// The mixer opens it: an input device is live because the source
			// exists, not because someone pressed Connect.
			addAudioInput();
			return;
		}
		if (kind === 'audioApp') {
			// Which application first, then the strip — same as the mixer's own +.
			adding = 'apps';
			await refreshApps();
			return;
		}
		adding = false;
		const label = SOURCE_KINDS.find((s) => s.kind === kind)?.label() ?? kind;
		const layer = makeLayer(kind, label, {
			...(kind === 'text' ? { text: t('sources.text'), style: { ...DEFAULT_TEXT_STYLE } } : {}),
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
		if (kind === 'screen') await shareScreen(layer);
		if (kind === 'image' || kind === 'video') pickFile(layer);
	}

	/** Share a window, then aim the native audio capture at whichever
	 *  application it belongs to: the engine hands the window over silent, so
	 *  without this the operator shares a video call or a player and gets a
	 *  picture with no sound and nothing in the mixer to fix it with. */
	async function shareScreen(layer: Layer) {
		const handle = await openScreen(layer);
		const track = handle.stream?.getVideoTracks()[0];
		if (!track) return;
		const label = track.label ?? '';
		const size = track.getSettings();
		const [windows] = await Promise.all([listWindows(), refreshApps()]);
		// The window's own application first, then anything the label names, and
		// for a whole screen the desktop itself — a shared display has no single
		// application behind it, but it certainly has a sound.
		const surface = (size as MediaTrackSettings & { displaySurface?: string }).displaySurface;
		const window = matchWindow(label, size, windows);
		const app =
			surface === 'monitor'
				? { id: DESKTOP_AUDIO, name: t('mixer.desktopAudio') }
				: window
					? { id: window.appId, name: window.appName }
					: matchApp(label, appAudio.apps);
		// No guess is not a failure: the mixer strip offers the list.
		if (app) layer.appId = app.id;
		// What the engine actually said about the share. Without this line a bad
		// guess is unexplainable after the fact.
		report(
			`share label=${JSON.stringify(label)} size=${size.width}x${size.height} windows=${windows.length} matched=${app?.name ?? 'none'}`
		);
		persist();
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
		else if (layer.kind === 'screen') await shareScreen(layer);
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
		if (!handle?.el) return t('source.notConnected');
		return null;
	}
</script>

<input bind:this={fileInput} type="file" class="hidden" onchange={onFileChosen} />

<Dock id="sources" title={t('dock.sources')}>
	<ul>
		{#each activeScene().layers as layer (layer.id)}
			{@const issue = problem(layer)}
			<li
				class="group flex items-center gap-1 pr-1 {layer.id === studio.selectedLayerId
					? 'bg-primary text-black'
					: 'hover:bg-fg/5'}"
			>
				<button
					class="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-3 text-left"
					onclick={() => (studio.selectedLayerId = layer.id)}
					ondblclick={onproperties}
				>
					<Icon
						name={iconFor(layer.kind)}
						size={13}
						class={layer.id === studio.selectedLayerId ? 'text-black/60' : 'text-fg/45'}
					/>
					<span
						class="min-w-0 flex-1 truncate text-[13px] {layer.id === studio.selectedLayerId
							? 'font-medium'
							: layer.visible
								? 'text-fg/85'
								: 'text-fg/35'}">{layer.name}</span
					>
				</button>
				{#if issue}
					<button
						class="shrink-0 bg-amber-500/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-amber-400 hover:bg-amber-500/30"
						title={issue}
						onclick={() => reconnect(layer)}>{t('sources.reconnect')}</button
					>
				{/if}
				<button
					class="studio-icon-btn"
					title={layer.visible ? t('common.hide') : t('common.show')}
					aria-label={layer.visible ? t('common.hide') : t('common.show')}
					onclick={() => {
						layer.visible = !layer.visible;
						persist();
					}}>
					<Icon name={layer.visible ? 'eye' : 'eyeOff'} size={14} />
				</button>
				<button
					class="studio-icon-btn"
					title={layer.locked ? t('common.unlock') : t('common.lock')}
					aria-label={layer.locked ? t('common.unlock') : t('common.lock')}
					onclick={() => {
						layer.locked = !layer.locked;
						persist();
					}}>
					<Icon name={layer.locked ? 'lock' : 'unlock'} size={13} />
				</button>
			</li>
		{:else}
			<p class="px-3 py-6 text-center text-[11px] leading-relaxed text-fg/30">{t('sources.empty')}</p>
		{/each}
	</ul>

	{#snippet footer()}
		<div class="relative" data-add-menu>
			<button
				bind:this={addButton}
				class="studio-icon-btn"
				title={t('sources.addSource')}
				aria-label={t('sources.addSource')}
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
					{#if adding === 'apps'}
						{#each appAudio.apps as app (app.id)}
							<button
								class="block w-full truncate px-3 py-1.5 text-left text-[12px] text-fg/85 hover:bg-primary/15"
								onclick={() => {
									adding = false;
									addAppAudio(app.id, app.name);
								}}>{app.name}</button
							>
						{:else}
							<p class="px-3 py-2 text-[11px] leading-snug text-fg/40">
								{appAudio.error ?? t('mixer.appAudioUnsupported')}
							</p>
						{/each}
					{:else}
						{#each SOURCE_KINDS as source (source.kind)}
							<button
								class="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-primary/15"
								onclick={() => addSource(source.kind)}
							>
								<Icon name={source.icon} size={14} class="mt-0.5 text-fg/45" />
								<span class="min-w-0">
									<span class="block text-[13px] text-fg/90">{source.label()}</span>
									<span class="block text-[11px] text-fg/40">{source.hint()}</span>
								</span>
							</button>
						{/each}
					{/if}
				</div>
			{/if}
		</div>
		<button class="studio-icon-btn" title={t('common.delete')} aria-label={t('common.delete')} disabled={!selected} onclick={() => removeLayer(selected)}><Icon name="trash" /></button>
		<button class="studio-icon-btn" title={t('common.properties')} aria-label={t('common.properties')} disabled={!selected} onclick={onproperties}><Icon name="gear" /></button>
		<span class="mx-1 h-4 w-px bg-ink-600"></span>
		<button class="studio-icon-btn" title={t('common.moveUp')} aria-label={t('common.moveUp')} disabled={selectedIndex <= 0} onclick={() => move(selected, -1)}><Icon name="up" /></button>
		<button
			class="studio-icon-btn"
			title={t('common.moveDown')}
			aria-label={t('common.moveDown')}
			disabled={selectedIndex < 0 || selectedIndex === activeScene().layers.length - 1}
			onclick={() => move(selected, 1)}>↓</button
		>
	{/snippet}
</Dock>
