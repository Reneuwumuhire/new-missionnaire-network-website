<script lang="ts">
	import { onMount } from 'svelte';
	import ControlsDock from './components/ControlsDock.svelte';
	import Icon from './components/Icon.svelte';
	import LyricsPanel from './components/LyricsPanel.svelte';
	import MixerDock from './components/MixerDock.svelte';
	import Modal from './components/Modal.svelte';
	import Preview from './components/Preview.svelte';
	import PropertiesPanel from './components/PropertiesPanel.svelte';
	import ScenesDock from './components/ScenesDock.svelte';
	import SettingsPanel from './components/SettingsPanel.svelte';
	import SourcesDock from './components/SourcesDock.svelte';
	import Splitter from './components/Splitter.svelte';
	import TransitionsDock from './components/TransitionsDock.svelte';
	import { broadcast, startBroadcast, stopBroadcast, uptimeLabel } from './lib/broadcast.svelte';
	import { frameCount, selectScene, takeToProgram } from './lib/compositor';
	import { lyrics, step } from './lib/lyrics.svelte';
	import { handleFor, mediaVersion, openCamera, releaseAll } from './lib/media.svelte';
	import { Mixer } from './lib/mixer';
	import { t } from './lib/i18n.svelte';
	import { clamp, splitWeights, type DockId } from './lib/layout';
	import { runSelftest, selftestTarget } from './lib/selftest';
	import { activeScene, liveAudioLayers, onAirSceneId, persist, studio } from './lib/state.svelte';

	let programCanvas = $state<HTMLCanvasElement | null>(null);
	let mixer = $state<Mixer | null>(null);
	let now = $state(Date.now());
	let confirmStop = $state(false);
	let dialog = $state<'properties' | 'settings' | null>(null);
	/** Frames actually painted per second — the readout OBS puts in its status
	 *  bar, and the first number to look at when the picture stutters. */
	let renderFps = $state(0);

	onMount(() => {
		mixer = new Mixer();
		mixer.setMonitor(studio.settings.monitorAudio);
		// The audio context starts suspended until the page has been interacted
		// with; a first click is enough and always happens before going live.
		const wake = () => void mixer?.resume();
		window.addEventListener('pointerdown', wake, { once: true });

		void (async () => {
			const target = await selftestTarget();
			if (target) {
				// Diagnostic run: no camera, so nothing blocks on a permission
				// prompt while the broadcast chain is being verified.
				await runSelftest(target, () => programCanvas, () => mixer?.audioTrack);
				return;
			}
			// Bring cameras up straight away so the operator sees a picture without
			// hunting for a button. Each layer opens its own stream; if a device is
			// already taken the layer says so instead of failing silently.
			for (const scene of studio.scenes) {
				for (const layer of scene.layers) {
					if (layer.kind === 'camera') {
						void openCamera(layer, studio.settings.width, studio.settings.height);
					}
				}
			}
		})();

		let lastFrames = frameCount();
		const clock = setInterval(() => {
			now = Date.now();
			const frames = frameCount();
			// Two canvases are painting in Studio Mode; report per-canvas rate.
			renderFps = Math.round((frames - lastFrames) / (studio.settings.studioMode ? 2 : 1));
			lastFrames = frames;
		}, 1000);
		return () => {
			clearInterval(clock);
			window.removeEventListener('pointerdown', wake);
			void stopBroadcast();
			releaseAll();
			mixer?.close();
		};
	});

	// Keep the mixer's strips in step with what is actually on air. Reads
	// mediaVersion so a source connecting or dying re-runs this.
	$effect(() => {
		void mediaVersion.n;
		const bus = mixer;
		if (!bus) return;
		const wanted = new Set<string>();

		for (const source of studio.audioSources) {
			const handle = handleFor(source.id);
			if (!handle?.stream) continue;
			if (bus.addStream(source.id, handle.stream)) {
				wanted.add(source.id);
				bus.setLevel(source.id, source.gain, source.muted);
			}
		}
		for (const layer of liveAudioLayers()) {
			const handle = handleFor(layer.id);
			if (handle?.stream && bus.addStream(layer.id, handle.stream)) {
				wanted.add(layer.id);
			} else if (handle?.el instanceof HTMLVideoElement && !handle.stream) {
				bus.addElement(layer.id, handle.el);
				wanted.add(layer.id);
			}
			if (wanted.has(layer.id)) bus.setLevel(layer.id, layer.gain, layer.muted);
		}
		for (const existing of bus.ids()) {
			if (!wanted.has(existing)) bus.remove(existing);
		}
	});

	function isTyping(target: EventTarget | null): boolean {
		const el = target as HTMLElement | null;
		if (!el) return false;
		return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
	}

	function onKeydown(event: KeyboardEvent) {
		if (isTyping(event.target) || event.metaKey || event.ctrlKey) return;
		// Advancing lyrics is the one thing an operator does constantly, so it
		// gets the biggest key on the keyboard.
		if (event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowRight') {
			if (lyrics.mode === 'manual') {
				event.preventDefault();
				step(1);
			}
			return;
		}
		if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
			if (lyrics.mode === 'manual') {
				event.preventDefault();
				step(-1);
			}
			return;
		}
		if (event.key === 'Enter' && studio.settings.studioMode) {
			event.preventDefault();
			takeToProgram(studio.activeSceneId);
			return;
		}
		if (/^[1-9]$/.test(event.key)) {
			const scene = studio.scenes[Number(event.key) - 1];
			if (scene) selectScene(scene.id);
		}
	}

	async function toggleLive() {
		if (broadcast.live) {
			// A misclick must not end a service; the button asks once.
			if (!confirmStop) {
				confirmStop = true;
				setTimeout(() => (confirmStop = false), 4000);
				return;
			}
			confirmStop = false;
			await stopBroadcast();
			return;
		}
		if (!programCanvas) return;
		await mixer?.resume();
		await startBroadcast(programCanvas, mixer?.audioTrack);
	}

	const selectedLayer = $derived(
		activeScene().layers.find((l) => l.id === studio.selectedLayerId) ?? null
	);
	const health = $derived.by(() => {
		const stats = broadcast.stats;
		if (!broadcast.live) return { tone: 'idle', label: t('status.offline') };
		if (!stats) return { tone: 'idle', label: t('status.connecting') };
		if (stats.discarded_chunks > 0 || stats.speed < 0.9) {
			return { tone: 'warn', label: t('status.behind') };
		}
		return { tone: 'ok', label: t('status.stable') };
	});
	const canTake = $derived(studio.activeSceneId !== onAirSceneId());

	// ── Panel resizing ────────────────────────────────────
	let dockRow = $state<HTMLDivElement | null>(null);
	const layout = $derived(studio.settings.layout);

	/** Dragging down grows the preview, so the dock row loses that much. Capped
	 *  so neither the docks nor the preview can be squeezed out of existence. */
	function resizeDockRow(delta: number) {
		layout.dockHeight = clamp(layout.dockHeight - delta, 120, window.innerHeight - 320);
		persist();
	}

	function resizeLyrics(delta: number) {
		layout.lyricsWidth = clamp(layout.lyricsWidth - delta, 240, window.innerWidth - 560);
		persist();
	}

	function resizeDocks(left: DockId, right: DockId, delta: number) {
		const total = Object.values(layout.weights).reduce((sum, w) => sum + w, 0);
		const pxPerWeight = (dockRow?.clientWidth ?? 0) / total;
		const [a, b] = splitWeights(layout.weights[left], layout.weights[right], delta, pxPerWeight);
		layout.weights[left] = a;
		layout.weights[right] = b;
		persist();
	}

