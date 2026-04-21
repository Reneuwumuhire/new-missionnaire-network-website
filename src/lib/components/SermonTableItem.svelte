<script lang="ts">
	import { browser } from '$app/environment';
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import IoCloudDownloadOutline from 'svelte-icons-pack/io/IoCloudDownloadOutline';
	import BsFileEarmarkPdfFill from 'svelte-icons-pack/bs/BsFileEarmarkPdfFill';
	import IoPlayCircle from 'svelte-icons-pack/io/IoPlayCircle';
	import IoPauseCircle from 'svelte-icons-pack/io/IoPauseCircle';
	import { selectAudio, isPlaying, currentIndex } from '../stores/global';
	import type { Sermon } from '$lib/models/sermon';
	import type { AudioAsset } from '$lib/models/media-assets';
	import type { MusicAudio } from '$lib/models/music-audio';
	import { buildSermonSlug } from '../../utils/sermonSlug';
	import { formatTime } from '../../utils/FormatTime';
	import { createPlayableSermon } from '../../utils/audioPlayback';
	import { dispatchAudioPlayerAction } from '$lib/utils/audioPlayerControls';
	import { getAudioDuration } from '../../utils/audioDuration';
	import { downloadAudioFile } from '../../utils/downloadAudio';

	export let sermon: Sermon;
	export let index: number;
	export let absoluteIndex: number;
	export let language: string = 'french';
	let resolvedDuration: number | null = sermon.duration ?? null;
	let isDurationLoading = false;
	let requestedDurationUrl = '';

	// Background-download state: when the listener clicks the cloud icon we
	// stream the mp3 and save it via a blob URL instead of navigating away
	// via window.open. Progress shows as a circular indicator in place of the
	// icon (or a pulsing dot when Content-Length isn't known). Tapping the
	// progress ring a second time cancels the in-flight request.
	let isDownloading = false;
	let downloadPercent: number | null = 0;
	let downloadController: AbortController | null = null;
	const desktopSermonGrid = 'md:grid-cols-[30px_minmax(0,2.5fr)_minmax(0,1.35fr)_110px_80px_120px]';

	$: isActive = isSermonActive(sermon, $selectAudio);
	$: sermonHref = `/predications/${buildSermonSlug(sermon)}`;
	$: durationAudioUrl = language === 'english' ? sermon.english_audio_url : sermon.mp3_url;
	$: hasDurationAudio = Boolean(durationAudioUrl);
	$: if (sermon.duration !== undefined && sermon.duration !== null) {
		resolvedDuration = sermon.duration;
		isDurationLoading = false;
	} else if (!durationAudioUrl) {
		resolvedDuration = null;
		isDurationLoading = false;
		requestedDurationUrl = '';
	} else if (browser && durationAudioUrl !== requestedDurationUrl) {
		void loadDuration(durationAudioUrl);
	}

	function isSermonActive(s: Sermon, current: Sermon | AudioAsset | MusicAudio | null) {
		// Check for specific english audio URL match
		if (language === 'english') {
			if (!s.english_audio_url) return false;
			// Check if current is null before using 'in' operator
			if (!current) return false;
			const currentUrl =
				'mp3_url' in current
					? current.mp3_url
					: 's3_url' in current
					? current.s3_url
					: (current as any).url;
			return currentUrl === s.english_audio_url;
		}

		if (!current || !s.mp3_url) return false;
		const currentUrl =
			'mp3_url' in current
				? current.mp3_url
				: 's3_url' in current
				? current.s3_url
				: (current as any).url;
		return currentUrl === s.mp3_url;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			togglePlay();
		}
	}

	function togglePlay() {
		const playbackSermon = createPlayableSermon(
			sermon,
			language === 'english' ? 'english' : 'french'
		);
		const audioUrl = playbackSermon.mp3_url;

		if (!audioUrl) return;

		if (isActive) {
			dispatchAudioPlayerAction('toggle');
		} else {
			currentIndex.set(index);
			selectAudio.set(playbackSermon);
			isPlaying.set(true);
		}
	}

	async function downloadMp3() {
		// Second tap while a download is in flight = cancel.
		if (isDownloading && downloadController) {
			downloadController.abort();
			return;
		}
		const url = language === 'english' ? sermon.english_audio_url : sermon.mp3_url;
		if (!url) return;
		const title = language === 'english'
			? sermon.english_title || 'sermon'
			: sermon.french_title || sermon.english_title || 'sermon';
		const controller = new AbortController();
		downloadController = controller;
		isDownloading = true;
		downloadPercent = 0;
		try {
			await downloadAudioFile(url, title, {
				signal: controller.signal,
				onProgress: (p) => (downloadPercent = p.percent)
			});
		} catch (err) {
			// Swallow user-initiated cancellation; log other failures.
			if (!controller.signal.aborted) console.error('[sermon/download]', err);
		} finally {
			downloadController = null;
			isDownloading = false;
			setTimeout(() => {
				if (!isDownloading) downloadPercent = 0;
			}, 800);
		}
	}

	function downloadPdf() {
		const url = language === 'english' ? sermon.english_pdf_url : sermon.pdf_url;
		if (url) {
			window.open(url, '_blank');
		}
	}

	async function loadDuration(url: string) {
		requestedDurationUrl = url;
		isDurationLoading = true;

		const duration = await getAudioDuration(url);
		if (requestedDurationUrl !== url) return;

		resolvedDuration = duration;
		isDurationLoading = false;
	}

	function formatDuration(value: number | null) {
		if (!hasDurationAudio) {
			return '';
		}

		if (value !== null && value !== undefined) {
			return formatTime(value);
		}

		return isDurationLoading ? '...' : '--:--';
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
	aria-label="Lire la prédication {sermon.french_title || sermon.english_title}"
>
	<!-- Index -->
	<div
		class="text-center text-[10px] md:text-xs font-bold {isActive
			? 'text-orange-600'
			: 'text-gray-300'}"
	>
		{absoluteIndex}
	</div>

	<!-- Title and Mobile Metadata -->
	<div class="flex flex-col min-w-0">
		<a
			href={sermonHref}
			class="text-sm font-bold line-clamp-1 transition-colors {isActive
				? 'text-orange-600'
				: 'text-gray-800 group-hover:text-orange-600'} hover:underline underline-offset-2"
			on:click|stopPropagation
		>
			{#if language === 'english'}
				{sermon.english_title || 'Untitled'}
			{:else}
				{sermon.french_title || sermon.english_title || 'Sans titre'}
			{/if}
		</a>
		<div
			class="flex flex-row items-center gap-2 md:hidden overflow-hidden text-ellipsis whitespace-nowrap"
		>
			<span class="text-[10px] font-medium {isActive ? 'text-orange-400' : 'text-gray-500'}">
				{sermon.full_date_code}
			</span>
			{#if hasDurationAudio}
				<span class="text-[10px] text-gray-300">•</span>
				<span class="text-[10px] font-mono {isActive ? 'text-orange-300' : 'text-gray-400'}">
					{formatDuration(resolvedDuration)}
				</span>
			{/if}
			<span class="text-[10px] text-gray-300">•</span>
			<span class="text-[10px] font-medium italic {isActive ? 'text-orange-300' : 'text-gray-400'}">
				{sermon.author}
			</span>
		</div>
	</div>

	<!-- Desktop Author -->
	<div
		class="hidden md:block text-xs font-medium line-clamp-1 {isActive
			? 'text-orange-400'
			: 'text-gray-500'}"
	>
		{sermon.author}
	</div>

	<!-- Desktop Date -->
	<div
		class="hidden md:block text-xs font-medium line-clamp-1 italic {isActive
			? 'text-orange-300'
			: 'text-gray-400'}"
	>
		{sermon.full_date_code}
	</div>

	<div class="hidden md:block text-center text-xs font-mono {isActive ? 'text-orange-600' : 'text-gray-400'}">
		{formatDuration(resolvedDuration)}
	</div>

	<!-- Actions -->
	<div class="flex w-full items-center justify-center gap-1 md:gap-2">
		{#if (language === 'english' && sermon.english_pdf_url) || (language !== 'english' && sermon.pdf_url)}
			<button
				class="p-2 text-gray-400 hover:text-red-500 transition-colors"
				on:click|stopPropagation={downloadPdf}
				title="Télécharger PDF"
			>
				<Icon src={BsFileEarmarkPdfFill} size="18" />
			</button>
		{/if}

		{#if (language === 'english' && sermon.english_audio_url) || (language !== 'english' && sermon.mp3_url)}
			<button
				class="group relative p-2 text-gray-400 hover:text-orange-600 transition-colors"
				on:click|stopPropagation={downloadMp3}
				title={isDownloading
					? downloadPercent !== null
						? `Annuler (${downloadPercent}%)`
						: 'Annuler le téléchargement'
					: 'Télécharger MP3'}
				aria-label={isDownloading
					? downloadPercent !== null
						? `Annuler le téléchargement (${downloadPercent}%)`
						: 'Annuler le téléchargement'
					: 'Télécharger le MP3'}
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
						<!-- Hover hint: swap ring for X so cancel is obvious on pointer devices. -->
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

		{#if (language === 'english' && sermon.english_audio_url) || (language !== 'english' && sermon.mp3_url)}
			<button
				class="hover:scale-110 active:scale-95 transition-all p-2 {isActive
					? 'text-orange-600'
					: 'text-orange-600'}"
				on:click|stopPropagation={togglePlay}
				title={isActive && $isPlaying ? 'Pause' : 'Lire'}
			>
				<Icon src={isActive && $isPlaying ? IoPauseCircle : IoPlayCircle} size="24" />
			</button>
		{/if}
	</div>
</div>
