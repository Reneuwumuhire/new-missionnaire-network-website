<script lang="ts">
	import { onMount } from 'svelte';
	import ControlsDock from './components/ControlsDock.svelte';
	import Icon from './components/Icon.svelte';
	import LyricsPanel from './components/LyricsPanel.svelte';
	import LyricsRibbon from './components/LyricsRibbon.svelte';
	import MediaBar from './components/MediaBar.svelte';
	import MixerDock from './components/MixerDock.svelte';
	import Modal from './components/Modal.svelte';
	import Preview from './components/Preview.svelte';
	import PropertiesPanel from './components/PropertiesPanel.svelte';
	import ScenesDock from './components/ScenesDock.svelte';
	import SettingsPanel from './components/SettingsPanel.svelte';
	import SourcesDock from './components/SourcesDock.svelte';
	import Splitter from './components/Splitter.svelte';
	import TransitionsDock from './components/TransitionsDock.svelte';
	import { stopAppAudio } from './lib/appaudio.svelte';
	import { broadcast, isStreaming, startBroadcast, stopBroadcast, uptimeLabel } from './lib/broadcast.svelte';
	import { frameCount, selectScene, takeToProgram, type TransitionType } from './lib/compositor';
	import { lyrics, step } from './lib/lyrics.svelte';
	import { askForMicrophone, handleFor, mediaVersion, openCamera, releaseAll } from './lib/media.svelte';
	import { Mixer, stripsToDrop } from './lib/mixer';
	import { t } from './lib/i18n.svelte';
	import { clamp, splitWeights, type DockId } from './lib/layout';
	import {
		runAudioSelftest,
		runFetchSelftest,
		runSelftest,
		selftestMixer,
		selftestTarget
	} from './lib/selftest';
	import { activeScene, audioLayers, onAirSceneId, persist, studio } from './lib/state.svelte';

	let programCanvas = $state<HTMLCanvasElement | null>(null);
	let mixer = $state<Mixer | null>(null);
	let now = $state(Date.now());
	let confirmStop = $state(false);
	let dialog = $state<'properties' | 'settings' | null>(null);
	/** Frames actually painted per second — the readout OBS puts in its status
	 *  bar, and the first number to look at when the picture stutters. */
	let renderFps = $state(0);
	/** Frames the compositor should have painted but did not — OBS calls this
	 *  rendering lag, and it is the first thing to look at when the picture
	 *  stutters but the encoder says it is fine. */
	let renderMissed = $state(0);

	onMount(() => {
		mixer = new Mixer();
		selftestMixer(mixer);
		mixer.setMonitor(studio.settings.monitorAudio);
		// The audio context starts suspended until the page has been interacted
		// with; a first click is enough and always happens before going live.
		const wake = () => void mixer?.resume();
		window.addEventListener('pointerdown', wake, { once: true });

		void (async () => {
			const target = await selftestTarget();
			// `STUDIO_SELFTEST=audio` checks the audio chain only — no ffmpeg, no
			// RTMP, nothing that needs a human at the keyboard.
			if (target === 'audio') {
				await runAudioSelftest();
				return;
			}
			// `STUDIO_SELFTEST=fetch` downloads a short clip and proves it can be
			// drawn and captured — no ffmpeg, no RTMP, no human.
			if (target === 'fetch') {
				await runFetchSelftest();
				return;
			}
			if (target) {
				// Diagnostic run: no camera, so nothing blocks on a permission
				// prompt while the broadcast chain is being verified.
				await runSelftest(target, () => programCanvas, () => mixer?.audioTrack);
				return;
			}
			// Ask for the microphone before anything needs it: macOS only lists an
			// application under Privacy & Security once it has asked, and until the
			// answer is yes the engine reports no input devices at all.
			await askForMicrophone();
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
			if (isStreaming()) renderMissed += Math.max(0, studio.settings.fps - renderFps);
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
			// App audio is a worklet the native capture owns, not a device stream.
			// It has no media handle, so without this the reconciler would decide
			// nothing wanted it and tear the strip down a frame after it started.
			if (source.kind === 'app') {
				if (bus.has(source.id)) {
					wanted.add(source.id);
					bus.setLevel(source.id, source.gain, source.muted);
				}
				continue;
			}
			const handle = handleFor(source.id);
			if (!handle?.stream) continue;
			if (bus.addStream(source.id, handle.stream)) {
				wanted.add(source.id);
				bus.setLevel(source.id, source.gain, source.muted);
				// A context still suspended renders nothing at all, so the meter
				// sits flat however loud the room is.
				void bus.resume();
			}
		}
		for (const layer of audioLayers()) {
			const handle = handleFor(layer.id);
			// A shared window's sound is the native app capture, which is already
			// a strip and has no media handle. Claim it first, or the sweep below
			// would tear it down a frame after it started.
			if (bus.has(layer.id)) {
				wanted.add(layer.id);
			} else if (handle?.stream && bus.addStream(layer.id, handle.stream)) {
				wanted.add(layer.id);
			} else if (handle?.el instanceof HTMLVideoElement && !handle.stream) {
				bus.addElement(layer.id, handle.el);
				wanted.add(layer.id);
			}
			if (wanted.has(layer.id)) bus.setLevel(layer.id, layer.gain, layer.muted);
		}
		// Only the scene's own layers come and go. A mic or an application strip
		// is the show's, not the scene's, so cutting to a scene with no audio of
		// its own must never take the preacher off air.
		const globalIds = studio.audioSources.map((source) => source.id);
		for (const existing of stripsToDrop(globalIds, wanted, bus.ids())) {
			bus.remove(existing);
			// Deleting the source, hiding it or cutting to another scene has to
			// stop the capture behind it too — otherwise the application keeps
			// playing into the mix with no strip left to turn it down.
			void stopAppAudio(bus, existing);
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
		if (isStreaming()) {
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
		renderMissed = 0;
		await mixer?.resume();
		await startBroadcast(programCanvas, mixer?.audioTrack);
	}

	const selectedLayer = $derived(
		activeScene().layers.find((l) => l.id === studio.selectedLayerId) ?? null
	);
	const health = $derived.by(() => {
		const stats = broadcast.stats;
		if (!isStreaming()) return { tone: 'idle', label: t('status.offline') };
		if (broadcast.phase === 'connecting') return { tone: 'idle', label: t('status.connecting') };
		if (broadcast.targets.some((target) => target.state === 'failed')) {
			return { tone: 'warn', label: t('target.failed') };
		}
		if (!stats) return { tone: 'idle', label: t('status.connecting') };
		if (stats.discarded_chunks > 0 || stats.speed < 0.9) {
			return { tone: 'warn', label: t('status.behind') };
		}
		return { tone: 'ok', label: t('status.stable') };
	});
	const canTake = $derived(studio.activeSceneId !== onAirSceneId());

	const QUICK: { type: TransitionType; label: () => string }[] = [
		{ type: 'cut', label: () => t('transitions.cut') },
		{ type: 'fade', label: () => t('transitions.fade') },
		{ type: 'fadeToBlack', label: () => t('transitions.fadeToBlack') }
	];

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

<div class="flex h-full flex-col bg-ink-950 font-body text-fg/90">
	<!-- ── Title bar ──────────────────────────────────────── -->
	<header
		data-tauri-drag-region
		class="flex h-9 shrink-0 items-center gap-4 border-b border-ink-700 bg-ink-900 pl-[86px] pr-3"
	>
		<h1 class="pointer-events-none select-none text-[10px] font-semibold uppercase tracking-[0.28em] text-fg/45">
			Missionnaire <span class="text-primary">Studio</span>
		</h1>
		{#if broadcast.phase === 'live'}
			<!-- pointer-events-none so the whole title bar drags, not just the gaps. -->
			<span class="pointer-events-none flex items-center gap-2 bg-red-600/15 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-400">
				<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500"></span>
				{t('status.live')}
				<span class="font-mono tracking-normal text-red-300/80">{uptimeLabel(now)}</span>
			</span>
		{/if}
		<span
			class="pointer-events-none ml-auto text-[10px] {health.tone === 'warn'
				? 'text-amber-400'
				: health.tone === 'ok'
					? 'text-emerald-400'
					: 'text-fg/30'}">{health.label}</span
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
		<div class="flex min-w-0 flex-1 flex-col">
			<LyricsRibbon />
			<div class="flex min-h-0 flex-1 gap-4 bg-ink-950 px-4 pt-1.5">
				{#if studio.settings.studioMode}
					<Preview
						label="{t('preview.preview')}: {activeScene().name}"
						sceneId={() => studio.activeSceneId}
						program={false}
						editable={true}
					/>
					<div class="flex w-32 shrink-0 flex-col justify-center gap-1.5">
						<button
							class="h-10 w-full text-[13px] font-medium leading-tight transition-colors {canTake
								? 'bg-primary text-black hover:bg-missionnaire-400'
								: 'border border-ink-600 text-fg/25'}"
							disabled={!canTake}
							title={t('preview.transitionHint')}
							onclick={() => takeToProgram(studio.activeSceneId)}
						>
							{t('preview.transition')}
						</button>
						<!-- OBS's Quick Transitions: take with a specific transition
						     without disturbing the configured default. -->
						<span class="text-[9px] uppercase tracking-wider text-fg/30">
							{t('transitions.quick')}
						</span>
						{#each QUICK as quick (quick.type)}
							<button
								class="studio-chip w-full justify-center text-[10px] disabled:opacity-30"
								disabled={!canTake}
								onclick={() =>
									takeToProgram(
										studio.activeSceneId,
										quick.type === 'cut' ? 0 : studio.settings.transitionMs,
										undefined,
										quick.type
									)}>{quick.label()}</button
							>
						{/each}
					</div>
					<Preview
						label={t('preview.program')}
						sceneId={onAirSceneId}
						program={true}
						editable={false}
						live={broadcast.phase === 'live'}
						oncanvas={(canvas) => (programCanvas = canvas)}
					/>
				{:else}
					<Preview
						label="{t('preview.program')}: {activeScene().name}"
						sceneId={onAirSceneId}
						program={true}
						editable={true}
						live={broadcast.phase === 'live'}
						oncanvas={(canvas) => (programCanvas = canvas)}
					/>
				{/if}
			</div>

			<!-- The transport sits above the source strip, always in reach: a
			     recording is paused and wound back while the service runs. -->
			<MediaBar />

			<!-- Selected-source strip, where OBS puts its Properties/Filters bar. -->
			<div class="flex h-9 shrink-0 items-center gap-3 border-t border-ink-700 bg-ink-950 px-5">
				<span class="font-mono text-[10px] text-fg/30">
					{t('preview.canvas', { width: studio.settings.width, height: studio.settings.height })}
				</span>
				<span class="h-3 w-px bg-ink-600"></span>
				<span
					class="min-w-0 flex-1 truncate text-[12px] {selectedLayer ? 'text-fg/70' : 'text-fg/25'}"
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
				<h2 class="text-[12px] font-semibold text-fg/80">{t('dock.lyrics')}</h2>
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
			{renderMissed}
		/>
	</div>

	<!-- ── Status bar ─────────────────────────────────────── -->
	<footer
		class="flex h-6 shrink-0 items-center gap-4 border-t border-ink-700 bg-ink-850 px-3 font-mono text-[10px] text-fg/35"
	>
		<span class="flex items-center gap-1.5">
			<span class="h-1.5 w-1.5 rounded-full {broadcast.phase === 'live' ? 'bg-red-500' : 'bg-fg/20'}"></span>
			<!-- Never the word LIVE while off air. It read "LIVE: 00:00:00" with the
			     dot grey and the title bar saying Offline — the one word in this app
			     that must not be on screen when it is not true. -->
			{#if broadcast.phase === 'live'}
				<span class="text-red-400">{t('status.live')}</span>
				{uptimeLabel(now)}
			{:else}
				{t('status.offline')}
			{/if}
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
		<SettingsPanel onclose={() => (dialog = null)} />
	</Modal>
{/if}
