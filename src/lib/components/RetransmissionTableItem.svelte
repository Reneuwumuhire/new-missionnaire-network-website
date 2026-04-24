<script lang="ts">
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import IoCloudDownloadOutline from 'svelte-icons-pack/io/IoCloudDownloadOutline';
	import IoPlayCircle from 'svelte-icons-pack/io/IoPlayCircle';
	import IoPauseCircle from 'svelte-icons-pack/io/IoPauseCircle';
	import { selectAudio, isPlaying, currentIndex } from '../stores/global';
	import type { PublishedRecording } from '$lib/server/recordings';
	import type { AudioAsset } from '$lib/models/media-assets';
	import type { MusicAudio } from '$lib/models/music-audio';
	import type { Sermon } from '$lib/models/sermon';
	import { formatTime } from '../../utils/FormatTime';
	import { dispatchAudioPlayerAction } from '$lib/utils/audioPlayerControls';
	import { downloadAudioFile } from '../../utils/downloadAudio';

	export let recording: PublishedRecording;
	export let index: number;
	export let absoluteIndex: number;

	const desktopSermonGrid = 'md:grid-cols-[30px_minmax(0,2.5fr)_minmax(0,1.35fr)_110px_80px_120px]';

	// Shape the recording as a MusicAudio-compatible entry so it slots into
	// the same global audio-player stores the sermon + music pages use.
	$: playable = {
		_id: recording.id,
		book: null,
		book_full_name: null,
		number: null,
		title: recording.title,
		artist: 'Missionnaire Network',
		category: 'Direct',
		s3_key: '',
		s3_url: recording.s3_url,
		file_size: recording.size_bytes ?? 0,
		duration: recording.duration_sec ?? undefined,
		format: 'mp3',
		uploaded_at: new Date(recording.started_at),
		thumbnail_url: recording.thumbnail_url ?? undefined
	} satisfies MusicAudio & { thumbnail_url?: string };

	$: isActive = isRecordingActive($selectAudio);

	function isRecordingActive(current: Sermon | AudioAsset | MusicAudio | null): boolean {
		if (!current) return false;
		const currentUrl =
			'mp3_url' in current
				? current.mp3_url
				: 's3_url' in current
					? current.s3_url
					: null;
		return currentUrl === recording.s3_url;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			togglePlay();
		}
	}

	function togglePlay() {
		if (!recording.s3_url) return;
		if (isActive) {
			dispatchAudioPlayerAction('toggle');
			return;
		}
		currentIndex.set(index);
		selectAudio.set(playable as unknown as MusicAudio);
		isPlaying.set(true);
	}

	// Download state mirrors SermonTableItem so the row visual is identical.
	let isDownloading = false;
	let downloadPercent: number | null = 0;
	let downloadController: AbortController | null = null;

	async function downloadMp3() {
		if (isDownloading && downloadController) {
			downloadController.abort();
			return;
		}
		if (!recording.s3_url) return;
		const controller = new AbortController();
		downloadController = controller;
		isDownloading = true;
		downloadPercent = 0;
		try {
			await downloadAudioFile(recording.s3_url, recording.title, {
				signal: controller.signal,
				totalBytesHint: recording.size_bytes ?? 0,
				onProgress: (p) => (downloadPercent = p.percent)
			});
		} catch (err) {
			if (!controller.signal.aborted) console.error('[retransmission/download]', err);
		} finally {
			downloadController = null;
			isDownloading = false;
			setTimeout(() => {
				if (!isDownloading) downloadPercent = 0;
			}, 800);
		}
	}

	function formatDateCode(iso: string): string {
		// Compact dd.mm.yyyy matching the `full_date_code` style used by the
		// sermon row, so the Date column lines up visually across both views.
		const d = new Date(iso);
		const day = String(d.getUTCDate()).padStart(2, '0');
		const month = String(d.getUTCMonth() + 1).padStart(2, '0');
		return `${day}.${month}.${d.getUTCFullYear()}`;
	}
</script>

<!-- svelte-ignore a11y-no-noninteractive-tabindex -->
<div
	class="grid grid-cols-[30px_1fr_auto_auto] {desktopSermonGrid} gap-2 md:gap-4 px-3 md:px-4 py-3 md:py-4 items-center transition-all group cursor-pointer {isActive
		? 'bg-orange-50/80 border-l-4 border-l-orange-500'
		: 'hover:bg-gray-50'}"
	on:click={togglePlay}
	on:keydown={handleKeydown}
	role="button"
	tabindex="0"
	aria-label="Lire la retransmission {recording.title}"
