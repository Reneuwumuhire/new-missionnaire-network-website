<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';

	const STATUS_MESSAGES: Record<string, string> = {
		offline: 'La radio est hors ligne',
		listening: 'Vous écoutez le direct',
		connecting: 'Connexion en cours...',
		reconnecting: 'Reconnexion en cours...',
		availablePressPlay: 'Direct disponible. Appuyez sur Lecture.',
		waiting: 'En attente du signal...',
		cannotPlay: 'Impossible de lire le direct pour le moment',
		unavailable: 'Le direct est indisponible pour le moment'
	};

	let audio: HTMLAudioElement | null = null;
	let isPlaying = false;
	let isMuted = false;
	let isBuffering = false;
	let hasError = false;
	let lastCheckedAt = '';
	let statusKey = 'waiting';
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let offlineStreak = 0;
	let userWantsToPlay = false;
	let listenerCount = 0;

	let probeReachable = false;
	let confirmedLive = false;
	let playbackFailed = false;

	// Direct URL to the audio source, received from the server via SSE.
	// Bypasses the serverless proxy which has execution time limits.
	let directStreamUrl = '';

	// Fallback proxy URL — used only when the server hasn't sent a direct URL yet.
	const proxyStreamUrl = '/api/live/audio';

	// Auto-reconnect state
	let reconnectAttempts = 0;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	const MAX_RECONNECT_ATTEMPTS = 8;
	const RECONNECT_DELAYS = [1000, 2000, 3000, 5000, 5000, 10000, 10000, 15000];

	const OFFLINE_THRESHOLD = 6;

	// Stable session ID for listener tracking — survives page refresh
	// but not tab close, so the DB record is reused on refresh.
	function getSessionId(): string {
		if (!browser) return '';
		let id = sessionStorage.getItem('radio-session-id');
		if (!id) {
			id = crypto.randomUUID();
			sessionStorage.setItem('radio-session-id', id);
		}
		return id;
	}

	/** Get the best stream URL — prefer direct, fall back to proxy */
	function getStreamUrl(): string {
		const base = directStreamUrl || proxyStreamUrl;
		return `${base}${base.includes('?') ? '&' : '?'}t=${Date.now()}`;
	}

	$: showLive = confirmedLive;
	// Button stays enabled after failure so user can manually retry
	$: canPlay = probeReachable || confirmedLive || playbackFailed;
	$: statusMessage = STATUS_MESSAGES[statusKey] || '';
	$: checkedAtLabel = lastCheckedAt
		? new Date(lastCheckedAt).toLocaleTimeString('fr-FR', {
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit'
		  })
		: '';

	// ── SSE status handler ─────────────────────────────────────────

	function handleStatusEvent(liveNow: boolean, checkedAt: string, listeners: number, streamUrl?: string) {
		lastCheckedAt = checkedAt;
		listenerCount = listeners;
		if (streamUrl) directStreamUrl = streamUrl;

		if (liveNow) {
			offlineStreak = 0;
			probeReachable = true;

			// If playback previously failed, DON'T update the status text.
			// The UI stays at offline/unavailable until the user manually
			// clicks play. This prevents the on/off flicker from an
			// unreliable probe after the stream ends.
			if (playbackFailed) return;

			hasError = false;

			if (isPlaying) {
				statusKey = 'listening';
			} else if (isBuffering) {
				statusKey = reconnectAttempts > 0 ? 'reconnecting' : 'connecting';
			} else {
				statusKey = 'availablePressPlay';
			}
		} else {
			offlineStreak += 1;

			if (offlineStreak >= OFFLINE_THRESHOLD) {
				probeReachable = false;
				confirmedLive = false;
				playbackFailed = false; // Reset — confirmed offline, clean slate
				hasError = false;
				statusKey = 'offline';
				stopPlayback();
			} else if (!isPlaying && !isBuffering && !playbackFailed) {
				statusKey = 'waiting';
			}
		}
	}

	// ── Polling ───────────────────────────────────────────────────

	const POLL_INTERVAL = 10_000; // 10 seconds

	async function pollRadioStatus() {
		try {
			const sessionId = getSessionId();
			const response = await fetch(`/api/live/radio-poll?sid=${encodeURIComponent(sessionId)}`);
			if (!response.ok) return;
			const data = (await response.json()) as { isLive: boolean; checkedAt: string; listeners: number; streamUrl?: string };
			handleStatusEvent(data.isLive, data.checkedAt, data.listeners, data.streamUrl);
		} catch {
			// Network error — keep current state, will retry next interval
		}
	}

	function startPolling() {
		if (pollTimer) return;
		pollRadioStatus(); // immediate first poll
		pollTimer = setInterval(pollRadioStatus, POLL_INTERVAL);
	}

	function stopPolling() {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
	}

	// ── Lifecycle ──────────────────────────────────────────────────

	onMount(() => {
		if (!browser) return;

		startPolling();
		document.addEventListener('visibilitychange', handleVisibilityChange);
	});

	onDestroy(() => {
		stopPolling();
		clearReconnectTimer();
		if (browser) {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			// Notify server to remove listener
			const sid = getSessionId();
			if (sid) {
				navigator.sendBeacon?.(`/api/live/radio-poll?sid=${encodeURIComponent(sid)}&action=disconnect`);
			}
		}
	});

	function handleVisibilityChange() {
		if (document.visibilityState === 'visible') {
			// Resume polling and trigger immediate check
			startPolling();

			// Resume audio if user was listening
			if (userWantsToPlay && audio && audio.paused && !audio.ended) {
				attemptReconnect();
			}
		} else {
			// Pause polling when tab is hidden to save resources
			stopPolling();
		}
	}

	// ── Reconnect logic ───────────────────────────────────────────

	function clearReconnectTimer() {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
	}

	function stopPlayback() {
		clearReconnectTimer();
		reconnectAttempts = 0;
		if (isPlaying || isBuffering || userWantsToPlay) {
			isPlaying = false;
			isBuffering = false;
			userWantsToPlay = false;
			audio?.pause();
			if (audio) {
				audio.removeAttribute('src');
				audio.load();
			}
		}
	}

	function attemptReconnect() {
		if (!audio || !userWantsToPlay) return;
		if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
			userWantsToPlay = false;
			confirmedLive = false;
			playbackFailed = true;
			hasError = true;
			statusKey = 'unavailable';
			reconnectAttempts = 0;
			clearReconnectTimer();
			// Only clear src when fully giving up
			if (audio) {
				audio.removeAttribute('src');
				audio.load();
			}
			return;
		}

		isBuffering = true;
		statusKey = 'reconnecting';

		const delay = RECONNECT_DELAYS[reconnectAttempts] ?? RECONNECT_DELAYS[RECONNECT_DELAYS.length - 1];
		reconnectAttempts += 1;

		clearReconnectTimer();
		reconnectTimer = setTimeout(() => {
			if (!audio || !userWantsToPlay) return;

			// Fresh src — the browser reuses the audio session from the
			// user's initial play tap, so play() works on mobile.
			audio.src = getStreamUrl();
			audio.load();
			audio.play().catch(() => {
				// play() rejected — handleError will fire and retry
			});
		}, delay);
	}

	// ── User controls ──────────────────────────────────────────────

	const togglePlay = async () => {
		if (!audio) return;

		if (!audio.paused || reconnectTimer) {
			userWantsToPlay = false;
			clearReconnectTimer();
			reconnectAttempts = 0;
			audio.pause();
			confirmedLive = false;
			return;
		}

		if (!probeReachable && !confirmedLive) {
			hasError = true;
			statusKey = 'offline';
			return;
		}

		hasError = false;
		isBuffering = true;
		userWantsToPlay = true;
		playbackFailed = false;
		reconnectAttempts = 0;
		statusKey = 'connecting';

		audio.src = getStreamUrl();
		audio.load();

		try {
			await audio.play();
		} catch (error) {
			console.error('[LiveRadio] Playback error:', error);
			hasError = true;
			isPlaying = false;
			isBuffering = false;
			userWantsToPlay = false;
			statusKey = 'cannotPlay';
		}
	};

	const toggleMute = () => {
		if (!audio) return;
		audio.muted = !audio.muted;
		isMuted = audio.muted;
	};

	// ── Audio element event handlers ───────────────────────────────

	const handlePlay = () => {
		isPlaying = true;
		isBuffering = false;
		hasError = false;
		confirmedLive = true;
		playbackFailed = false;
		reconnectAttempts = 0;
		clearReconnectTimer();
		statusKey = 'listening';
	};

	const handlePause = () => {
		isPlaying = false;
		isBuffering = false;

		if (probeReachable && !userWantsToPlay) {
			statusKey = 'availablePressPlay';
		}
	};

	const handleWaiting = () => {
		// 'waiting' fires during normal buffering (network hiccup).
		// This is completely normal on mobile — don't treat as error.
		isBuffering = true;
		if (userWantsToPlay) {
			statusKey = reconnectAttempts > 0 ? 'reconnecting' : 'connecting';
		}
	};

	const handleStalled = () => {
		// 'stalled' means data stopped arriving — common on mobile networks.
		// NOT an error. The browser will keep trying. Just show buffering.
		if (isPlaying || userWantsToPlay) {
			isBuffering = true;
			statusKey = 'connecting';
		}
	};

	const handleCanPlay = () => {
		isBuffering = false;
		if (isPlaying) {
			statusKey = 'listening';
		}
	};

	const handleEnded = () => {
		isPlaying = false;
		isBuffering = false;
		confirmedLive = false;
		playbackFailed = true;

		if (userWantsToPlay) {
			attemptReconnect();
		} else {
			statusKey = 'offline';
		}
	};

	const handleError = () => {
		// Don't react to errors on an empty src (we cleared it intentionally)
		if (!audio?.src || audio.src === location.href) return;

		isPlaying = false;
		isBuffering = false;
		confirmedLive = false;

		if (userWantsToPlay) {
			// Don't clear the src or give up — just set a fresh URL and
			// let the audio element reconnect. This is mobile-friendly:
			// the browser reuses the existing audio session from the
			// user's initial tap, so no autoplay policy issues.
			playbackFailed = false; // allow UI updates during reconnect
			attemptReconnect();
		} else {
			playbackFailed = true;
		}
	};
