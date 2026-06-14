<script lang="ts">
	import type { PageData } from './$types';
	import { downloadAudioFile } from '../../../../utils/downloadAudio';
	import { selectAudio, playlist, basePlaylist, currentIndex, isPlaying } from '$lib/stores/global';
	import { dispatchAudioPlayerAction } from '$lib/utils/audioPlayerControls';
	import type { MusicAudio } from '$lib/models/music-audio';
	import { derived as derivedStore } from 'svelte/store';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { t } from '../../../../i18n';
	import { vercelImage, vercelImagePlaceholder } from '$lib/utils/vercelImage';
	import BlurUpImage from '$lib/components/BlurUpImage.svelte';
	import LiveTranscript from '$lib/components/+liveTranscript.svelte';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	let rec = $derived(data.recording);
	let transcript = $derived(data.transcript);
	let youtubeUrl = $derived(
		rec.source_video_id ? `https://www.youtube.com/watch?v=${rec.source_video_id}` : null
	);

	let thumbnailExpanded = $state(false);
	let thumbnailBroken = $state(false);

	// ── Audio player ───────────────────────────────────────────────
	// Route playback through the global AudioPlayer (bottom bar) so
	// listeners get the same experience as the music/predications
	// pages: ±5s skip buttons, keyboard shortcuts, MediaSession
	// controls on lock-screen/Bluetooth/car head-unit, and the OS
	// resume-after-interruption logic. The rediffusion is shaped as a
	// single-item MusicAudio-compatible entry so it plugs into the
	// existing selectAudio/playlist stores without special-casing.
	// ── Audio language version ─────────────────────────────────────
	// The primary `s3_url` is the original broadcast capture; the admin can
	// attach a French dub. Listeners switch between them; switching re-loads
	// the global player with the chosen file.
	type AudioVersion = 'original' | 'french';
	let audioVersion = $state<AudioVersion>('original');
	let hasFrenchAudio = $derived(Boolean(rec.french_audio_url));

	/** Display name for an audio-language code, kept type-safe (no dynamic key). */
	function languageName(code: string): string {
		switch (code) {
			case 'rw':
				return $t('lang.name.rw');
			case 'fr':
				return $t('lang.name.fr');
			case 'en':
				return $t('lang.name.en');
			default:
				return code;
		}
	}

	// The two pickable versions, labelled by their actual language (the original
	// capture's language is admin-set; the French dub is always Français).
	let audioVersions = $derived([
		{ id: 'original' as AudioVersion, label: languageName(rec.original_audio_language) },
		{ id: 'french' as AudioVersion, label: $t('lang.name.fr') }
	]);

	function urlFor(v: AudioVersion): string {
		return v === 'french' && rec.french_audio_url ? rec.french_audio_url : rec.s3_url;
	}
	function durationFor(v: AudioVersion): number | undefined {
		const d =
			v === 'french' && rec.french_audio_duration_sec != null
				? rec.french_audio_duration_sec
				: rec.duration_sec;
		return d ?? undefined;
	}
	function sizeFor(v: AudioVersion): number {
		const s =
			v === 'french' && rec.french_audio_size_bytes != null
				? rec.french_audio_size_bytes
				: rec.size_bytes;
		return s ?? 0;
	}
	function titleFor(v: AudioVersion): string {
		return v === 'french' ? `${rec.title} (Français)` : rec.title;
	}

	function buildPlayable(v: AudioVersion) {
		return {
			_id: rec.id,
			book: null,
			book_full_name: null,
			number: null,
			title: rec.title,
			artist: 'Missionnaire Network',
			category: 'Direct',
			s3_key: '',
			s3_url: urlFor(v),
			file_size: sizeFor(v),
			duration: durationFor(v),
			format: 'mp3',
			uploaded_at: new Date(rec.started_at),
			thumbnail_url: rec.thumbnail_url ?? undefined
		} satisfies MusicAudio & { thumbnail_url?: string };
	}

	let activeAudioUrl = $derived(urlFor(audioVersion));
	let playable = $derived(buildPlayable(audioVersion));

	// Is *this* recording (either language version) currently loaded into the
	// global player? Flips the button label between "Écouter" and play/pause.
	const isCurrent = derivedStore(selectAudio, ($sel) => {
		if (!$sel) return false;
		const url = 's3_url' in $sel ? $sel.s3_url : '';
		return url === rec?.s3_url || (!!rec?.french_audio_url && url === rec.french_audio_url);
	});

	function loadVersionIntoPlayer(v: AudioVersion, play: boolean) {
		const next = buildPlayable(v);
		const single = [next] as unknown as MusicAudio[];
		basePlaylist.set(single);
		playlist.set(single);
		currentIndex.set(0);
		selectAudio.set(next as unknown as MusicAudio);
		isPlaying.set(play);
	}

	function playRecording() {
		if ($isCurrent) {
			// Same track — let the mounted player toggle itself so the
			// audio element stays the single source of truth.
			dispatchAudioPlayerAction('toggle');
			return;
		}
		loadVersionIntoPlayer(audioVersion, true);
	}

	/** Switch language — load the chosen version into the player and play it so
	 *  the selection always takes audible effect. If it was already playing this
	 *  recording, keep playing; otherwise the tap (a user gesture) starts it. */
	function setAudioVersion(v: AudioVersion) {
		if (v === audioVersion) return;
		audioVersion = v;
		loadVersionIntoPlayer(v, true);
	}

	// ── Share ──────────────────────────────────────────────────────
	// Same dropdown UI as the music player: a "Partager" trigger that
	// opens a small menu offering the native share sheet and a plain
	// "Copier le lien". The link carries `?autoplay=1` so the recipient
	// lands on this page and playback starts on its own (see onMount).
	let isShareMenuOpen = $state(false);
	let shareFeedback: 'copied' | 'error' | null = $state(null);
	let shareFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
	let shareWrapEl: HTMLElement | null = $state(null);
	let hasNativeShare = $derived(
		browser && typeof navigator !== 'undefined' && typeof navigator.share === 'function'
	);

	function buildShareUrl(): string {
		if (!browser) return '';
		return `${window.location.origin}/live/rediffusions/${rec.id}?autoplay=1`;
	}

	function flashShareFeedback(state: 'copied' | 'error') {
		shareFeedback = state;
		if (shareFeedbackTimer) clearTimeout(shareFeedbackTimer);
		shareFeedbackTimer = setTimeout(() => (shareFeedback = null), 2200);
	}

	function toggleShareMenu() {
		if (browser) isShareMenuOpen = !isShareMenuOpen;
	}

	function closeShareMenu() {
		isShareMenuOpen = false;
	}

	async function copyShareLink() {
		closeShareMenu();
		const url = buildShareUrl();
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
			flashShareFeedback('copied');
		} catch {
			flashShareFeedback('error');
		}
	}

	async function nativeShare() {
		closeShareMenu();
		const url = buildShareUrl();
		if (!url) return;
		const shareData: ShareData = {
			title: rec.title,
			text: `${rec.title} — Missionnaire Network`,
			url
		};
		try {
			if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
				await navigator.share(shareData);
				return;
			}
		} catch (err) {
			// User dismissed the share sheet — not an error.
			if ((err as DOMException)?.name === 'AbortError') return;
		}
		// Web Share unsupported or threw — fall back to clipboard.
		try {
			await navigator.clipboard.writeText(url);
			flashShareFeedback('copied');
		} catch {
			flashShareFeedback('error');
		}
	}

	function handleShareOutsideClick(event: MouseEvent) {
		if (!isShareMenuOpen) return;
		if (shareWrapEl && !shareWrapEl.contains(event.target as Node)) closeShareMenu();
	}

	onDestroy(() => {
		if (shareFeedbackTimer) clearTimeout(shareFeedbackTimer);
	});

	// ── Autoplay on shared deep-link ───────────────────────────────
	// When opened via a share link (`?autoplay=1`), load this recording
	// into the global player and start it. The query param is then
	// stripped so a manual refresh doesn't silently restart playback.
	onMount(() => {
		if (!browser) return;
		if ($page.url.searchParams.get('autoplay') !== '1') return;
		playRecording();
		try {
			window.history.replaceState(window.history.state, '', `/live/rediffusions/${rec.id}`);
		} catch {
			/* history API unavailable — harmless */
		}
	});

	// ── View counter ───────────────────────────────────────────────
	// SSR renders the stored count (rides along on the page's findOne, so no
	// extra read). After hydration we fire a one-shot, non-blocking POST to
	// bump it — deduped per session so a refresh/HMR doesn't inflate the
	// number. The page's render and TTFB are never on the hook for this.
	let liveViewCount: number | null = $state(null);
	let displayViews = $derived(liveViewCount ?? rec.view_count);

	onMount(() => {
		if (!browser) return;
		const key = `rediff-viewed:${rec.id}`;
		try {
			if (sessionStorage.getItem(key) === '1') return;
			sessionStorage.setItem(key, '1');
		} catch {
			/* sessionStorage blocked (private mode) — still count this view once */
		}
		// Optimistic bump so the listener immediately sees their view reflected.
		liveViewCount = rec.view_count + 1;
		fetch(`/api/recordings/${rec.id}/view`, { method: 'POST', keepalive: true })
			.then((res) => (res.ok ? res.json() : null))
			.then((body) => {
				if (body && typeof body.view_count === 'number') liveViewCount = body.view_count;
			})
			.catch(() => {
				/* tracking is best-effort — never surface to the listener */
			});
	});

	function formatViews(n: number): string {
		return n.toLocaleString('fr-FR');
	}

	// ── Download state ─────────────────────────────────────────────
	// Background fetch: stream the mp3, track bytes loaded, hand the
	// assembled blob to a synthetic <a download> so the browser saves
	// it without navigating away. Logic lives in utils/downloadAudio.ts.
	let isDownloading = $state(false);
	let downloadPercent: number | null = $state(0);
	let downloadLoaded = $state(0);
	let downloadFailed = $state(false);
	let downloadController: AbortController | null = null;

	function formatDownloadedBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} o`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
		return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
	}

	async function downloadAudio() {
		if (!activeAudioUrl) return;
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
		downloadFailed = false;
		try {
			await downloadAudioFile(activeAudioUrl, titleFor(audioVersion), {
				signal: controller.signal,
				totalBytesHint: sizeFor(audioVersion),
				onProgress: (p) => {
					downloadPercent = p.percent;
					downloadLoaded = p.loaded;
				}
			});
		} catch (err) {
			// User-cancelled: leave button state clean, skip the error banner.
			if (!controller.signal.aborted) {
				console.error('[archive/download]', err);
				downloadFailed = true;
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

	// ── Description collapse ───────────────────────────────────────
	// Long descriptions clamp to ~6 lines with a "Voir plus" toggle so
	// the page doesn't become a wall of text under the hero.
	let descriptionExpanded = $state(false);
	let descriptionIsLong = $derived(
		!!rec.description &&
			(rec.description.length > 480 || (rec.description.match(/\n/g)?.length ?? 0) >= 6)
	);

	function openThumbnail() {
		if (!rec.thumbnail_url || thumbnailBroken) return;
		thumbnailExpanded = true;
	}
	function closeThumbnail() {
		thumbnailExpanded = false;
	}
	function onLightboxKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			closeThumbnail();
			closeShareMenu();
		}
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

	// Shared look for the secondary actions: compact outlined icon+label
	// buttons. Hover only tints the border/label (never a solid orange
	// fill) — the old full-width rows used `hover:bg-missionnaire` which
	// stuck after click/tap and read as a phantom active state.
	const secondaryAction =
		'inline-flex flex-1 sm:flex-none min-w-fit min-h-[44px] items-center justify-center gap-2 whitespace-nowrap border px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.15em] font-body transition-colors duration-200 motion-reduce:transition-none hover:border-missionnaire/60 hover:text-missionnaire hover:bg-missionnaire/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40';
</script>

<!-- Title/description/og:*/canonical come from `meta` in this route's
     load — the root layout renders the single canonical tag set ($lib/seo). -->

<svelte:window onkeydown={onLightboxKeydown} onclick={handleShareOutsideClick} />

<section class="w-full px-6 pt-4 pb-10 md:pt-6">
	<div class="max-w-4xl mx-auto">
		<div class="mb-8">
			<a
				href={data.backHref}
				class="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] font-body text-missionnaire/80 hover:text-missionnaire transition-colors motion-reduce:transition-none"
			>
				← {$t('rediffDetail.allBroadcasts')}
			</a>
		</div>

		<!-- HERO: thumbnail + title/meta/actions composed as one unit.
		     Desktop: thumbnail left (~40%), text right. Mobile: stacked. -->
		<div class="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
			<!-- Thumbnail (click to expand) -->
			<div class="md:w-2/5 md:shrink-0">
				{#if rec.thumbnail_url && !thumbnailBroken}
					<button
						type="button"
						onclick={openThumbnail}
						aria-label={$t('rediffDetail.expandThumb')}
						class="group relative aspect-video w-full overflow-hidden border border-stone-200/60 bg-stone-100 cursor-zoom-in transition-all duration-200 motion-reduce:transition-none hover:border-missionnaire/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40"
					>
						<BlurUpImage
							src={vercelImage(rec.thumbnail_url, 512)}
							srcset={`${vercelImage(rec.thumbnail_url, 256)} 256w, ${vercelImage(rec.thumbnail_url, 512)} 512w, ${vercelImage(rec.thumbnail_url, 1080)} 1080w`}
							sizes="(min-width: 768px) 40vw, 100vw"
							placeholderSrc={vercelImagePlaceholder(rec.thumbnail_url)}
							alt={rec.title}
							width={256}
							height={144}
							loading="eager"
							fetchpriority="high"
							class="h-full w-full object-cover transition-transform duration-200 motion-reduce:transition-none group-hover:scale-105"
							onerror={() => (thumbnailBroken = true)}
						/>
						<span
							class="pointer-events-none absolute inset-0 flex items-end justify-end p-2 opacity-0 transition-opacity duration-200 motion-reduce:transition-none group-hover:opacity-100"
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
								{$t('rediffDetail.archive')}
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

			<!-- Title, meta and actions -->
			<div class="min-w-0 flex-1">
				<p
					class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-2 font-body"
				>
					{$t('rediffDetail.kicker')}
				</p>
				<h1
					class="font-display text-2xl md:text-3xl font-semibold leading-tight text-stone-900 line-clamp-3"
				>
					{rec.title}
				</h1>
				<p
					class="mt-2 text-[11px] font-bold uppercase tracking-[0.2em] tabular-nums text-stone-400 font-body"
				>
					{formatDate(rec.started_at)} · {formatDuration(rec.duration_sec)} · {formatViews(
						displayViews
					)}
					{displayViews >= 2 ? $t('rediffDetail.viewPlural') : $t('rediffDetail.viewSingular')}
				</p>

				<!-- Audio language switch — only when a French version is attached -->
				{#if hasFrenchAudio}
					<div class="mt-5">
						<p
							class="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 font-body"
						>
							{$t('rediffDetail.audioLanguage')}
						</p>
						<div
							class="flex flex-wrap gap-2"
							role="group"
							aria-label={$t('rediffDetail.audioLanguage')}
						>
							{#each audioVersions as v (v.id)}
								<button
									type="button"
									onclick={() => setAudioVersion(v.id)}
									aria-pressed={audioVersion === v.id}
									class="inline-flex min-h-[40px] items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] font-body transition-colors duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40 {audioVersion ===
									v.id
										? 'border-missionnaire bg-missionnaire text-white shadow-sm'
										: 'border-stone-200/70 bg-white/50 text-stone-600 hover:border-missionnaire/50 hover:text-missionnaire'}"
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
										aria-hidden="true"
									>
										<circle cx="12" cy="12" r="9" />
										<path d="M3 12h18" />
										<path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
									</svg>
									<span>{v.label}</span>
									{#if audioVersion === v.id}
										<svg
											width="13"
											height="13"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="3"
											stroke-linecap="round"
											stroke-linejoin="round"
											aria-hidden="true"
										>
											<path d="M5 13l4 4L19 7" />
										</svg>
									{/if}
								</button>
							{/each}
						</div>
					</div>
				{/if}

				<!-- Primary action -->
				<div class="mt-6">
					<button
						type="button"
						onclick={playRecording}
						aria-label={$isCurrent && $isPlaying
							? $t('rediffDetail.pauseAria')
							: $isCurrent
								? $t('rediffDetail.resumeAria')
								: $t('rediffDetail.listenAria')}
						class="inline-flex min-h-[44px] w-full items-center justify-center gap-3 whitespace-nowrap bg-missionnaire px-8 py-3 text-sm font-bold uppercase tracking-[0.2em] font-body text-white transition-colors duration-200 motion-reduce:transition-none hover:bg-missionnaire/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40 md:w-auto md:min-w-[14rem]"
					>
						{#if $isCurrent && $isPlaying}
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="currentColor"
								aria-hidden="true"
							>
								<rect x="6" y="5" width="4" height="14" rx="1" />
								<rect x="14" y="5" width="4" height="14" rx="1" />
							</svg>
							<span>{$t('rediffDetail.playingPause')}</span>
						{:else}
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="currentColor"
								aria-hidden="true"
							>
								<path d="M8 5v14l11-7z" />
							</svg>
							<span>{$isCurrent ? $t('rediffDetail.resume') : $t('rediffusions.listen')}</span>
						{/if}
					</button>
				</div>

				<!-- Secondary actions: compact outlined icon+label buttons that size
				     to their content and wrap to the next row as needed, so labels
				     never break mid-word in narrow cells. -->
				<div class="mt-3 flex flex-wrap gap-2">
					<button
						type="button"
						onclick={downloadAudio}
						aria-label={isDownloading
							? downloadPercent !== null
								? $t('rediffDetail.cancelDownloadPct', { percent: downloadPercent })
								: $t('rediffDetail.cancelDownloadBytes', {
										loaded: formatDownloadedBytes(downloadLoaded)
									})
							: $t('rediffDetail.downloadAria')}
						class="download-btn group relative overflow-hidden border-stone-300/70 text-stone-600 {secondaryAction}"
						style={isDownloading && downloadPercent !== null
							? `--progress: ${downloadPercent}%`
							: ''}
					>
						{#if isDownloading}
							{#if downloadPercent !== null}
								<span class="download-fill" aria-hidden="true"></span>
							{:else}
								<span class="download-fill download-fill-indeterminate" aria-hidden="true"></span>
							{/if}
							<span class="relative z-10 flex items-center gap-2">
								<!-- Stop square: the spinner next to "Téléchargement" doubles as
								     a cancel indicator since the entire button is clickable to
								     abort. Hover tints the fill red to reinforce the cancel intent. -->
								<svg
									class="h-3 w-3 animate-spin motion-reduce:animate-none group-hover:animate-none"
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
								<span class="group-hover:hidden">{$t('rediffDetail.downloading')}</span>
								<span class="hidden group-hover:inline">{$t('rediffDetail.cancel')}</span>
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
							{$t('rediffDetail.download')}
							{#if sizeFor(audioVersion)}
								<span class="font-normal tracking-normal text-stone-400"
									>· {formatBytes(sizeFor(audioVersion))}</span
								>
							{/if}
						{/if}
					</button>

					<div class="relative flex-1 sm:flex-none" bind:this={shareWrapEl}>
						<button
							type="button"
							onclick={(e) => {
								e.stopPropagation();
								toggleShareMenu();
							}}
							aria-haspopup="menu"
							aria-expanded={isShareMenuOpen}
							aria-label={$t('rediffDetail.shareAria')}
							class="{secondaryAction} w-full sm:w-auto {isShareMenuOpen
								? 'border-missionnaire/60 bg-missionnaire/5 text-missionnaire'
								: 'border-stone-300/70 text-stone-600'}"
						>
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<circle cx="18" cy="5" r="3" />
								<circle cx="6" cy="12" r="3" />
								<circle cx="18" cy="19" r="3" />
								<line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
								<line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
							</svg>
							{#if shareFeedback === 'copied'}
								{$t('rediffDetail.linkCopied')}
							{:else if shareFeedback === 'error'}
								{$t('rediffDetail.copyFailed')}
							{:else}
								{$t('rediffDetail.share')}
							{/if}
						</button>

						{#if isShareMenuOpen}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="absolute right-0 top-full z-[60] mt-1.5 w-56 overflow-hidden rounded-lg border border-stone-200 bg-white shadow-2xl"
								role="menu"
								tabindex="-1"
								onclick={(e) => e.stopPropagation()}
							>
								{#if hasNativeShare}
									<button
										type="button"
										role="menuitem"
										class="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs font-semibold text-stone-700 transition-colors motion-reduce:transition-none hover:bg-stone-50 hover:text-missionnaire"
										onclick={nativeShare}
									>
										<svg
											width="16"
											height="16"
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
											stroke-linejoin="round"
											aria-hidden="true"
										>
											<circle cx="18" cy="5" r="3" />
											<circle cx="6" cy="12" r="3" />
											<circle cx="18" cy="19" r="3" />
											<line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
											<line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
										</svg>
										<span>{$t('rediffDetail.shareNative')}</span>
									</button>
								{/if}
								<button
									type="button"
									role="menuitem"
									class="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs font-semibold text-stone-700 transition-colors motion-reduce:transition-none hover:bg-stone-50 hover:text-missionnaire"
									onclick={copyShareLink}
								>
									<svg
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										aria-hidden="true"
									>
										<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
										<path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
									</svg>
									<span>{$t('rediffDetail.copyLink')}</span>
								</button>
							</div>
						{/if}
					</div>

					{#if transcript}
						<a
							href={transcript.url}
							target="_blank"
							rel="noopener noreferrer"
							class="border-stone-300/70 text-stone-600 {secondaryAction}"
						>
							<svg
								width="13"
								height="13"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
								<polyline points="14 2 14 8 20 8" />
								<line x1="9" y1="13" x2="15" y2="13" />
								<line x1="9" y1="17" x2="15" y2="17" />
							</svg>
							{$t('rediffDetail.transcriptPdf')}
						</a>
					{/if}

					{#if youtubeUrl}
						<a
							href={youtubeUrl}
							target="_blank"
							rel="noopener noreferrer"
							class="border-stone-300/70 text-stone-600 {secondaryAction}"
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="currentColor"
								aria-hidden="true"
							>
								<path
									d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
								/>
							</svg>
							{$t('rediffDetail.watchOnYoutube')}
						</a>
					{/if}
				</div>

				{#if downloadFailed}
					<p class="mt-3 text-[11px] text-red-600 font-body">
						{$t('rediffDetail.downloadFailed')}
					</p>
				{/if}
			</div>
		</div>

		{#if data.subtitles}
			<!-- Synced transcript — follows the global player while this recording
			     plays; tapping a sentence seeks the audio to it. -->
			<div class="mt-10">
				<LiveTranscript
					mode="replay"
					url={data.subtitles.url}
					offsetIntoRecordingMs={data.subtitles.offsetIntoRecordingMs}
					trackId={rec.id}
				/>
			</div>
		{/if}

		{#if rec.description}
			<div class="mt-10 border border-stone-200/60 bg-white/40 p-6">
				<p
					class="text-[10px] font-bold uppercase tracking-[0.25em] text-missionnaire/80 font-body mb-3"
				>
					{$t('rediffDetail.about')}
				</p>
				<div
					class="text-sm text-stone-600 font-body leading-relaxed whitespace-pre-wrap"
					class:description-collapsed={descriptionIsLong && !descriptionExpanded}
				>
					{rec.description}
				</div>
				{#if descriptionIsLong}
					<button
						type="button"
						onclick={() => (descriptionExpanded = !descriptionExpanded)}
						class="mt-3 text-[11px] font-bold uppercase tracking-[0.15em] font-body text-missionnaire hover:text-missionnaire/80 transition-colors motion-reduce:transition-none"
					>
						{descriptionExpanded ? `${$t('misc.seeLess')} ↑` : `${$t('misc.seeMore')} ↓`}
					</button>
				{/if}
			</div>
		{/if}
	</div>
</section>

{#if thumbnailExpanded && rec.thumbnail_url && !thumbnailBroken}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-lightbox-in"
		onclick={onBackdropClick}
		onkeydown={onLightboxKeydown}
		role="dialog"
		aria-modal="true"
		aria-label={$t('rediffDetail.lightboxAria')}
		tabindex="-1"
	>
		<button
			type="button"
			onclick={closeThumbnail}
			aria-label={$t('rediffDetail.close')}
			class="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors motion-reduce:transition-none hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
			src={vercelImage(rec.thumbnail_url, 1920, 85)}
			alt={rec.title}
			onerror={() => {
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

	/* Collapsed description: show first ~6 lines, expand on click. */
	.description-collapsed {
		display: -webkit-box;
		-webkit-line-clamp: 6;
		line-clamp: 6;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Download button doubles as an inline progress bar: a pseudo-fill
	   grows from left to right driven by the --progress CSS variable. */
	/* Cancel affordance on hover during download: tint the fill red so
	   "Annuler" reads unambiguously. */
	.download-btn:hover .download-fill,
	.download-btn:hover .download-fill-indeterminate {
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

	@media (prefers-reduced-motion: reduce) {
		.animate-lightbox-in {
			animation: none;
		}
		.download-fill {
			transition: none;
		}
		.download-fill-indeterminate {
			animation: none;
			width: 100%;
		}
	}
</style>
