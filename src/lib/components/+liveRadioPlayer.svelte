<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';
	import {
		radioIsLive as radioIsLiveStore,
		selectAudio,
		playlist,
		basePlaylist,
		currentIndex,
		isPlaying
	} from '$lib/stores/global';
	import {
		createLiveStreamTrack,
		isLiveStreamTrack,
		type LiveStreamTrack
	} from '$lib/utils/liveTrack';
	import LiveTranscript from './+liveTranscript.svelte';
	import { focusTrap } from '$lib/actions/focusTrap';
	import { t, type TranslationKey } from '../../i18n';

	// This card no longer embeds its own <audio> element. Playback runs
	// through the global audio player (the same one used for music/sermons)
	// via a LiveStreamTrack pseudo-track — the player handles connection,
	// reconnects, MediaSession and the transcript position bridge. The card
	// owns broadcast STATUS: is the stream on air, metadata, autoplay, and
	// tearing the player down when the broadcast ends.

	// Status → translation key; `statusMessage` below resolves through `$t`
	// so the text follows the FR/EN toggle live.
	const STATUS_MESSAGE_KEYS: Record<string, TranslationKey> = {
		offline: 'live.status.offline',
		listening: 'live.status.listening',
		availablePressPlay: 'live.status.availablePressPlay',
		waiting: 'live.status.waiting',
		cannotPlay: 'live.status.cannotPlay',
		unavailable: 'live.status.unavailable'
	};

	let hasError = $state(false);
	let lastCheckedAt = $state('');
	let statusKey = $state('waiting');
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let noAudioGraceTimer: ReturnType<typeof setTimeout> | null = null;
	let offlineStreak = 0;
	let listenerCount = $state(0);
	let keepLiveUi = $state(false);
	let probeReachable = $state(false);
	let broadcastTitle: string | null = $state(null);
	let broadcastDescription: string | null = $state(null);
	let broadcastThumbnail: string | null = $state(null);
	let broadcastThumbnailBroken = $state(false);
	let thumbnailExpanded = $state(false);
	let descriptionExpanded = $state(false);

	// Direct URL to the audio source, received from the server via radio-state.
	// Bypasses the serverless proxy which has execution time limits.
	let directStreamUrl = '';
	// HLS DVR playlist (when the server advertises one) — preferred by the
	// player for pause/resume + seek-back + jump-to-live.
	let hlsStreamUrl = '';
	// Fallback proxy URL — used only when the server hasn't sent a direct URL yet.
	const proxyStreamUrl = '/api/live/audio';

	const OFFLINE_THRESHOLD = 6;
	const NO_AUDIO_GRACE_MS = 30_000;

	// ── Global-player bridge ───────────────────────────────────────

	let liveTrackSelected = $derived(isLiveStreamTrack($selectAudio));
	let livePlaying = $derived(liveTrackSelected && $isPlaying);
	// Sticky "the broadcast is proven on air" flag: set on first successful
	// playback, cleared only when the stream is confirmed offline. Keeps the
	// live UI (title, thumbnail, transcript) up across a pause.
	let confirmedLive = $state(false);
	$effect(() => {
		if (livePlaying) confirmedLive = true;
	});
	let showLive = $derived(confirmedLive || keepLiveUi);
	let awaitingPlay = $derived(probeReachable && !livePlaying && !confirmedLive && !keepLiveUi);
	let canPlay = $derived(probeReachable || livePlaying || confirmedLive);
	let statusMessage = $derived(
		STATUS_MESSAGE_KEYS[statusKey] ? $t(STATUS_MESSAGE_KEYS[statusKey]) : ''
	);
	let checkedAtLabel = $derived(
		lastCheckedAt
			? new Date(lastCheckedAt).toLocaleTimeString('fr-FR', {
					hour: '2-digit',
					minute: '2-digit',
					second: '2-digit'
				})
			: ''
	);

	function buildLiveTrack(): LiveStreamTrack {
		return createLiveStreamTrack({
			title: broadcastTitle || $t('live.audioLive'),
			url: directStreamUrl || proxyStreamUrl,
			hlsUrl: hlsStreamUrl || null,
			thumbnailUrl: broadcastThumbnail
		});
	}

	/** Hand the live stream to the global player and start playback. */
	function startLivePlayback() {
		if (!browser) return;
		if (liveTrackSelected) {
			// Already loaded (paused, or a blocked autoplay) — the play event
			// runs the player's gesture-safe resume path synchronously.
			window.dispatchEvent(new CustomEvent('missionnaire-audio-play'));
			return;
		}
		const track = buildLiveTrack();
		basePlaylist.set([track]);
		playlist.set([track]);
		currentIndex.set(0);
		selectAudio.set(track);
		isPlaying.set(true);
	}

	function pauseLivePlayback() {
		if (!browser || !liveTrackSelected) return;
		window.dispatchEvent(new CustomEvent('missionnaire-audio-pause'));
	}

	/** Broadcast over (or confirmed offline) — close the global player if it
	 *  is still holding the live track. */
	function stopLivePlayback() {
		if (!browser || !liveTrackSelected) return;
		window.dispatchEvent(new CustomEvent('missionnaire-audio-close'));
		playlist.set([]);
		basePlaylist.set([]);
	}

	const togglePlay = () => {
		if (livePlaying) {
			pauseLivePlayback();
			return;
		}
		if (!probeReachable && !liveTrackSelected) {
			hasError = true;
			statusKey = 'offline';
			return;
		}
		hasError = false;
		startLivePlayback();
	};

	// Keep the selected live track's metadata in sync with what the admin
	// broadcasts (title/thumbnail edits, or the direct URL arriving after a
	// proxy start). The URL only changes in the rare proxy→direct case, and
	// the player ignores metadata-only updates (same URL → no reload).
	$effect(() => {
		if (!browser || !liveTrackSelected) return;
		const current = $selectAudio as LiveStreamTrack;
		const desiredUrl = directStreamUrl || proxyStreamUrl;
		const desiredHls = hlsStreamUrl || null;
		const desiredTitle = broadcastTitle || current.title;
		const desiredThumb = broadcastThumbnail ?? null;
		if (
			current.url !== desiredUrl ||
			current.hlsUrl !== desiredHls ||
			current.title !== desiredTitle ||
			current.thumbnail_url !== desiredThumb
		) {
			const track = createLiveStreamTrack({
				title: desiredTitle,
				url: desiredUrl,
				hlsUrl: desiredHls,
				thumbnailUrl: desiredThumb
			});
			basePlaylist.set([track]);
			playlist.set([track]);
			currentIndex.set(0);
			selectAudio.set(track);
		}
	});

	// Status text follows the player state.
	$effect(() => {
		if (livePlaying) {
			statusKey = 'listening';
		} else if (probeReachable && statusKey === 'listening') {
			statusKey = 'availablePressPlay';
		}
	});

	function openThumbnail() {
		if (!broadcastThumbnail) return;
		thumbnailExpanded = true;
	}

	function closeThumbnail() {
		thumbnailExpanded = false;
	}

	function handleLightboxKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeThumbnail();
	}

	function handleBackdropClick(e: MouseEvent) {
		// Only close when the click is on the backdrop itself, not on the image
		// or the close button. This avoids putting click handlers on the <img>,
		// which triggers Svelte's a11y warnings.
		if (e.target === e.currentTarget) closeThumbnail();
	}

	// ── Autoplay ───────────────────────────────────────────────────
	// Attempt playback when the broadcast becomes reachable. Browsers block
	// play() without a prior user gesture, so we also arm a document-wide
	// one-shot listener: the listener's first tap/click/keypress anywhere on
	// the page starts playback (the dispatch runs the player's play handler
	// synchronously inside the gesture stack, which iOS requires).
	let hasAttemptedAutoplay = false;
	let autoplayGestureAttached = false;

	function tryAutoplay() {
		if (hasAttemptedAutoplay || !browser) return;
		if (!probeReachable || livePlaying) return;
		hasAttemptedAutoplay = true;
		startLivePlayback();
		attachAutoplayGestureListener();
	}

	function handleAutoplayGesture() {
		detachAutoplayGestureListener();
		if (!probeReachable || livePlaying) return;
		startLivePlayback();
	}

	function attachAutoplayGestureListener() {
		if (autoplayGestureAttached || !browser) return;
		autoplayGestureAttached = true;
		document.addEventListener('pointerdown', handleAutoplayGesture, { capture: true });
		document.addEventListener('keydown', handleAutoplayGesture, { capture: true });
	}

	function detachAutoplayGestureListener() {
		if (!autoplayGestureAttached || !browser) return;
		autoplayGestureAttached = false;
		document.removeEventListener('pointerdown', handleAutoplayGesture, { capture: true });
		document.removeEventListener('keydown', handleAutoplayGesture, { capture: true });
	}

	// Playback achieved (autoplay or gesture) — the one-shot listener is done.
	$effect(() => {
		if (livePlaying) detachAutoplayGestureListener();
	});

	// ── Broadcast status handling ──────────────────────────────────

	function clearNoAudioGraceTimer() {
		if (noAudioGraceTimer) {
			clearTimeout(noAudioGraceTimer);
			noAudioGraceTimer = null;
		}
	}

	function cancelNoAudioGrace() {
		clearNoAudioGraceTimer();
		keepLiveUi = false;
	}

	function startNoAudioGrace() {
		if (noAudioGraceTimer) return;
		clearNoAudioGraceTimer();
		keepLiveUi = true;
		noAudioGraceTimer = setTimeout(() => {
			noAudioGraceTimer = null;
			keepLiveUi = false;
			// Still playing (e.g. server-side silence fallback riding out a
			// source blip) — keep the live UI and let the offline threshold
			// decide.
			if (livePlaying) return;
			confirmedLive = false;
			probeReachable = false;
			hasError = false;
			statusKey = 'offline';
			stopLivePlayback();
		}, NO_AUDIO_GRACE_MS);
	}

	function goOfflineConfirmed() {
		cancelNoAudioGrace();
		confirmedLive = false;
		probeReachable = false;
		hasError = false;
		statusKey = 'offline';
		// Reset autoplay state so the next live cycle gets a fresh attempt
		// (and doesn't sit on a dangling gesture listener).
		hasAttemptedAutoplay = false;
		detachAutoplayGestureListener();
		stopLivePlayback();
		radioIsLiveStore.set(false);
		startOfflineWatcher();
	}

	function handleStatusEvent(
		liveNow: boolean,
		checkedAt: string,
		listeners: number,
		streamUrl?: string,
		hlsUrl?: string
	) {
		lastCheckedAt = checkedAt;
		listenerCount = listeners;
		if (streamUrl) directStreamUrl = streamUrl;
		if (hlsUrl) hlsStreamUrl = hlsUrl;

		// Update the global store so the banner and other components react
		radioIsLiveStore.set(liveNow);

		if (liveNow) {
			cancelNoAudioGrace();
			stopOfflineWatcher();
			offlineStreak = 0;
			probeReachable = true;
			hasError = false;

			if (livePlaying) {
				statusKey = 'listening';
			} else {
				statusKey = 'availablePressPlay';
				// First time the stream is reachable on this page load — try to
				// start playback immediately. Falls back to the first-gesture
				// listener if the browser requires a user gesture.
				tryAutoplay();
			}
		} else {
			if (livePlaying || keepLiveUi || probeReachable) {
				startNoAudioGrace();
			}

			offlineStreak += 1;

			if (offlineStreak >= OFFLINE_THRESHOLD) {
				goOfflineConfirmed();
			} else if (!livePlaying) {
				statusKey = 'waiting';
			}
		}
	}

	// ── State refresh ─────────────────────────────────────────────
	// State is push-driven:
	//  - SSR seeds initial state via the parent layout's data.
	//  - One on-mount fetch of /api/live/radio-state hydrates this component.
	//  - Service-Worker push events flip live state immediately, no network.
	//  - While the live stream is playing, a slow 60s tick to
	//    /api/live/radio-state refreshes the listener count and admin-edited
	//    metadata (title, thumbnail).
	//  - Stopping audio or hiding the tab stops the tick entirely.

	const STATE_REFRESH_INTERVAL = 60_000; // 60s — only while playing + visible

	type RadioStatePayload = {
		isLive: boolean;
		checkedAt: string;
		listeners: number;
		streamUrl?: string;
		hlsUrl?: string;
		title?: string | null;
		description?: string | null;
		thumbnailUrl?: string | null;
	};

	async function fetchRadioState(): Promise<void> {
		try {
			const response = await fetch('/api/live/radio-state');
			if (!response.ok) return;
			const data = (await response.json()) as RadioStatePayload;
			broadcastTitle = data.title ?? null;
			broadcastDescription = data.description ?? null;
			const nextThumb = data.thumbnailUrl ?? null;
			if (nextThumb !== broadcastThumbnail) broadcastThumbnailBroken = false;
			broadcastThumbnail = nextThumb;
			handleStatusEvent(
				data.isLive,
				data.checkedAt,
				data.listeners,
				data.streamUrl,
				data.hlsUrl
			);
		} catch {
			// Network error — keep current state.
		}
	}

	function startStateRefresh() {
		if (pollTimer) return;
		pollTimer = setInterval(() => {
			void fetchRadioState();
		}, STATE_REFRESH_INTERVAL);
	}

	function stopStateRefresh() {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	}

	// React to play/pause: only spend network while the live stream is
	// actually playing and the tab is visible.
	$effect(() => {
		if (!browser) return;
		if (livePlaying && document.visibilityState === 'visible') {
			startStateRefresh();
		} else {
			stopStateRefresh();
		}
	});

	// ── Offline watcher ───────────────────────────────────────────
	// After a confirmed offline, keep checking quietly for a few minutes so a
	// server-side blip that recovers (Icecast restart) brings the card — and
	// autoplay — back to life on its own.

	const OFFLINE_WATCH_INTERVAL_MS = 12_000;
	const OFFLINE_WATCH_WINDOW_MS = 3 * 60_000;
	let offlineWatchTimer: ReturnType<typeof setInterval> | null = null;
	let offlineWatchUntil = 0;

	function startOfflineWatcher() {
		offlineWatchUntil = Date.now() + OFFLINE_WATCH_WINDOW_MS;
		if (offlineWatchTimer) return;
		offlineWatchTimer = setInterval(() => {
			if (Date.now() > offlineWatchUntil) {
				stopOfflineWatcher();
				return;
			}
			if (document.visibilityState !== 'visible') return;
			void fetchRadioState();
		}, OFFLINE_WATCH_INTERVAL_MS);
	}

	function stopOfflineWatcher() {
		if (offlineWatchTimer) {
			clearInterval(offlineWatchTimer);
			offlineWatchTimer = null;
		}
	}

	// ── Push-driven updates (Service Worker → BroadcastChannel) ──
	let radioBroadcast: BroadcastChannel | null = null;
	let swMessageListener: ((event: MessageEvent) => void) | null = null;

	function handleRadioPush() {
		// A go-live push just landed. Refresh state immediately so the player
		// flips to live with fresh metadata; no need to wait for the next tick.
		void fetchRadioState();
	}

	// ── Lifecycle ──────────────────────────────────────────────────

	onMount(() => {
		if (!browser) return;

		// Initial paint — hydrate live state + listener count.
		void fetchRadioState();

		document.addEventListener('visibilitychange', handleVisibilityChange);

		try {
			radioBroadcast = new BroadcastChannel('radio-state');
			radioBroadcast.addEventListener('message', (event) => {
				if (event.data?.type === 'RADIO_PUSH') handleRadioPush();
			});
		} catch {
			/* BroadcastChannel unsupported */
		}

		swMessageListener = (event: MessageEvent) => {
			if (event.data?.type !== 'RADIO_PUSH') return;
			handleRadioPush();
		};
		navigator.serviceWorker?.addEventListener('message', swMessageListener);
	});

	onDestroy(() => {
		stopStateRefresh();
		stopOfflineWatcher();
		clearNoAudioGraceTimer();
		detachAutoplayGestureListener();
		if (browser) {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			if (swMessageListener) {
				navigator.serviceWorker?.removeEventListener('message', swMessageListener);
				swMessageListener = null;
			}
			radioBroadcast?.close();
			radioBroadcast = null;
		}
		// NOTE: playback deliberately survives navigation — the global player
		// keeps the live stream running while the listener browses the site.
	});

	function handleVisibilityChange() {
		if (document.visibilityState === 'visible') {
			// Tab regained focus — refresh once and (if playing) restart the tick.
			void fetchRadioState();
			if (livePlaying) startStateRefresh();
		} else {
			stopStateRefresh();
		}
	}