</script>

<svelte:window onkeydown={onKeydown} />

<div class="flex h-full flex-col bg-ink-950 font-body text-white/90">
	<!-- ── Title bar ──────────────────────────────────────── -->
	<header
		data-tauri-drag-region
		class="flex h-9 shrink-0 items-center gap-4 border-b border-ink-700 bg-ink-900 pl-[86px] pr-3"
	>
		<h1 class="pointer-events-none select-none text-[10px] font-semibold uppercase tracking-[0.28em] text-white/45">
			Missionnaire <span class="text-primary">Studio</span>
		</h1>
		{#if broadcast.live}
			<span class="flex items-center gap-2 bg-red-600/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-400">
				<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500"></span>
				{t('status.live')}
				<span class="font-mono tracking-normal text-red-300/80">{uptimeLabel(now)}</span>
			</span>
		{/if}
		<span
			class="ml-auto text-[10px] {health.tone === 'warn'
				? 'text-amber-400'
				: health.tone === 'ok'
					? 'text-emerald-400'
					: 'text-white/30'}">{health.label}</span
		>
	</header>

	{#if broadcast.error}
		<div class="flex shrink-0 items-start gap-3 border-b border-red-500/30 bg-red-950/40 px-4 py-2">
			<p class="flex-1 text-[12px] leading-relaxed text-red-300">{broadcast.error}</p>
			<button class="studio-icon-btn" aria-label={t('common.close')} onclick={() => (broadcast.error = null)}><Icon name="close" /></button>
		</div>
	{/if}

	<!-- ── Preview + lyrics ───────────────────────────────── -->
	<div class="flex min-h-0 flex-1">
		<div class="flex min-w-0 flex-1 flex-col bg-black/40 px-4 pb-1 pt-1.5">
			<div class="flex min-h-0 flex-1 gap-4">
				{#if studio.settings.studioMode}
					<Preview
						label="{t('preview.preview')}: {activeScene().name}"
						sceneId={() => studio.activeSceneId}
						program={false}
						editable={true}
					/>
					<div class="flex shrink-0 flex-col justify-center">
						<button
							class="h-10 w-28 text-[13px] font-medium leading-tight transition-colors {canTake
								? 'bg-primary text-black hover:bg-missionnaire-400'
								: 'border border-ink-600 text-white/25'}"
							disabled={!canTake}
							title={t('preview.transitionHint')}
							onclick={() => takeToProgram(studio.activeSceneId)}
						>
							{t('preview.transition')}
						</button>
					</div>
					<Preview
						label={t('preview.program')}
						sceneId={onAirSceneId}
						program={true}
						editable={false}
						live={broadcast.live}
						oncanvas={(canvas) => (programCanvas = canvas)}
					/>
				{:else}
					<Preview
						label="{t('preview.program')}: {activeScene().name}"
						sceneId={onAirSceneId}
						program={true}
						editable={true}
						live={broadcast.live}
						oncanvas={(canvas) => (programCanvas = canvas)}
					/>
				{/if}
			</div>

			<!-- Selected-source strip, where OBS puts its Properties/Filters bar. -->
			<div class="mt-1.5 flex h-8 shrink-0 items-center gap-3 border-t border-ink-700 px-1 pt-1">
				<span class="font-mono text-[10px] text-white/30">
					{t('preview.canvas', { width: studio.settings.width, height: studio.settings.height })}
				</span>
				<span class="h-3 w-px bg-ink-600"></span>
				<span
					class="min-w-0 flex-1 truncate text-[12px] {selectedLayer ? 'text-white/70' : 'text-white/25'}"
					>{selectedLayer ? selectedLayer.name : t('preview.noSource')}</span
				>
				<button class="studio-chip" disabled={!selectedLayer} onclick={() => (dialog = 'properties')}>
					{t('common.properties')}
				</button>
			</div>
		</div>

		<Splitter orientation="vertical" label={t('splitter.lyrics')} onmove={resizeLyrics} />

		<aside class="flex shrink-0 flex-col bg-ink-900" style="width: {layout.lyricsWidth}px">
			<div class="flex h-8 shrink-0 items-center border-b border-ink-700 bg-ink-850 px-3">
				<h2 class="text-[12px] font-semibold text-white/80">{t('dock.lyrics')}</h2>
			</div>
			<div class="flex min-h-0 flex-1 flex-col">
				<LyricsPanel />
			</div>
		</aside>
	</div>

	<!-- ── Dock row ───────────────────────────────────────── -->
	<Splitter orientation="horizontal" label={t('splitter.docks')} onmove={resizeDockRow} />

	<div
		bind:this={dockRow}
		class="flex shrink-0 bg-ink-900"
		style="height: {layout.dockHeight}px"
	>
		<ScenesDock />
		<Splitter orientation="vertical" label={t('splitter.between', { name: t('dock.scenes') })} onmove={(d) => resizeDocks('scenes', 'sources', d)} />
		<SourcesDock onproperties={() => (dialog = 'properties')} />
		<Splitter orientation="vertical" label={t('splitter.between', { name: t('dock.sources') })} onmove={(d) => resizeDocks('sources', 'mixer', d)} />
		<MixerDock {mixer} />
		<Splitter orientation="vertical" label={t('splitter.between', { name: t('dock.audioMixer') })} onmove={(d) => resizeDocks('mixer', 'transition', d)} />
		<TransitionsDock />
		<Splitter orientation="vertical" label={t('splitter.between', { name: t('dock.sceneTransitions') })} onmove={(d) => resizeDocks('transition', 'controls', d)} />
		<ControlsDock
			{confirmStop}
			onToggleLive={toggleLive}
			onSettings={() => (dialog = 'settings')}
		/>
	</div>

	<!-- ── Status bar ─────────────────────────────────────── -->
	<footer
		class="flex h-6 shrink-0 items-center gap-4 border-t border-ink-700 bg-ink-850 px-3 font-mono text-[10px] text-white/35"
	>
		<span class="flex items-center gap-1.5">
			<span class="h-1.5 w-1.5 rounded-full {broadcast.live ? 'bg-red-500' : 'bg-white/20'}"></span>
			{t('status.live')}: {uptimeLabel(now)}
		</span>
		<span class={renderFps > 0 && renderFps < studio.settings.fps - 5 ? 'text-amber-400' : ''}>
			{t('status.fps', { actual: renderFps, target: studio.settings.fps })}
		</span>
		{#if broadcast.stats}
			<span>{t('status.bitrate', { kbps: Math.round(broadcast.stats.bitrate_kbps) })}</span>
			<span class={broadcast.stats.dropped_frames > 0 ? 'text-amber-400' : ''}>
				{t('status.dropped', { count: broadcast.stats.dropped_frames })}
			</span>
			<span class={broadcast.stats.discarded_chunks > 0 ? 'text-amber-400' : ''}>
				{t('status.discarded', { count: broadcast.stats.discarded_chunks })}
			</span>
		{/if}
		<span class="ml-auto font-body">
			{studio.settings.studioMode ? t('status.shortcutsStudio') : t('status.shortcuts')}
		</span>
	</footer>
</div>

{#if dialog === 'properties'}
	<Modal title={t('props.title')} onclose={() => (dialog = null)}>
		<PropertiesPanel />
	</Modal>
{:else if dialog === 'settings'}
	<Modal title={t('settings.title')} onclose={() => (dialog = null)}>
		<SettingsPanel />
	</Modal>
{/if}
