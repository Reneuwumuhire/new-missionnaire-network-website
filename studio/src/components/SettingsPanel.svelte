<script lang="ts">
	import { onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { broadcast, pickMimeType } from '../lib/broadcast.svelte';
	import { DEFAULT_LAYOUT } from '../lib/layout';
	import { persist, studio } from '../lib/state.svelte';

	interface FfmpegInfo {
		path: string;
		version: string;
		hardware_h264: boolean;
	}

	let ffmpeg = $state<FfmpegInfo | null>(null);
	let ffmpegError = $state<string | null>(null);
	const mime = pickMimeType();

	onMount(async () => {
		try {
			ffmpeg = await invoke<FfmpegInfo>('check_ffmpeg');
			if (!ffmpeg.hardware_h264 && studio.settings.encoder === 'hardware') {
				studio.settings.encoder = 'software';
				persist();
			}
		} catch (err) {
			ffmpegError = String(err);
		}
	});

	const RESOLUTIONS: [number, number, string][] = [
		[854, 480, '480p'],
		[1280, 720, '720p'],
		[1920, 1080, '1080p']
	];

	// Bitrates that YouTube recommends and that a modest upstream can hold.
	const SUGGESTED: Record<string, number> = { '480p': 1800, '720p': 3500, '1080p': 6000 };

	function setResolution(width: number, height: number, label: string) {
		studio.settings.width = width;
		studio.settings.height = height;
		studio.settings.videoBitrateKbps = SUGGESTED[label];
		persist();
	}
</script>

<div class="space-y-5 p-4">
	{#if broadcast.live}
		<p class="border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
			Les réglages d’encodage s’appliqueront à la prochaine diffusion.
		</p>
	{/if}

	<div>
		<span class="studio-label">Résolution</span>
		<div class="flex gap-1">
			{#each RESOLUTIONS as [width, height, label] (label)}
				<button
					class="studio-chip flex-1 {studio.settings.width === width ? 'bg-primary/20 text-primary' : ''}"
					onclick={() => setResolution(width, height, label)}>{label}</button
				>
			{/each}
		</div>
	</div>

	<div>
		<span class="studio-label">Images par seconde</span>
		<div class="flex gap-1">
			{#each [24, 25, 30, 60] as fps (fps)}
				<button
					class="studio-chip flex-1 {studio.settings.fps === fps ? 'bg-primary/20 text-primary' : ''}"
					onclick={() => {
						studio.settings.fps = fps;
						persist();
					}}>{fps}</button
				>
			{/each}
		</div>
	</div>

	<label class="block">
		<span class="studio-label">Débit vidéo — {studio.settings.videoBitrateKbps} kbps</span>
		<input
			type="range"
			min="800"
			max="9000"
			step="100"
			class="w-full accent-primary"
			value={studio.settings.videoBitrateKbps}
			oninput={(e) => {
				studio.settings.videoBitrateKbps = Number((e.currentTarget as HTMLInputElement).value);
				persist();
			}}
		/>
		<span class="text-[11px] text-white/30">
			Prévoyez au moins {Math.round((studio.settings.videoBitrateKbps + studio.settings.audioBitrateKbps) * 1.3 / 100) / 10} Mbps
			d’envoi réel.
		</span>
	</label>

	<div>
		<span class="studio-label">Débit audio</span>
		<div class="flex gap-1">
			{#each [96, 128, 160, 192] as kbps (kbps)}
				<button
					class="studio-chip flex-1 {studio.settings.audioBitrateKbps === kbps
						? 'bg-primary/20 text-primary'
						: ''}"
					onclick={() => {
						studio.settings.audioBitrateKbps = kbps;
						persist();
					}}>{kbps}</button
				>
			{/each}
		</div>
	</div>

	<div>
		<span class="studio-label">Encodeur</span>
		<div class="flex gap-1">
			<button
				class="studio-chip flex-1 {studio.settings.encoder === 'hardware' ? 'bg-primary/20 text-primary' : ''}"
				disabled={ffmpeg ? !ffmpeg.hardware_h264 : false}
				onclick={() => {
					studio.settings.encoder = 'hardware';
					persist();
				}}>Matériel</button
			>
			<button
				class="studio-chip flex-1 {studio.settings.encoder === 'software' ? 'bg-primary/20 text-primary' : ''}"
				onclick={() => {
					studio.settings.encoder = 'software';
					persist();
				}}>Logiciel (x264)</button
			>
		</div>
		<p class="mt-1 text-[11px] text-white/30">
			Matériel décharge le processeur. Passez en logiciel si l’image saccade.
		</p>
	</div>

	<label class="block">
		<span class="studio-label">Fondu entre scènes — {studio.settings.transitionMs} ms</span>
		<input
			type="range"
			min="0"
			max="1500"
			step="50"
			class="w-full accent-primary"
			value={studio.settings.transitionMs}
			oninput={(e) => {
				studio.settings.transitionMs = Number((e.currentTarget as HTMLInputElement).value);
				persist();
			}}
		/>
		<span class="text-[11px] text-white/30">0 = coupure franche.</span>
	</label>

	<div class="border-t border-ink-700 pt-4">
		<span class="studio-label">Disposition</span>
		<button
			class="studio-chip"
			onclick={() => {
				studio.settings.layout = { ...DEFAULT_LAYOUT, weights: { ...DEFAULT_LAYOUT.weights } };
				persist();
			}}>Réinitialiser les panneaux</button
		>
		<p class="mt-1 text-[11px] text-white/30">
			Faites glisser les séparateurs entre les panneaux pour les redimensionner.
		</p>
	</div>

	<!-- ── Diagnostics ───────────────────────────────────── -->
	<div class="space-y-1.5 border-t border-ink-700 pt-4 font-mono text-[11px]">
		<span class="studio-label font-body">Système</span>
		{#if ffmpegError}
			<p class="text-red-400">{ffmpegError}</p>
		{:else if ffmpeg}
			<p class="text-white/45">{ffmpeg.version}</p>
			<p class="text-white/25">{ffmpeg.path}</p>
			<p class="text-white/45">
				Encodage matériel : {ffmpeg.hardware_h264 ? 'disponible' : 'indisponible'}
			</p>
		{:else}
			<p class="text-white/30">Vérification…</p>
		{/if}
		<p class="text-white/45">Capture : {mime ?? 'indisponible'}</p>
	</div>

	{#if broadcast.command.length > 0}
		<details class="border-t border-ink-700 pt-4">
			<summary class="cursor-pointer text-[11px] text-white/40">Commande ffmpeg</summary>
			<pre class="mt-2 overflow-x-auto whitespace-pre-wrap break-all bg-ink-900 p-2 font-mono text-[10px] text-white/40">{broadcast.command.join(
					' '
				)}</pre>
		</details>
	{/if}

	{#if broadcast.log.length > 0}
		<details class="border-t border-ink-700 pt-4">
			<summary class="cursor-pointer text-[11px] text-white/40">Journal ffmpeg ({broadcast.log.length})</summary>
			<pre class="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap break-all bg-ink-900 p-2 font-mono text-[10px] text-white/40">{broadcast.log
					.slice(-40)
					.join('\n')}</pre>
		</details>
	{/if}
</div>
