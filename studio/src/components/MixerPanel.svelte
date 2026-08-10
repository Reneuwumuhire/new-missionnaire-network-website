<script lang="ts">
	import { onMount } from 'svelte';
	import { handleFor, listDevices, mediaVersion, openMic, release, type DeviceOption } from '../lib/media.svelte';
	import type { Mixer } from '../lib/mixer';
	import { activeScene, id, persist, studio, type AudioSource, type Layer } from '../lib/state.svelte';

	let { mixer }: { mixer: Mixer | null } = $props();

	let inputs = $state<DeviceOption[]>([]);
	let peaks = $state<Record<string, number>>({});

	onMount(() => {
		void refreshDevices();
		// 30 Hz is enough for a meter to look alive without burning a core.
		const timer = setInterval(() => {
			if (!mixer) return;
			const next: Record<string, number> = {};
			for (const stripId of mixer.ids()) next[stripId] = mixer.peak(stripId);
			peaks = next;
		}, 33);
		return () => clearInterval(timer);
	});

	async function refreshDevices() {
		inputs = await listDevices('audioinput');
	}

	async function connect(source: AudioSource) {
		await openMic(source.id, source.deviceId);
		// Labels stay blank until permission is granted, so re-read after.
		await refreshDevices();
	}

	function addMic() {
		studio.audioSources = [
			...studio.audioSources,
			{ id: id(), name: `Micro ${studio.audioSources.length + 1}`, gain: 1, muted: false }
		];
		persist();
	}

	function removeMic(source: AudioSource) {
		release(source.id);
		mixer?.remove(source.id);
		studio.audioSources = studio.audioSources.filter((s) => s.id !== source.id);
		persist();
	}

	const liveLayers = $derived(activeScene().layers.filter((l) => l.hasAudio));

	function stripLabel(layer: Layer): string {
		void mediaVersion.n;
		const handle = handleFor(layer.id);
		if (handle?.error) return handle.error;
		if (!mixer?.has(layer.id)) return 'Pas de piste audio';
		return '';
	}

	function meterClass(peak: number): string {
		if (peak > 0.95) return 'bg-red-500';
		if (peak > 0.75) return 'bg-amber-400';
		return 'bg-emerald-400';
	}
</script>

<section class="flex h-full min-h-0 flex-col">
	<header class="flex items-center justify-between border-b border-ink-700 px-3 py-2">
		<h2 class="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Mixage audio</h2>
		<div class="flex items-center gap-3">
			<label class="flex cursor-pointer items-center gap-1.5 text-[11px] text-white/50">
				<input
					type="checkbox"
					class="accent-primary"
					checked={studio.settings.monitorAudio}
					onchange={(e) => {
						studio.settings.monitorAudio = (e.currentTarget as HTMLInputElement).checked;
						mixer?.setMonitor(studio.settings.monitorAudio);
						persist();
					}}
				/>
				Écoute locale
			</label>
			<button class="studio-icon-btn" title="Ajouter un micro" aria-label="Ajouter un micro" onclick={addMic}>+</button>
		</div>
	</header>

	{#if studio.settings.monitorAudio}
		<p class="border-b border-amber-500/20 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-300/90">
			Écoute locale active — utilisez un casque, sinon le micro capte les haut-parleurs.
		</p>
	{/if}

	<div class="min-h-0 flex-1 overflow-y-auto">
		{#each studio.audioSources as source (source.id)}
			{@const connected = mixer?.has(source.id) ?? false}
			<div class="group flex items-center gap-3 border-b border-ink-800 px-3 py-2.5">
				<div class="w-40 shrink-0">
					<div class="flex items-center gap-1">
						<span class="h-1.5 w-1.5 shrink-0 rounded-full {connected ? 'bg-emerald-400' : 'bg-white/20'}"></span>
						<input
							class="studio-input-flush min-w-0 flex-1"
							value={source.name}
							onchange={(e) => {
								source.name = (e.currentTarget as HTMLInputElement).value;
								persist();
							}}
						/>
					</div>
					<select
						class="studio-input-flush mt-0.5 w-full text-[11px] text-white/40"
						value={source.deviceId ?? ''}
						onchange={(e) => {
							source.deviceId = (e.currentTarget as HTMLSelectElement).value || undefined;
							persist();
							void connect(source);
						}}
					>
						<option value="">Entrée par défaut</option>
						{#each inputs as device (device.deviceId)}
							<option value={device.deviceId}>{device.label}</option>
						{/each}
					</select>
				</div>

				{#if connected}
					<div class="h-2 min-w-0 flex-1 bg-ink-800">
						<div
							class="h-full transition-[width] duration-75 {meterClass(peaks[source.id] ?? 0)}"
							style="width: {Math.min(100, (peaks[source.id] ?? 0) * 100)}%"
						></div>
					</div>
					<input
						type="range"
						min="0"
						max="1.5"
						step="0.01"
						class="w-28 accent-primary"
						value={source.gain}
						oninput={(e) => {
							source.gain = Number((e.currentTarget as HTMLInputElement).value);
							mixer?.setLevel(source.id, source.gain, source.muted);
							persist();
						}}
					/>
					<button
						class="studio-chip {source.muted ? 'bg-red-500/20 text-red-300' : ''}"
						onclick={() => {
							source.muted = !source.muted;
							mixer?.setLevel(source.id, source.gain, source.muted);
							persist();
						}}>{source.muted ? 'Coupé' : 'Ouvert'}</button
					>
				{:else}
					<button class="studio-chip flex-1 text-left" onclick={() => connect(source)}>
						{handleFor(source.id)?.error ?? 'Connecter le micro'}
					</button>
				{/if}
				<button class="studio-icon-btn opacity-0 group-hover:opacity-100" title="Retirer" aria-label="Retirer" onclick={() => removeMic(source)}
					>×</button
				>
			</div>
		{/each}

		{#each liveLayers as layer (layer.id)}
			{@const note = stripLabel(layer)}
			<div class="flex items-center gap-3 border-b border-ink-800 px-3 py-2.5">
				<div class="w-40 shrink-0">
					<p class="truncate text-sm text-white/80">{layer.name}</p>
					<p class="truncate text-[11px] text-white/35">{note || 'Source de la scène'}</p>
				</div>
				{#if !note}
					<div class="h-2 min-w-0 flex-1 bg-ink-800">
						<div
							class="h-full transition-[width] duration-75 {meterClass(peaks[layer.id] ?? 0)}"
							style="width: {Math.min(100, (peaks[layer.id] ?? 0) * 100)}%"
						></div>
					</div>
					<input
						type="range"
						min="0"
						max="1.5"
						step="0.01"
						class="w-28 accent-primary"
						value={layer.gain}
						oninput={(e) => {
							layer.gain = Number((e.currentTarget as HTMLInputElement).value);
							mixer?.setLevel(layer.id, layer.gain, layer.muted);
							persist();
						}}
					/>
					<button
						class="studio-chip {layer.muted ? 'bg-red-500/20 text-red-300' : ''}"
						onclick={() => {
							layer.muted = !layer.muted;
							mixer?.setLevel(layer.id, layer.gain, layer.muted);
							persist();
						}}>{layer.muted ? 'Coupé' : 'Ouvert'}</button
					>
				{:else}
					<div class="flex-1"></div>
				{/if}
			</div>
		{/each}
	</div>
</section>