>
	<div
		class="text-center text-[10px] md:text-xs font-bold {isActive
			? 'text-orange-600'
			: 'text-gray-300'}"
	>
		{absoluteIndex}
	</div>

	<div class="flex flex-col min-w-0">
		<a
			href={`/live/rediffusions/${recording.id}`}
			class="text-sm font-bold line-clamp-1 transition-colors {isActive
				? 'text-orange-600'
				: 'text-gray-800 group-hover:text-orange-600'} hover:underline underline-offset-2"
			on:click|stopPropagation
		>
			{recording.title}
		</a>
		<div
			class="flex flex-row items-center gap-2 md:hidden overflow-hidden text-ellipsis whitespace-nowrap"
		>
			<span class="text-[10px] font-medium {isActive ? 'text-orange-400' : 'text-gray-500'}">
				{formatDateCode(recording.started_at)}
			</span>
			{#if recording.duration_sec}
				<span class="text-[10px] text-gray-300">•</span>
				<span class="text-[10px] font-mono {isActive ? 'text-orange-300' : 'text-gray-400'}">
					{formatTime(recording.duration_sec)}
				</span>
			{/if}
			<span class="text-[10px] text-gray-300">•</span>
			<span class="text-[10px] font-medium italic {isActive ? 'text-orange-300' : 'text-gray-400'}">
				Ewald Frank
			</span>
		</div>
	</div>

	<div
		class="hidden md:block text-xs font-medium line-clamp-1 {isActive
			? 'text-orange-400'
			: 'text-gray-500'}"
	>
		Ewald Frank
	</div>

	<div
		class="hidden md:block text-xs font-medium line-clamp-1 italic {isActive
			? 'text-orange-300'
			: 'text-gray-400'}"
	>
		{formatDateCode(recording.started_at)}
	</div>

	<div
		class="hidden md:block text-center text-xs font-mono {isActive ? 'text-orange-600' : 'text-gray-400'}"
	>
		{recording.duration_sec ? formatTime(recording.duration_sec) : '--:--'}
	</div>

	<div class="flex w-full items-center justify-center gap-1 md:gap-2">
		{#if recording.s3_url}
			<button
				class="group relative p-2 text-gray-400 hover:text-orange-600 transition-colors"
				on:click|stopPropagation={downloadMp3}
				title={isDownloading
					? downloadPercent !== null
						? `Annuler (${downloadPercent}%)`
						: 'Annuler le téléchargement'
					: 'Télécharger MP3'}
				aria-label={isDownloading ? 'Annuler le téléchargement' : 'Télécharger le MP3'}
			>
				{#if isDownloading}
					<span class="relative flex h-5 w-5 items-center justify-center">
						{#if downloadPercent !== null}
							<svg class="absolute inset-0 h-5 w-5 -rotate-90" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="text-gray-200" />
								<circle
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="3"
									stroke-linecap="round"
									stroke-dasharray={2 * Math.PI * 10}
									stroke-dashoffset={(1 - downloadPercent / 100) * 2 * Math.PI * 10}
									class="text-orange-500 transition-[stroke-dashoffset] duration-200"
								/>
							</svg>
							<span class="text-[7px] font-bold text-orange-600 tabular-nums">{downloadPercent}</span>
						{:else}
							<svg class="h-5 w-5 animate-spin text-orange-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" class="opacity-25" />
								<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-dasharray="42 62" />
							</svg>
						{/if}
						<span class="absolute inset-0 hidden items-center justify-center rounded-full bg-orange-600 group-hover:flex">
							<svg class="h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
								<path d="M6 6l12 12M6 18L18 6" />
							</svg>
						</span>
					</span>
				{:else}
					<Icon src={IoCloudDownloadOutline} size="20" />
				{/if}
			</button>
		{/if}

		{#if recording.s3_url}
			<button
				class="hover:scale-110 active:scale-95 transition-all p-2 text-orange-600"
				on:click|stopPropagation={togglePlay}
				title={isActive && $isPlaying ? 'Pause' : 'Lire'}
			>
				<Icon src={isActive && $isPlaying ? IoPauseCircle : IoPlayCircle} size="24" />
			</button>
		{/if}
	</div>
</div>
