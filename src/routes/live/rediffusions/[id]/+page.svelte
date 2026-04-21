<script lang="ts">
	import type { PageData } from './$types';
	import { downloadAudioFile } from '../../../../utils/downloadAudio';
	import {
		selectAudio,
		playlist,
		basePlaylist,
		currentIndex,
		isPlaying
	} from '$lib/stores/global';
	import type { MusicAudio } from '$lib/models/music-audio';
	import { derived } from 'svelte/store';

	export let data: PageData;

	$: rec = data.recording;

	let thumbnailExpanded = false;
	let thumbnailBroken = false;

	// ── Audio player ───────────────────────────────────────────────
	// Route playback through the global AudioPlayer (bottom bar) so
	// listeners get the same experience as the music/predications
	// pages: ±5s skip buttons, keyboard shortcuts, MediaSession
	// controls on lock-screen/Bluetooth/car head-unit, and the OS
	// resume-after-interruption logic. The rediffusion is shaped as a
	// single-item MusicAudio-compatible entry so it plugs into the
	// existing selectAudio/playlist stores without special-casing.
	$: playable = {
		_id: rec.id,
		book: null,
		book_full_name: null,
		number: null,
		title: rec.title,
		artist: 'Missionnaire Network',
		category: 'Direct',
		s3_key: '',
		s3_url: rec.s3_url,
		file_size: rec.size_bytes ?? 0,
		duration: rec.duration_sec ?? undefined,
		format: 'mp3',
		uploaded_at: new Date(rec.started_at),
		thumbnail_url: rec.thumbnail_url ?? undefined
	} satisfies MusicAudio & { thumbnail_url?: string };

	// Is *this* recording currently loaded into the global player? Used
	// to flip the button label between "Écouter" and the play/pause
	// state the bottom bar is showing.
	const isCurrent = derived(selectAudio, ($sel) => {
		if (!$sel) return false;
		const url = 's3_url' in $sel ? $sel.s3_url : '';
		return url === rec?.s3_url;
	});

	function playRecording() {
		if ($isCurrent) {
			// Same track — toggle play/pause on the active element.
			isPlaying.update((v) => !v);
			return;
		}
		const single = [playable] as unknown as MusicAudio[];
		basePlaylist.set(single);
		playlist.set(single);
		currentIndex.set(0);
		selectAudio.set(playable as unknown as MusicAudio);
		isPlaying.set(true);
	}

	// ── Download state ─────────────────────────────────────────────
	// Background fetch: stream the mp3, track bytes loaded, hand the
	// assembled blob to a synthetic <a download> so the browser saves
	// it without navigating away. Logic lives in utils/downloadAudio.ts.
	let isDownloading = false;
	let downloadPercent: number | null = 0;
	let downloadLoaded = 0;
	let downloadError = '';
	let downloadController: AbortController | null = null;

	function formatDownloadedBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} o`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
		return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
	}

	async function downloadAudio() {
		if (!rec.s3_url) return;
		// Click while in-flight = cancel.
		if (isDownloading && downloadController) {
			downloadController.abort();
			return;
		}
		const controller = new AbortController();
		downloadController = controller;
		isDownloading = true;
		downloadPercent = 0;
		downloadLoaded = 0;
		downloadError = '';
		try {
			await downloadAudioFile(rec.s3_url, rec.title, {
				signal: controller.signal,
				totalBytesHint: rec.size_bytes ?? 0,
				onProgress: (p) => {
					downloadPercent = p.percent;
					downloadLoaded = p.loaded;
				}
			});
		} catch (err) {
			// User-cancelled: leave row state clean, skip the error banner.
			if (!controller.signal.aborted) {
				console.error('[archive/download]', err);
				downloadError = 'Téléchargement impossible. Réessayez dans un instant.';
			}
		} finally {
			downloadController = null;
			isDownloading = false;
			setTimeout(() => {
				if (!isDownloading) {
					downloadPercent = 0;
					downloadLoaded = 0;
				}
			}, 800);
		}
	}

	function openThumbnail() {
		if (!rec.thumbnail_url || thumbnailBroken) return;
		thumbnailExpanded = true;
	}
	function closeThumbnail() {
		thumbnailExpanded = false;
	}
	function onLightboxKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeThumbnail();
	}
	function onBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) closeThumbnail();
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('fr-FR', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}

	function formatDuration(sec: number | null): string {
		if (!sec) return '—';
		const h = Math.floor(sec / 3600);
		const m = Math.floor((sec % 3600) / 60);
		return h > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${m} min`;
	}

	function formatBytes(bytes: number | null): string | null {
		if (!bytes) return null;
		const units = ['o', 'Ko', 'Mo', 'Go'];
		let n = bytes;
		let i = 0;
		while (n >= 1024 && i < units.length - 1) {
			n /= 1024;
			i++;
		}
		// 1 decimal for >= 1 Mo, integer for smaller
		const formatted = i >= 2 ? n.toFixed(1) : Math.round(n).toString();
		return `${formatted} ${units[i]}`;
	}