</script>

<div class="space-y-4">
	<!-- Main player card -->
	<div
		class="border p-6 md:p-8 transition-all duration-500 {showLive
			? 'border-red-200 bg-red-50/30'
			: 'border-stone-200/60 bg-white/40'}"
	>
		<!-- Status indicator -->
		<div class="flex items-center gap-2.5 mb-4">
			<span class="relative inline-flex h-2.5 w-2.5">
				{#if showLive}
					<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"></span>
				{/if}
				<span class="relative inline-flex h-2.5 w-2.5 rounded-full {showLive ? 'bg-red-500' : 'bg-stone-300'}"></span>
			</span>
			<span class="text-[10px] font-bold uppercase tracking-[0.25em] font-body {showLive ? 'text-red-600' : 'text-stone-400'}">
				{showLive ? 'En direct' : 'Radio hors ligne'}
			</span>
			{#if listenerCount > 0 && showLive}
				<span class="text-[10px] text-red-400 font-body">
					· {listenerCount} {listenerCount === 1 ? 'auditeur' : 'auditeurs'}
				</span>
			{/if}
		</div>

		<!-- Title and status -->
		<h2 class="font-display text-2xl md:text-3xl font-semibold {showLive ? 'text-stone-900' : 'text-stone-700'}">
			{showLive ? 'Radio en direct' : 'Radio hors ligne'}
		</h2>
		<p class="text-sm text-stone-500 font-body mt-1.5">
			{statusMessage}
		</p>
		{#if checkedAtLabel}
			<p class="text-[11px] text-stone-400 font-body mt-1">
				Dernière vérification : {checkedAtLabel}
			</p>
		{/if}

		<!-- Controls -->
		<div class="flex items-center gap-3 mt-6">
			<button
				class="inline-flex items-center gap-2.5 px-6 py-3 text-[12px] font-bold uppercase tracking-[0.15em] font-body transition-all duration-300 {canPlay
					? showLive
						? 'bg-red-600 hover:bg-red-700 text-white'
						: 'bg-stone-900 hover:bg-missionnaire text-white'
					: 'bg-stone-200 text-stone-400 cursor-not-allowed'}"
				on:click={togglePlay}
				aria-label={isPlaying ? 'Mettre en pause le direct' : 'Écouter le direct'}
				disabled={!canPlay}
			>
				{#if isPlaying}
					<svg viewBox="0 0 24 24" class="h-4 w-4 fill-current" aria-hidden="true">
						<path d="M8 5h3v14H8zm5 0h3v14h-3z" />
					</svg>
					<span>Pause</span>
				{:else}
					<svg viewBox="0 0 24 24" class="h-4 w-4 fill-current" aria-hidden="true">
						<path d="M8 5v14l11-7z" />
					</svg>
					<span>Lecture</span>
				{/if}
			</button>

			<button
				class="inline-flex items-center gap-2 px-5 py-3 border text-[12px] font-semibold font-body transition-all duration-300 {canPlay
					? 'border-stone-200/60 text-stone-600 hover:border-missionnaire hover:text-missionnaire'
					: 'border-stone-200/40 text-stone-300 cursor-not-allowed'}"
				on:click={toggleMute}
				aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
				disabled={!canPlay}
			>
				{#if isMuted}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
					<span>Son coupé</span>
				{:else}
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
					<span>Couper le son</span>
				{/if}
			</button>
		</div>

		<!-- Buffering indicator -->
		{#if isBuffering}
			<div class="flex items-center gap-2 mt-4">
				<div class="animate-spin h-3.5 w-3.5 border-t-2 border-missionnaire rounded-full"></div>
				<span class="text-[11px] text-stone-400 font-body">Chargement...</span>
			</div>
		{/if}
	</div>

	<!-- Offline info card -->
	{#if !showLive}
		<div class="border border-stone-200/60 bg-white/40 p-5 md:p-6">
			<p class="text-[10px] font-bold uppercase tracking-[0.25em] text-stone-400 font-body mb-2">
				Information
			</p>
			<p class="text-sm text-stone-500 font-body leading-relaxed">
				Cette page se met à jour automatiquement en temps réel.
				Dès que le direct commence, le bouton
				<span class="font-semibold text-stone-700">Lecture</span>
				devient actif.
			</p>
			{#if hasError}
				<p class="mt-3 text-[12px] font-semibold text-red-600 font-body">
					Le direct n'est pas encore disponible.
				</p>
			{/if}
		</div>
	{/if}

	{#if browser}
		<audio
			bind:this={audio}
			preload="none"
			on:play={handlePlay}
			on:pause={handlePause}
			on:waiting={handleWaiting}
			on:stalled={handleStalled}
			on:canplay={handleCanPlay}
			on:error={handleError}
			on:ended={handleEnded}
		></audio>
	{/if}
</div>
