<script lang="ts">
	import { onMount } from 'svelte';
	import DestinationsPanel from './components/DestinationsPanel.svelte';
	import LyricsPanel from './components/LyricsPanel.svelte';
	import MixerPanel from './components/MixerPanel.svelte';
	import Preview from './components/Preview.svelte';
	import PropertiesPanel from './components/PropertiesPanel.svelte';
	import ScenePanel from './components/ScenePanel.svelte';
	import SettingsPanel from './components/SettingsPanel.svelte';
	import { broadcast, startBroadcast, stopBroadcast, uptimeLabel } from './lib/broadcast.svelte';
	import { beginTransition, startRenderLoop } from './lib/compositor';
	import { lyrics, step } from './lib/lyrics.svelte';
	import { handleFor, mediaVersion, openCamera, releaseAll } from './lib/media.svelte';
	import { Mixer } from './lib/mixer';
	import { runSelftest, selftestTarget } from './lib/selftest';
	import { liveAudioLayers, persist, studio } from './lib/state.svelte';

	let programCanvas = $state<HTMLCanvasElement | null>(null);
	let mixer = $state<Mixer | null>(null);
	let now = $state(Date.now());
	let tab = $state<'lyrics' | 'properties' | 'destinations' | 'settings'>('lyrics');
	let confirmStop = $state(false);

	const TABS: [typeof tab, string][] = [
		['lyrics', 'Paroles'],
		['properties', 'Propriétés'],
		['destinations', 'Destinations'],
		['settings', 'Réglages']
	];

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

		const clock = setInterval(() => (now = Date.now()), 500);
		return () => {
			clearInterval(clock);
			window.removeEventListener('pointerdown', wake);
			void stopBroadcast();
			releaseAll();
			mixer?.close();
		};
	});

	$effect(() => {
		if (!programCanvas) return;
		return startRenderLoop(programCanvas, () => studio.settings.fps);
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
		return (
			el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
		);
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
		if (/^[1-9]$/.test(event.key)) {
			const scene = studio.scenes[Number(event.key) - 1];
			if (scene && scene.id !== studio.activeSceneId) {
				beginTransition(studio.activeSceneId, studio.settings.transitionMs);
				studio.activeSceneId = scene.id;
				studio.selectedLayerId = null;
				persist();
			}
		}
	}

	async function toggleLive() {
		if (broadcast.live) {
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

	const enabledCount = $derived(studio.destinations.filter((d) => d.enabled && d.url.trim()).length);
	const health = $derived.by(() => {
		const stats = broadcast.stats;
		if (!broadcast.live || !stats) return { tone: 'idle', label: 'Hors ligne' };
		if (stats.discarded_chunks > 0 || stats.speed < 0.9) {
			return { tone: 'warn', label: 'Encodage en retard' };
		}
		return { tone: 'ok', label: 'Stable' };
	});
</script>

<svelte:window onkeydown={onKeydown} />

<div class="flex h-full flex-col bg-ink-950 font-body text-white/90">
	<!-- ── Title bar ──────────────────────────────────────── -->
	<header
		data-tauri-drag-region
		class="flex shrink-0 items-center gap-4 border-b border-ink-700 bg-ink-900 py-2 pl-[86px] pr-3"
	>
		<h1 class="pointer-events-none select-none text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">
			Missionnaire <span class="text-primary">Studio</span>
		</h1>

		{#if broadcast.live}
			<span class="flex items-center gap-2 bg-red-600/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-red-400">
				<span class="h-2 w-2 animate-pulse rounded-full bg-red-500"></span>
				En direct
				<span class="font-mono tracking-normal text-red-300/80">{uptimeLabel(now)}</span>
			</span>
		{/if}

		<div class="ml-auto flex items-center gap-3">
			{#if broadcast.stats}
				<span class="font-mono text-[11px] text-white/35">
					{Math.round(broadcast.stats.fps)} fps · {Math.round(broadcast.stats.bitrate_kbps)} kbps
				</span>
			{/if}
			<span
				class="text-[11px] {health.tone === 'warn'
					? 'text-amber-400'
					: health.tone === 'ok'
						? 'text-emerald-400'
						: 'text-white/30'}">{health.label}</span
			>
			<button
				class="h-9 px-5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors {broadcast.live
					? confirmStop
						? 'bg-red-600 text-white'
						: 'border border-red-500/50 text-red-400 hover:bg-red-600/15'
					: 'bg-primary text-black hover:bg-missionnaire-400'} disabled:opacity-40"
				disabled={broadcast.starting || (!broadcast.live && enabledCount === 0)}
				onclick={toggleLive}
			>
				{#if broadcast.starting}
					Démarrage…
				{:else if broadcast.live}
					{confirmStop ? 'Confirmer l’arrêt' : 'Arrêter'}
				{:else}
					Passer en direct{enabledCount > 1 ? ` (${enabledCount})` : ''}
				{/if}
			</button>
		</div>
	</header>

	{#if broadcast.error}
		<div class="flex shrink-0 items-start gap-3 border-b border-red-500/30 bg-red-950/40 px-4 py-2">
			<p class="flex-1 text-[12px] leading-relaxed text-red-300">{broadcast.error}</p>
			<button class="studio-icon-btn" aria-label="Fermer" onclick={() => (broadcast.error = null)}>×</button>
		</div>
	{/if}

	<!-- ── Body ───────────────────────────────────────────── -->
	<div class="flex min-h-0 flex-1">
		<aside class="w-60 shrink-0 border-r border-ink-700 bg-ink-900">
			<ScenePanel />
		</aside>

		<main class="flex min-w-0 flex-1 flex-col">
			<div class="min-h-0 flex-[1.6]">
				<Preview oncanvas={(canvas) => (programCanvas = canvas)} />
			</div>
			<div class="min-h-0 flex-1 border-t border-ink-700 bg-ink-900">
				<MixerPanel {mixer} />
			</div>
		</main>

		<aside class="flex w-[26rem] shrink-0 flex-col border-l border-ink-700 bg-ink-900">
			<nav class="flex shrink-0 border-b border-ink-700">
				{#each TABS as [value, label] (value)}
					<button
						class="flex-1 border-b-2 px-2 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors {tab ===
						value
							? 'border-primary text-white'
							: 'border-transparent text-white/45 hover:text-white/80'}"
						onclick={() => (tab = value)}>{label}</button
					>
				{/each}
			</nav>
			<div class="flex min-h-0 flex-1 flex-col">
				{#if tab === 'lyrics'}
					<LyricsPanel />
				{:else if tab === 'properties'}
					<PropertiesPanel />
				{:else if tab === 'destinations'}
					<DestinationsPanel />
				{:else}
					<SettingsPanel />
				{/if}
			</div>
		</aside>
	</div>

	<!-- ── Status bar ─────────────────────────────────────── -->
	<footer
		class="flex shrink-0 items-center gap-4 border-t border-ink-700 bg-ink-900 px-4 py-1.5 font-mono text-[10px] text-white/30"
	>
		<span>{studio.settings.width}×{studio.settings.height} · {studio.settings.fps} fps</span>
		<span>{studio.settings.encoder === 'hardware' ? 'matériel' : 'x264'}</span>
		<span>{enabledCount} destination{enabledCount > 1 ? 's' : ''}</span>
		{#if broadcast.stats}
			<span class={broadcast.stats.dropped_frames > 0 ? 'text-amber-400' : ''}>
				{broadcast.stats.dropped_frames} img. perdues
			</span>
			<span class={broadcast.stats.discarded_chunks > 0 ? 'text-amber-400' : ''}>
				{broadcast.stats.discarded_chunks} blocs abandonnés
			</span>
		{/if}
		<span class="ml-auto font-body">
			Espace = ligne suivante · 1-9 = scène
		</span>
	</footer>
</div>