</script>

<svelte:head>
	<title>{rec.title} - Missionnaire Network</title>
	<meta name="description" content="Réécoutez le direct audio du {formatDate(rec.started_at)}." />
	<link rel="canonical" href="https://missionnaire.net/live/rediffusions/{rec.id}" />
	{#if rec.thumbnail_url}
		<meta property="og:image" content={rec.thumbnail_url} />
	{/if}
</svelte:head>

<svelte:window on:keydown={onLightboxKeydown} />

<section class="w-full py-10 px-6">
	<div class="max-w-3xl mx-auto">
		<div class="mb-8">
			<a
				href="/live/rediffusions"
				class="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] font-body text-missionnaire/80 hover:text-missionnaire transition-colors"
			>
				← Tous les directs
			</a>
		</div>

		<div class="text-center mb-10">
			<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-3 font-body">
				Direct précédent
			</p>
			<h1 class="font-display text-2xl md:text-3xl font-semibold text-stone-900">{rec.title}</h1>
			<p class="mt-3 text-sm text-stone-400 font-body">
				{formatDate(rec.started_at)} · {formatDuration(rec.duration_sec)}
			</p>
		</div>

		<!-- Thumbnail + Player: side-by-side on desktop, stacked on mobile -->
		<div class="flex flex-col md:flex-row md:items-stretch gap-4">
			<!-- Thumbnail (click to expand) -->
			<div class="md:w-64 md:shrink-0">
				{#if rec.thumbnail_url && !thumbnailBroken}
					<button
						type="button"
						on:click={openThumbnail}
						aria-label="Agrandir la vignette"
						class="group relative aspect-video w-full overflow-hidden border border-stone-200/60 bg-stone-100 cursor-zoom-in transition-all duration-300 hover:border-missionnaire/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40"
					>
						<img
							src={rec.thumbnail_url}
							alt=""
							on:error={() => (thumbnailBroken = true)}
							class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
							loading="eager"
						/>
						<span
							class="pointer-events-none absolute inset-0 flex items-end justify-end p-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
						>
							<span
								class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 shadow"
							>
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
									class="text-stone-700"
								>
									<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
								</svg>
							</span>
						</span>
					</button>
				{:else}
					<div
						class="default-thumbnail relative aspect-video w-full overflow-hidden border border-stone-200/60"
					>
						<div class="absolute inset-0 flex flex-col items-center justify-center gap-2">
							<picture>
								<source srcset="/icons/logo.webp" type="image/webp" />
								<img
									src="/icons/logo.png"
									alt=""
									class="h-9 w-auto opacity-90"
									width="150"
									height="64"
								/>
							</picture>
							<span
								class="text-[9px] font-bold uppercase tracking-[0.25em] text-missionnaire/70 font-body"
							>
								Archive
							</span>
						</div>
						<svg
							class="absolute top-2 right-2 h-3 w-3 text-missionnaire/30"
							viewBox="0 0 14 14"
							fill="currentColor"
							aria-hidden="true"
						>
							<path d="M7 0L8.5 5.5L14 7L8.5 8.5L7 14L5.5 8.5L0 7L5.5 5.5L7 0Z" />
						</svg>
					</div>
				{/if}
			</div>

			<!-- Player + download (one card, download is a divided footer row so
			     the player stretches to match the thumbnail height without leaving
			     dead space around the audio element). -->
			<div class="flex-1 flex flex-col border border-stone-200/60 bg-white/40">
				<div class="flex-1 flex items-center justify-center px-4 py-6 md:px-5">
					<button
						type="button"
						on:click={playRecording}
						aria-label={$isCurrent && $isPlaying
							? 'Mettre en pause'
							: $isCurrent
								? 'Reprendre la lecture'
								: 'Écouter ce direct'}
						class="play-cta group inline-flex items-center gap-3 bg-missionnaire px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] font-body text-white transition-all hover:bg-missionnaire/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40 active:scale-95"
					>
						{#if $isCurrent && $isPlaying}
							<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<rect x="6" y="5" width="4" height="14" rx="1" />
								<rect x="14" y="5" width="4" height="14" rx="1" />
							</svg>
							<span>En lecture — pause</span>
						{:else}
							<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
								<path d="M8 5v14l11-7z" />
							</svg>
							<span>{$isCurrent ? 'Reprendre' : 'Écouter'}</span>
						{/if}
					</button>
				</div>
				<button
					type="button"
					on:click={downloadAudio}
					aria-label={isDownloading
						? downloadPercent !== null
							? `Annuler le téléchargement (${downloadPercent}%)`
							: `Annuler le téléchargement — ${formatDownloadedBytes(downloadLoaded)}`
						: 'Télécharger le direct'}
					class="download-row group relative flex items-center justify-center gap-2 border-t border-stone-200/60 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.2em] font-body text-stone-600 transition-colors hover:bg-missionnaire hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40"
					style={isDownloading && downloadPercent !== null ? `--progress: ${downloadPercent}%` : ''}
				>
					{#if isDownloading}
						{#if downloadPercent !== null}
							<span class="download-fill" aria-hidden="true"></span>
						{:else}
							<span class="download-fill download-fill-indeterminate" aria-hidden="true"></span>
						{/if}
						<span class="relative z-10 flex items-center gap-2">
							<!-- Stop square: the spinner next to "Téléchargement" doubles as
							     a cancel indicator since the entire row is now clickable to
							     abort. Hover fills the row red to reinforce the cancel intent. -->
							<svg
								class="h-3 w-3 animate-spin group-hover:animate-none"
								viewBox="0 0 24 24"
								fill="none"
								aria-hidden="true"
							>
								<circle
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="3"
									stroke-dasharray="42 62"
									stroke-linecap="round"
									class="group-hover:hidden"
								/>
								<rect
									x="7"
									y="7"
									width="10"
									height="10"
									fill="currentColor"
									class="hidden group-hover:block"
								/>
							</svg>
							<span class="group-hover:hidden">Téléchargement</span>
							<span class="hidden group-hover:inline">Annuler</span>
							{#if downloadPercent !== null}
								<span class="tabular-nums">{downloadPercent}%</span>
							{:else}
								<span class="tabular-nums">{formatDownloadedBytes(downloadLoaded)}</span>
							{/if}
						</span>
					{:else}
						<svg
							width="13"
							height="13"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							aria-hidden="true"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 4v12m0 0l-4-4m4 4l4-4"
							/>
						</svg>
						Télécharger
						{#if rec.size_bytes}
							<span class="font-normal tracking-normal text-stone-400 group-hover:text-white/80"
								>· {formatBytes(rec.size_bytes)}</span
							>
						{/if}
					{/if}
				</button>
				{#if downloadError}
					<p
						class="border-t border-red-200 bg-red-50 px-5 py-2 text-[11px] text-red-600 font-body text-center"
					>
						{downloadError}
					</p>
				{/if}
			</div>
		</div>

		{#if rec.description}
			<div class="mt-10 border border-stone-200/60 bg-white/40 p-6">
				<p
					class="text-[10px] font-bold uppercase tracking-[0.25em] text-missionnaire/80 font-body mb-3"
				>
					À propos de ce direct
				</p>
				<p class="text-sm text-stone-700 font-body leading-relaxed whitespace-pre-wrap">
					{rec.description}
				</p>
			</div>
		{/if}
	</div>
</section>

{#if thumbnailExpanded && rec.thumbnail_url && !thumbnailBroken}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-lightbox-in"
		on:click={onBackdropClick}
		on:keydown={onLightboxKeydown}
		role="dialog"
		aria-modal="true"
		aria-label="Vignette du direct"
		tabindex="-1"
	>
		<button
			type="button"
			on:click={closeThumbnail}
			aria-label="Fermer"
			class="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
		>
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M6 6l12 12M6 18L18 6" />
			</svg>
		</button>
		<img
			src={rec.thumbnail_url}
			alt={rec.title}
			on:error={() => {
				thumbnailBroken = true;
				closeThumbnail();
			}}
			class="max-h-[90vh] max-w-[90vw] object-contain shadow-2xl"
		/>
	</div>
{/if}

<style>
	.default-thumbnail {
		background:
			radial-gradient(circle at 30% 20%, rgba(255, 136, 12, 0.08), transparent 60%),
			linear-gradient(135deg, #faf6f1 0%, #f1eae0 100%);
	}
	.animate-lightbox-in {
		animation: lightbox-fade 0.18s ease-out;
	}
	@keyframes lightbox-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	/* Download button doubles as an inline progress bar: a pseudo-fill
	   grows from left to right driven by the --progress CSS variable. */
	.download-row {
		overflow: hidden;
	}
	/* Cancel affordance on hover during download: flip the whole row to a
	   stop-red so "Annuler" reads unambiguously. */
	.download-row:hover .download-fill,
	.download-row:hover .download-fill-indeterminate {
		background: rgba(220, 38, 38, 0.25);
	}
	.download-fill {
		position: absolute;
		inset: 0;
		width: var(--progress, 0%);
		background: rgba(255, 136, 12, 0.18);
		transition: width 0.25s ease-out;
		pointer-events: none;
	}
	/* Indeterminate mode (Content-Length unknown): a 30% wide band
	   slides back and forth so the listener still sees movement. */
	.download-fill-indeterminate {
		width: 30%;
		animation: download-slide 1.3s ease-in-out infinite;
	}
	@keyframes download-slide {
		0% {
			transform: translateX(-110%);
		}
		50% {
			transform: translateX(250%);
		}
		100% {
			transform: translateX(-110%);
		}
	}
</style>
