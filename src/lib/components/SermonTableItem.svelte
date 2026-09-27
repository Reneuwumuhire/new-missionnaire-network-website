<script lang="ts">
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import AiOutlineDownload from 'svelte-icons-pack/ai/AiOutlineDownload';
	import BsFileEarmarkPdfFill from 'svelte-icons-pack/bs/BsFileEarmarkPdfFill';
	import IoPlayCircle from 'svelte-icons-pack/io/IoPlayCircle';
	import IoPauseCircle from 'svelte-icons-pack/io/IoPauseCircle';
	import { selectAudio, isPlaying, currentIndex } from '../stores/global';
	import type { Sermon } from '$lib/models/sermon';
	import type { AudioAsset } from '$lib/models/media-assets';
	import type { MusicAudio } from '$lib/models/music-audio';
	import type { LiveStreamTrack } from '$lib/utils/liveTrack';
	import { buildSermonSlug } from '../../utils/sermonSlug';
	import { formatTime } from '../../utils/FormatTime';
	import { createPlayableSermon } from '../../utils/audioPlayback';
	import { dispatchAudioPlayerAction } from '$lib/utils/audioPlayerControls';
	import { downloadAudioFile } from '../../utils/downloadAudio';
	import { t } from '../../i18n';
	import {
		availableSermonVersions,
		getSermonVersion,
		type SermonLanguage,
		type SermonLanguageFilter
	} from '$lib/utils/sermonLanguage';

	interface Props {
		sermon: Sermon;
		index: number;
		absoluteIndex: number;
		language?: SermonLanguageFilter;
	}

	let { sermon, index, absoluteIndex, language = 'french' }: Props = $props();
	let isDurationLoading = false;

	// Background-download state: when the listener clicks the cloud icon we
	// stream the mp3 and save it via a blob URL instead of navigating away
	// via window.open. Progress shows as a circular indicator in place of the
	// icon (or a pulsing dot when Content-Length isn't known). Tapping the
	// progress ring a second time cancels the in-flight request.
	let isDownloading = $state(false);
	let downloadPercent: number | null = $state(0);
	let downloadController: AbortController | null = null;
	const desktopSermonGrid = 'md:grid-cols-[30px_minmax(0,2.5fr)_minmax(0,1.35fr)_110px_80px_120px]';

	function currentAudioUrl(current: Sermon | AudioAsset | MusicAudio | LiveStreamTrack | null) {
		if (!current) return null;
		return 'mp3_url' in current
			? current.mp3_url
			: 's3_url' in current
				? current.s3_url
				: (current as any).url;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.target instanceof Element && e.target.closest('details')) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			togglePlay();
		}
	}

	function handleRowClick(event: MouseEvent) {
		if (event.target instanceof Element && event.target.closest('details')) return;
		togglePlay();
	}

	function togglePlay(selectedLanguage: SermonLanguage = primaryLanguage) {
		const playbackSermon = createPlayableSermon(sermon, selectedLanguage);
		const audioUrl = playbackSermon.mp3_url;

		if (!audioUrl) return;

		if (currentAudioUrl($selectAudio) === audioUrl) {
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
		const url = version.audioUrl;
		if (!url) return;
		const title = version.title || 'sermon';
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
		const url = version.pdfUrl;
		if (url) {
			window.open(url, '_blank');
		}
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

	let versions = $derived(availableSermonVersions(sermon));
	let primaryLanguage = $derived(
		language === 'all'
			? versions.find((candidate) => candidate.language === 'french')?.language ||
					versions[0]?.language ||
					'french'
			: language
	);
	let version = $derived(getSermonVersion(sermon, primaryLanguage));
	let selectedAudioUrl = $derived(currentAudioUrl($selectAudio));
	let isActive = $derived(
		language === 'all'
			? versions.some((candidate) => candidate.audioUrl === selectedAudioUrl)
			: version.audioUrl === selectedAudioUrl
	);
	let sermonHref = $derived(
		`/predications/${buildSermonSlug(sermon)}${primaryLanguage === 'french' ? '' : `?language=${primaryLanguage}`}`
	);
	let durationAudioUrl = $derived(version.audioUrl);
	let hasDurationAudio = $derived(Boolean(durationAudioUrl));
	// Only show the stored duration. We used to probe every row's audio via
	// `<audio preload="metadata" src=url>` to extract its duration, but that
	// kicked off a full network download per row (the browser fetches the
	// moov atom which for m4a often requires the whole file). With ~100
	// sermons per page that was ~40MB+ of wasted bandwidth on page load.
	// Rows without a stored duration now render "--:--"; backfill them with
	// admin/scripts/backfill-sermon-durations.ts. Each language has its own
	// stored duration because translations usually run a different length.
	let resolvedDuration = $derived(version.duration);
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	class="grid grid-cols-[30px_1fr_auto_auto] {desktopSermonGrid} gap-2 md:gap-4 px-4 py-3 md:py-4 items-center transition-all group cursor-pointer {isActive
		? 'bg-orange-50/80 border-l-4 border-l-orange-500'
		: 'hover:bg-gray-50'}"
	onclick={handleRowClick}
	onkeydown={handleKeydown}
	role="button"
	tabindex="0"
	aria-label={$t('player.playSermon', {
		title: version.title
	})}
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
			onclick={(e) => e.stopPropagation()}
		>
			{version.title}
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

	<div
		class="hidden md:block text-center text-xs font-mono {isActive
			? 'text-orange-600'
			: 'text-gray-400'}"
	>
		{formatDuration(resolvedDuration)}
	</div>

	<!-- Actions — hidden on mobile until the row is selected, so the title
	     gets the full width. Tapping the row plays it (→ isActive), which
	     reveals the PDF / download / play controls. Desktop always shows
	     them (it has dedicated columns). -->
	<div
		class="w-full items-center justify-center gap-1 md:gap-2 {isActive ? 'flex' : 'hidden md:flex'}"
	>
		{#if version.pdfUrl}
			<button
				class="inline-flex items-center justify-center min-w-11 min-h-11 text-gray-400 hover:text-red-500 transition-colors"
				onclick={(e) => {
					e.stopPropagation();
					downloadPdf();
				}}
				title={$t('player.downloadPdf')}
				aria-label={$t('player.downloadPdfLabel', {
					title: version.title
				})}
			>
				<Icon src={BsFileEarmarkPdfFill} size="18" />
			</button>
		{/if}

		{#if version.audioUrl}
			<button
				class="group relative inline-flex items-center justify-center min-w-11 min-h-11 text-gray-400 hover:text-orange-600 transition-colors"
				onclick={(e) => {
					e.stopPropagation();
					downloadMp3();
				}}
				title={isDownloading
					? downloadPercent !== null
						? $t('player.cancelPercent', { percent: downloadPercent })
						: $t('player.cancelDownload')
					: $t('player.downloadMp3')}
				aria-label={isDownloading
					? downloadPercent !== null
						? $t('player.cancelDownloadPercent', { percent: downloadPercent })
						: $t('player.cancelDownload')
					: $t('player.downloadMp3Label')}
			>
				{#if isDownloading}
					<span class="relative flex h-5 w-5 items-center justify-center">
						{#if downloadPercent !== null}
							<svg
								class="absolute inset-0 h-5 w-5 -rotate-90"
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
									class="text-gray-200"
								/>
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
							<span class="text-[7px] font-bold text-orange-600 tabular-nums"
								>{downloadPercent}</span
							>
						{:else}
							<svg
								class="h-5 w-5 animate-spin text-orange-500"
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
									class="opacity-25"
								/>
								<circle
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="3"
									stroke-linecap="round"
									stroke-dasharray="42 62"
								/>
							</svg>
						{/if}
						<!-- Hover hint: swap ring for X so cancel is obvious on pointer devices. -->
						<span
							class="absolute inset-0 hidden items-center justify-center rounded-full bg-orange-600 group-hover:flex"
						>
							<svg
								class="h-3 w-3 text-white"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								aria-hidden="true"
							>
								<path d="M6 6l12 12M6 18L18 6" />
							</svg>
						</span>
					</span>
				{:else}
					<Icon src={AiOutlineDownload} size="20" />
				{/if}
			</button>
		{/if}

		{#if version.audioUrl}
			<button
				class="hover:scale-110 active:scale-95 transition-all inline-flex items-center justify-center min-w-11 min-h-11 {isActive
					? 'text-orange-600'
					: 'text-orange-600'}"
				onclick={(e) => {
					e.stopPropagation();
					togglePlay();
				}}
				title={isActive && $isPlaying ? $t('player.pause') : $t('player.playAction')}
				aria-label={isActive && $isPlaying ? $t('player.pause') : $t('player.playAction')}
			>
				<Icon src={isActive && $isPlaying ? IoPauseCircle : IoPlayCircle} size="24" />
			</button>
		{/if}
	</div>

	{#if language === 'all' && versions.length > 0}
		<details class="col-span-full ml-10 border-t border-stone-200/70 pt-2">
			<summary
				class="min-h-11 cursor-pointer select-none py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500 hover:text-missionnaire"
			>
				{$t('lang.available', { count: versions.length })}
			</summary>
			<div class="divide-y divide-stone-100 border-t border-stone-100">
				{#each versions as languageVersion}
					<div class="flex min-h-12 items-center gap-3 py-2">
						<span
							class="w-8 shrink-0 rounded bg-stone-100 px-1.5 py-1 text-center text-[10px] font-bold uppercase text-stone-500"
						>
							{languageVersion.code}
						</span>
						<a
							href={`/predications/${buildSermonSlug(sermon)}?language=${languageVersion.language}`}
							class="min-w-0 flex-1 truncate text-xs font-semibold text-stone-700 hover:text-missionnaire hover:underline"
						>
							{languageVersion.title}
						</a>
						{#if languageVersion.pdfUrl}
							<a
								href={languageVersion.pdfUrl}
								target="_blank"
								rel="noopener noreferrer"
								class="inline-flex min-h-11 min-w-11 items-center justify-center text-stone-400 hover:text-red-500"
								aria-label={$t('player.downloadPdfLabel', { title: languageVersion.title })}
							>
								<Icon src={BsFileEarmarkPdfFill} size="16" />
							</a>
						{/if}
						{#if languageVersion.audioUrl}
							<button
								class="inline-flex min-h-11 min-w-11 items-center justify-center text-orange-600 hover:scale-110"
								onclick={() => togglePlay(languageVersion.language)}
								aria-label={selectedAudioUrl === languageVersion.audioUrl && $isPlaying
									? $t('player.pause')
									: $t('player.playAction')}
							>
								<Icon
									src={selectedAudioUrl === languageVersion.audioUrl && $isPlaying
										? IoPauseCircle
										: IoPlayCircle}
									size="22"
								/>
							</button>
						{/if}
					</div>
				{/each}
			</div>
		</details>
	{/if}
</div>
