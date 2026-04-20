<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import WaveSurfer from 'wavesurfer.js';
	import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
	import TimelinePlugin from 'wavesurfer.js/dist/plugins/timeline.esm.js';
	import type { Recording } from '$lib/models/recording';
	import { sliceMp3 } from '$lib/audio/mp3-slice';
	import { getCachedPeaks, setCachedPeaks, computePeaksFromMp3 } from '$lib/audio/peaks-cache';

	type Region = {
		start: number;
		end: number;
		setOptions: (opts: { start?: number; end?: number }) => void;
		on: (event: string, cb: () => void) => void;
		remove: () => void;
	};

	let {
		recording,
		onClose,
		onSaved
	}: {
		recording: Recording;
		onClose: () => void;
		onSaved: () => void;
	} = $props();

	let waveformEl: HTMLDivElement | undefined = $state();
	let audioEl: HTMLAudioElement | undefined = $state();
	let ws: WaveSurfer | undefined;
	let regionsPlugin: ReturnType<typeof RegionsPlugin.create> | undefined;
	let region: Region | undefined;

	// Playback (streaming via audio element) and the slicer ArrayBuffer are
	// tracked independently. The audio element plays immediately from S3 via
	// Range requests; the ArrayBuffer is fetched once in the background for
	// both peaks computation (cache miss) and the save-time slice.
	let audioBuffer: ArrayBuffer | undefined;
	let bufferReady = $state(false);
	let bufferError = $state<string | null>(null);
	let decodeProgress = $state<'idle' | 'decoding' | 'done'>('idle');
	let loadError = $state<string | null>(null);
	let fromCache = $state(false);

	let ready = $state(false);
	let playing = $state(false);
	let totalSec = $state(0);
	let currentSec = $state(0);
	let startSec = $state(0);
	let endSec = $state(0);

	let zoom = $state(0); // pixels per second; 0 = fit
	let saving = $state(false);
	let uploadPct = $state<number | null>(null);
	let saveError = $state<string | null>(null);

	onMount(async () => {
		if (!recording.s3_url || !recording.s3_key) {
			loadError = 'Enregistrement sans fichier audio';
			return;
		}
		await tick(); // ensure audioEl + waveformEl are bound
		try {
			await boot();
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Chargement audio échoué';
		}
	});

	async function boot() {
		const key = recording.s3_key!;
		const url = recording.s3_url!;

		// Fastest path: peaks precomputed server-side at upload (or on the
		// previous trim save) and stored inline on the recording doc.
		// Every admin gets an instant waveform with no decode work.
		if (recording.peaks && recording.peaks.length > 0) {
			fromCache = true;
			const duration = recording.peaks_duration_sec ?? recording.duration_sec ?? 0;
			await initWaveSurfer([recording.peaks], duration);
			fetchAudioBytes(url).catch((err) => {
				bufferError = err instanceof Error ? err.message : 'Téléchargement audio échoué';
			});
			return;
		}

		// Second-fastest: local IndexedDB cache from a prior decode in this
		// browser. Covers recordings created before server-side peaks landed.
		const cached = await getCachedPeaks(key);
		if (cached) {
			fromCache = true;
			await initWaveSurfer(cached.peaks, cached.duration);
			fetchAudioBytes(url).catch((err) => {
				bufferError = err instanceof Error ? err.message : 'Téléchargement audio échoué';
			});
			return;
		}

		// Cold path: fetch bytes once, decode peaks, cache, then init. The
		// streaming <audio> preview stays visible and playable throughout.
		const buf = await fetchAudioBytes(url);
		decodeProgress = 'decoding';
		const decoded = await computePeaksFromMp3(buf);
		decodeProgress = 'done';
		setCachedPeaks(key, decoded); // fire and forget
		await initWaveSurfer(decoded.peaks, decoded.duration);
	}

	async function fetchAudioBytes(url: string): Promise<ArrayBuffer> {
		const res = await fetch(url);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const buf = await res.arrayBuffer();
		audioBuffer = buf;
		bufferReady = true;
		return buf;
	}

	async function initWaveSurfer(peaks: number[][], duration: number) {
		if (!waveformEl || !audioEl) return;

		regionsPlugin = RegionsPlugin.create();
		const timeline = TimelinePlugin.create({ height: 18 });

		// Passing `media: audioEl` + precomputed `peaks` + `duration` tells
		// wavesurfer to skip its internal fetch/decode entirely — it uses our
		// audio element for playback and our peaks for the waveform display.
		ws = WaveSurfer.create({
			container: waveformEl,
			media: audioEl,
			peaks,
			duration,
			waveColor: '#d6d3d1',
			progressColor: '#a8a29e',
			cursorColor: '#7c3f2f',
			cursorWidth: 2,
			height: 96,
			barWidth: 2,
			barRadius: 1,
			barGap: 1,
			plugins: [regionsPlugin, timeline]
		});

		ws.on('ready', () => {
			totalSec = duration;
			startSec = 0;
			endSec = totalSec;
			region = regionsPlugin!.addRegion({
				start: 0,
				end: totalSec,
				color: 'rgba(34, 139, 87, 0.18)',
				drag: true,
				resize: true
			}) as unknown as Region;
			region.on('update-end', () => {
				if (!region) return;
				startSec = region.start;
				endSec = region.end;
				if (currentSec < startSec || currentSec > endSec) ws?.setTime(startSec);
			});
			ready = true;
		});

		ws.on('play', () => (playing = true));
		ws.on('pause', () => (playing = false));
		ws.on('timeupdate', (time) => {
			currentSec = time;
			if (playing && time >= endSec) {
				ws?.pause();
				ws?.setTime(startSec);
			}
		});
		ws.on('finish', () => {
			playing = false;
			ws?.setTime(startSec);
		});
	}

	onDestroy(() => {
		try {
			ws?.destroy();
		} catch {
			// ignore — teardown may race with pending loads
		}
	});

	function togglePlay() {
		if (!ws || !ready) return;
		if (playing) {
			ws.pause();
			return;
		}
		if (currentSec < startSec || currentSec >= endSec) ws.setTime(startSec);
		ws.play();
	}

	function skip(delta: number) {
		if (!ws || !ready) return;
		const next = Math.max(startSec, Math.min(endSec, currentSec + delta));
		ws.setTime(next);
	}

	function resetRange() {
		if (!region) return;
		region.setOptions({ start: 0, end: totalSec });
		startSec = 0;
		endSec = totalSec;
		ws?.setTime(0);
	}

	function formatTime(sec: number): string {
		if (!Number.isFinite(sec) || sec < 0) return '0:00';
		const h = Math.floor(sec / 3600);
		const m = Math.floor((sec % 3600) / 60);
		const s = Math.floor(sec % 60);
		const ms = Math.floor((sec - Math.floor(sec)) * 1000);
		const base = h > 0
			? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
			: `${m}:${s.toString().padStart(2, '0')}`;
		return `${base}.${ms.toString().padStart(3, '0')}`;
	}

	function parseTime(input: string): number | null {
		// Accept "123", "1:23", "1:23.456", "1:02:03".
		const trimmed = input.trim();
		if (!trimmed) return null;
		const parts = trimmed.split(':');
		if (parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
		const nums = parts.map((p) => Number(p));
		if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
		let total = 0;
		if (nums.length === 1) total = nums[0];
		else if (nums.length === 2) total = nums[0] * 60 + nums[1];
		else if (nums.length === 3) total = nums[0] * 3600 + nums[1] * 60 + nums[2];
		else return null;
		return total;
	}

	function onStartInput(e: Event) {
		const v = parseTime((e.target as HTMLInputElement).value);
		if (v === null) return;
		const clamped = Math.max(0, Math.min(v, endSec - 0.1));
		startSec = clamped;
		region?.setOptions({ start: clamped });
	}

	function onEndInput(e: Event) {
		const v = parseTime((e.target as HTMLInputElement).value);
		if (v === null) return;
		const clamped = Math.max(startSec + 0.1, Math.min(v, totalSec));
		endSec = clamped;
		region?.setOptions({ end: clamped });
	}

	function applyZoom(px: number) {
		zoom = px;
		ws?.zoom(px);
	}

	function putWithProgress(url: string, blob: Blob, contentType: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			xhr.open('PUT', url);
			xhr.setRequestHeader('Content-Type', contentType);
			xhr.upload.onprogress = (e) => {
				if (e.lengthComputable) uploadPct = Math.round((e.loaded / e.total) * 100);
			};
			xhr.onload = () => {
				if (xhr.status >= 200 && xhr.status < 300) resolve();
				else reject(new Error(`Upload S3 (${xhr.status})`));
			};
			xhr.onerror = () => reject(new Error('Erreur réseau pendant le téléversement'));
			xhr.onabort = () => reject(new Error('Téléversement interrompu'));
			xhr.send(blob);
		});
	}

	async function waitForBuffer(): Promise<ArrayBuffer> {
		if (audioBuffer) return audioBuffer;
		if (bufferError) throw new Error(bufferError);
		// Background fetch not done yet — poll every 200ms. The fetch is
		// already running from onMount, so this just yields to it.
		return new Promise((resolve, reject) => {
			const timer = setInterval(() => {
				if (audioBuffer) {
					clearInterval(timer);
					resolve(audioBuffer);
				} else if (bufferError) {
					clearInterval(timer);
					reject(new Error(bufferError));
				}
			}, 200);
		});
	}

	async function save() {
		if (!recording._id || saving) return;
		if (endSec - startSec < 0.5) {
			saveError = 'La plage conservée doit faire au moins 0,5 s';
			return;
		}
		saving = true;
		saveError = null;
		uploadPct = null;
		try {
			const buf = await waitForBuffer();
			const blob = sliceMp3(buf, startSec, endSec);
			const durationSec = Math.floor(endSec - startSec);
			if (durationSec < 1) {
				saveError = 'Durée conservée trop courte (< 1 s)';
				return;
			}

			const presignRes = await fetch(`/api/recordings/${recording._id}/audio/upload-url`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ contentType: 'audio/mpeg' })
			});
			if (!presignRes.ok) throw new Error((await presignRes.text()) || `Presign ${presignRes.status}`);
			const { uploadUrl, s3Key } = (await presignRes.json()) as { uploadUrl: string; s3Key: string };

			uploadPct = 0;
			// Upload and peaks generation for the trimmed file in parallel —
			// both read from `blob` independently, so we don't want to do
			// them serially. The freshly-computed peaks go to the server so
			// every admin sees the new waveform instantly.
			const blobBuf = await blob.arrayBuffer();
			const [newPeaks] = await Promise.all([
				computePeaksFromMp3(blobBuf).catch(() => null),
				putWithProgress(uploadUrl, blob, 'audio/mpeg')
			]);

			const finalizeRes = await fetch(`/api/recordings/${recording._id}/audio/finalize`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					s3_key: s3Key,
					size_bytes: blob.size,
					duration_sec: durationSec,
					peaks: newPeaks?.peaks[0] ?? null,
					peaks_duration_sec: newPeaks?.duration ?? null
				})
			});
			if (!finalizeRes.ok) throw new Error((await finalizeRes.text()) || `Finalize ${finalizeRes.status}`);

			// Refresh the local cache so reopening this admin's browser hits
			// the new peaks immediately, matching the new s3_key that the
			// finalize endpoint just wrote.
			if (newPeaks) {
				const newS3Key = s3Key;
				setCachedPeaks(newS3Key, newPeaks);
			}

			onSaved();
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Enregistrement échoué';
		} finally {
			saving = false;
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget && !saving) onClose();
	}

	function handleBackdropKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && !saving) onClose();
	}
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/50 p-4"
	role="dialog"
	aria-modal="true"
	aria-labelledby="trim-title"
	tabindex="-1"
	onclick={handleBackdropClick}
	onkeydown={handleBackdropKey}