</script>

<div class="space-y-4">
	<!-- Main player card -->
	<div
		class="relative border p-5 md:p-8 transition-all duration-500 {showLive
			? 'border-red-200 bg-red-50/30'
			: awaitingPlay
				? 'border-missionnaire/40 bg-orange-50/30 radio-pulse'
				: 'border-stone-200/60 bg-white/40'}"
	>
		<!-- Status indicator -->
		<div class="flex items-center gap-2.5 mb-3 md:mb-4">
			<span class="relative inline-flex h-2.5 w-2.5">
				{#if showLive || awaitingPlay}
					<span
						class="absolute inline-flex h-full w-full animate-ping rounded-full {showLive
							? 'bg-red-500'
							: 'bg-missionnaire'} opacity-75"
					></span>
				{/if}
				<span
					class="relative inline-flex h-2.5 w-2.5 rounded-full {showLive
						? 'bg-red-500'
						: awaitingPlay
							? 'bg-missionnaire'
							: 'bg-stone-300'}"
				></span>
			</span>
			<span
				class="text-[10px] font-bold uppercase tracking-[0.25em] font-body {showLive
					? 'text-red-600'
					: awaitingPlay
						? 'text-missionnaire'
						: 'text-stone-400'}"
			>
				{showLive
					? $t('live.audioLive')
					: awaitingPlay
						? $t('live.audioAvailable')
						: $t('live.audioOffline')}
			</span>
			{#if listenerCount > 0 && showLive}
				<span class="text-[10px] text-red-400 font-body">
					· {listenerCount}
					{listenerCount === 1 ? $t('live.listener') : $t('live.listeners')}
				</span>
			{/if}
		</div>

		<!-- Title + thumbnail (2-column when thumbnail available) -->
		<div class="flex flex-col md:flex-row md:items-start gap-6">
			<div class="flex-1 min-w-0">
				<h2
					class="font-display text-xl md:text-3xl font-semibold {showLive
						? 'text-stone-900'
						: awaitingPlay
							? 'text-stone-900'
							: 'text-stone-700'}"
				>
					{showLive && broadcastTitle
						? broadcastTitle
						: showLive
							? $t('live.audioLive')
							: awaitingPlay
								? $t('live.audioLive')
								: $t('live.audioOffline')}
				</h2>
				<p class="text-sm text-stone-500 font-body mt-1.5">
					{statusMessage}
				</p>
				{#if checkedAtLabel}
					<p class="text-[11px] text-stone-400 font-body mt-1">
						{$t('live.lastChecked', { time: checkedAtLabel })}
					</p>
				{/if}

				<!-- Controls: play/pause hands off to the global bottom player,
				     which carries the full control set (volume, sleep timer…). -->
				<div class="flex items-center gap-2 md:gap-3 mt-4 md:mt-6">
					<button
						class="inline-flex items-center gap-2 px-4 py-2.5 md:px-6 md:py-3 min-h-11 text-[12px] font-bold uppercase tracking-[0.15em] font-body whitespace-nowrap transition-all duration-300 {canPlay
							? showLive
								? 'bg-red-600 hover:bg-red-700 text-white'
								: 'bg-stone-900 hover:bg-missionnaire text-white'
							: 'bg-stone-200 text-stone-400 cursor-not-allowed'}"
						onclick={togglePlay}
						aria-label={livePlaying ? $t('live.pause') : $t('live.listen')}
						disabled={!canPlay}
					>
						{#if livePlaying}
							<svg viewBox="0 0 24 24" class="h-4 w-4 fill-current" aria-hidden="true">
								<path d="M8 5h3v14H8zm5 0h3v14h-3z" />
							</svg>
							<span>{$t('player.pause')}</span>
						{:else}
							<svg viewBox="0 0 24 24" class="h-4 w-4 fill-current" aria-hidden="true">
								<path d="M8 5v14l11-7z" />
							</svg>
							<span>{$t('player.play')}</span>
						{/if}
					</button>
				</div>
			</div>

			{#if showLive}
				<div class="md:w-56 md:shrink-0 order-first md:order-last">
					{#if broadcastThumbnail && !broadcastThumbnailBroken}
						<button
							type="button"
							onclick={openThumbnail}
							aria-label={$t('live.expandThumbnail')}
							class="group relative aspect-video w-full overflow-hidden border border-stone-200/60 bg-stone-100 cursor-zoom-in transition-all duration-300 hover:border-missionnaire/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40"
						>
							<img
								src={broadcastThumbnail}
								alt={broadcastTitle || $t('live.thumbnailAlt')}
								onerror={() => (broadcastThumbnailBroken = true)}
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
							<div class="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
								<picture>
									<source srcset="/icons/logo.webp" type="image/webp" />
									<img
										src="/icons/logo.png"
										alt=""
										class="h-9 w-auto opacity-90"
										width="150"
										height="64"
										loading="eager"
									/>
								</picture>
								<div
									class="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.25em] text-red-600 font-body"
								>
									<span class="relative inline-flex h-1.5 w-1.5">
										<span
											class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"
										></span>
										<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500"></span>
									</span>
									{$t('live.atLive')}
								</div>
							</div>
							<!-- Decorative ornament -->
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
			{/if}
		</div>
	</div>

	<!-- Description (YouTube-style expandable block under the player) -->
	{#if showLive && broadcastDescription}
		{@const isLong =
			broadcastDescription.length > 280 || (broadcastDescription.match(/\n/g)?.length ?? 0) >= 3}
		<div class="border border-stone-200/60 bg-white/40 p-5 md:p-8">
			<p
				class="text-[10px] font-bold uppercase tracking-[0.25em] text-missionnaire/80 font-body mb-3"
			>
				{$t('live.aboutBroadcast')}
			</p>
			<div
				class="text-sm text-stone-700 font-body leading-relaxed whitespace-pre-wrap"
				class:description-collapsed={isLong && !descriptionExpanded}
			>
				{broadcastDescription}
			</div>
			{#if isLong}
				<button
					type="button"
					onclick={() => (descriptionExpanded = !descriptionExpanded)}
					class="mt-3 text-[11px] font-bold uppercase tracking-[0.15em] font-body text-missionnaire hover:text-missionnaire-dark transition-colors"
				>
					{descriptionExpanded ? `${$t('misc.seeLess')} ↑` : `${$t('misc.seeMore')} ↓`}
				</button>
			{/if}
		</div>
	{/if}

	<!-- Synced transcript — renders nothing unless the broadcast has an SRT
	     attached (the component polls radio-state itself). Position comes from
	     the global player via the livePlayback store. -->
	{#if showLive}
		<LiveTranscript />
	{/if}

	<!-- Offline: only surface a message when the listener tapped Lecture
	     while the stream is down. The "page updates automatically" copy
	     already lives in the page header, so no full card is shown
	     otherwise — that keeps the rediffusions list in view. -->
	{#if !showLive && hasError}
		<div class="border border-red-200 bg-red-50/50 px-4 py-3">
			<p class="text-[12px] font-semibold text-red-600 font-body">
				{$t('live.notAvailableYet')}
			</p>
		</div>
	{/if}
</div>

<svelte:window onkeydown={handleLightboxKeydown} />

{#if thumbnailExpanded && broadcastThumbnail && !broadcastThumbnailBroken}
	<!-- Lightbox: click backdrop or press Escape to close. Image inside
	     stops propagation so clicking the image itself doesn't dismiss. -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-lightbox-in"
		onclick={handleBackdropClick}
		onkeydown={handleLightboxKeydown}
		use:focusTrap={{ onEscape: closeThumbnail }}
		role="dialog"
		aria-modal="true"
		aria-label={$t('live.thumbnailAlt')}
		tabindex="-1"
	>
		<button
			type="button"
			onclick={closeThumbnail}
			aria-label={$t('live.closeLightbox')}
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
			src={broadcastThumbnail}
			alt={broadcastTitle || $t('live.thumbnailAlt')}
			onerror={() => {
				broadcastThumbnailBroken = true;
				closeThumbnail();
			}}
			class="max-h-[90vh] max-w-[90vw] object-contain shadow-2xl"
		/>
	</div>
{/if}

<style>
	.radio-pulse {
		animation: radio-glow 2.5s ease-in-out infinite;
	}

	@keyframes radio-glow {
		0%,
		100% {
			box-shadow: 0 0 0 0 rgba(255, 136, 12, 0);
		}
		50% {
			box-shadow: 0 0 0 6px rgba(255, 136, 12, 0.12);
		}
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

	/* Default live thumbnail — warm stone gradient matching the site palette */
	.default-thumbnail {
		background:
			radial-gradient(circle at 30% 20%, rgba(255, 136, 12, 0.08), transparent 60%),
			linear-gradient(135deg, #faf6f1 0%, #f1eae0 100%);
	}

	/* Collapsed description: show first ~3 lines then fade, expand on click */
	.description-collapsed {
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