>
	<div class="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden bg-white shadow-2xl">
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-stone-100 px-6 py-4">
			<div>
				<h2 id="trim-title" class="text-sm font-semibold uppercase tracking-[0.15em] text-stone-700">
					Éditer l'audio
				</h2>
				<p class="mt-0.5 truncate text-xs text-stone-500">{recording.title}</p>
			</div>
			<button
				type="button"
				onclick={onClose}
				disabled={saving}
				class="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 hover:text-stone-700 disabled:opacity-50"
			>
				Fermer
			</button>
		</div>

		<!-- Body -->
		<div class="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
			{#if loadError}
				<p class="bg-red-50 px-3 py-2 text-xs text-red-700">{loadError}</p>
			{/if}

			<!-- Audio element is always mounted so wavesurfer can attach to it as
			     `media:`. Before wavesurfer is ready we expose native controls so
			     the admin can play/scrub immediately via streaming Range requests;
			     once wavesurfer takes over we hide its UI. -->
			<audio
				bind:this={audioEl}
				src={recording.s3_url}
				preload="metadata"
				controls={!ready}
				class:hidden={ready}
				class="mb-4 w-full"
			></audio>

			{#if !ready && !loadError}
				<div class="mb-5 flex items-center gap-3 border border-stone-200 bg-cream/30 px-4 py-3">
					<div class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-stone-200 border-t-primary"></div>
					<p class="text-[11px] text-stone-600">
						{#if fromCache}
							Chargement de la forme d'onde (cache)…
						{:else if decodeProgress === 'decoding'}
							Décodage de la forme d'onde…
						{:else}
							Téléchargement de l'audio — vous pouvez écouter en streaming ci-dessus.
						{/if}
					</p>
				</div>
			{/if}

			<div class="flex flex-col gap-4" class:hidden={!ready}>
				<!-- Waveform -->
				<div class="border border-stone-200 bg-stone-50 p-3">
					<div bind:this={waveformEl} class="min-h-[120px]"></div>
				</div>

				<!-- Transport + zoom -->
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div class="flex items-center gap-2">
						<button
							type="button"
							onclick={() => skip(-10)}
							disabled={saving}
							class="flex h-9 w-9 items-center justify-center border border-stone-200 bg-white text-stone-600 hover:border-primary hover:text-primary disabled:opacity-50"
							aria-label="Reculer de 10 s"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 19l-7-7 7-7m6 14l-7-7 7-7" stroke-linecap="round" stroke-linejoin="round"/></svg>
						</button>
						<button
							type="button"
							onclick={togglePlay}
							disabled={saving}
							class="flex h-10 w-10 items-center justify-center bg-primary text-white hover:bg-missionnaire-600 disabled:opacity-50"
							aria-label={playing ? 'Pause' : 'Lecture'}
						>
							{#if playing}
								<svg class="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
							{:else}
								<svg class="ml-0.5 h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
							{/if}
						</button>
						<button
							type="button"
							onclick={() => skip(10)}
							disabled={saving}
							class="flex h-9 w-9 items-center justify-center border border-stone-200 bg-white text-stone-600 hover:border-primary hover:text-primary disabled:opacity-50"
							aria-label="Avancer de 10 s"
						>
							<svg class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M13 5l7 7-7 7M7 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>
						</button>
						<span class="ml-2 text-[11px] tabular-nums text-stone-500">
							{formatTime(currentSec)} / {formatTime(totalSec)}
						</span>
					</div>

					<div class="flex items-center gap-2 text-[10px] uppercase tracking-wider text-stone-500">
						<span>Zoom</span>
						<input
							type="range"
							min="0"
							max="200"
							step="5"
							value={zoom}
							oninput={(e) => applyZoom(Number((e.target as HTMLInputElement).value))}
							disabled={saving}
							class="h-1 w-32 cursor-pointer appearance-none bg-stone-200"
							aria-label="Zoom"
						/>
					</div>
				</div>

				<!-- Trim inputs -->
				<div class="grid grid-cols-1 gap-3 border border-stone-200 bg-white p-4 sm:grid-cols-3">
					<div class="flex flex-col gap-1.5">
						<label for="trim-start" class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Début</label>
						<input
							id="trim-start"
							type="text"
							value={formatTime(startSec).replace(/\.\d+$/, '')}
							onchange={onStartInput}
							disabled={saving}
							class="admin-input font-mono text-sm tabular-nums"
							placeholder="0:00"
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<label for="trim-end" class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Fin</label>
						<input
							id="trim-end"
							type="text"
							value={formatTime(endSec).replace(/\.\d+$/, '')}
							onchange={onEndInput}
							disabled={saving}
							class="admin-input font-mono text-sm tabular-nums"
							placeholder="1:23"
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<span class="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Durée conservée</span>
						<div class="flex items-center justify-between gap-2 border border-stone-200 bg-stone-50 px-3 py-2">
							<span class="font-mono text-sm tabular-nums text-stone-700">
								{formatTime(Math.max(0, endSec - startSec)).replace(/\.\d+$/, '')}
							</span>
							<button
								type="button"
								onclick={resetRange}
								disabled={saving}
								class="text-[10px] font-semibold uppercase tracking-[0.15em] text-stone-500 hover:text-primary disabled:opacity-50"
							>
								Réinitialiser
							</button>
						</div>
					</div>
				</div>

				<p class="text-[10px] leading-relaxed text-stone-500">
					Le fichier MP3 sera réécrit à l'enregistrement. Précision au niveau de la trame
					(~26 ms). L'ancien fichier sera définitivement remplacé.
				</p>

				{#if uploadPct !== null}
					<div class="flex flex-col gap-1">
						<div class="flex items-center justify-between text-[10px] font-mono text-stone-500 tabular-nums">
							<span>{uploadPct < 100 ? 'Téléversement…' : 'Finalisation…'}</span>
							<span>{uploadPct}%</span>
						</div>
						<div class="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
							<div class="h-full bg-primary transition-[width] duration-150 ease-out" style:width="{uploadPct}%"></div>
						</div>
					</div>
				{/if}

				{#if saveError}
					<p class="bg-red-50 px-3 py-2 text-xs text-red-700">{saveError}</p>
				{/if}
			</div>
		</div>

		<!-- Footer -->
		<div class="flex items-center justify-end gap-2 border-t border-stone-100 px-6 py-4">
			<button
				type="button"
				onclick={onClose}
				disabled={saving}
				class="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-50"
			>
				Annuler
			</button>
			<button
				type="button"
				onclick={save}
				disabled={saving || !ready}
				class="bg-primary px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white hover:bg-missionnaire-600 disabled:opacity-50"
			>
				{#if saving && !bufferReady}
					Finalisation du téléchargement…
				{:else if saving}
					Enregistrement…
				{:else}
					Enregistrer
				{/if}
			</button>
		</div>
	</div>
</div>

<style>
	/* Make wavesurfer region handles obvious — YouTube Studio-style
	   grippy vertical bars at the start and end of the keep range. The
	   Regions plugin injects the handles with inline styles, so we
	   need !important to override its 6px hairline default. */
	:global(div[part="region"] [data-resize]),
	:global(div[part="region"] [part="region-handle-left"]),
	:global(div[part="region"] [part="region-handle-right"]) {
		width: 12px !important;
		background-color: #7c3f2f !important;
		border: none !important;
		opacity: 1 !important;
		box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9);
	}
	:global(div[part="region"] [data-resize="left"]) {
		cursor: ew-resize !important;
		border-radius: 3px 0 0 3px !important;
	}
	:global(div[part="region"] [data-resize="right"]) {
		cursor: ew-resize !important;
		border-radius: 0 3px 3px 0 !important;
	}
	/* Gripper dots on the handles so they read as draggable. */
	:global(div[part="region"] [data-resize])::before {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		width: 2px;
		height: 18px;
		background-image: radial-gradient(circle, rgba(255, 255, 255, 0.9) 1px, transparent 1px);
		background-size: 2px 4px;
		background-repeat: repeat-y;
		transform: translate(-50%, -50%);
	}
	/* Region fill a touch more saturated so start/end edges stand out. */
	:global(div[part="region"]) {
		background-color: rgba(34, 139, 87, 0.22) !important;
		border-left: 2px solid #228b57;
		border-right: 2px solid #228b57;
	}
</style>
