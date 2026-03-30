<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';

	const STATUS_MESSAGES: Record<string, string> = {
		offline: 'La radio est hors ligne',
		listening: 'Vous ecoutez le direct',
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
	let eventSource: EventSource | null = null;
	let offlineStreak = 0;
	let userWantsToPlay = false;
	let listenerCount = 0;

	let probeReachable = false;
	let confirmedLive = false;

	// Auto-reconnect: uses audio.load() (not play()) so mobile browsers
	// don't block it. The existing audio session from the user's initial
	// tap satisfies the autoplay policy — load + play works after that.
	let reconnectAttempts = 0;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	const MAX_RECONNECT_ATTEMPTS = 8;
	const RECONNECT_DELAYS = [1000, 2000, 3000, 5000, 5000, 10000, 10000, 15000];

	const OFFLINE_THRESHOLD = 6;
	const streamUrl = '/api/live/audio';

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

	$: showLive = confirmedLive;
	$: canPlay = probeReachable || confirmedLive;
	$: statusMessage = STATUS_MESSAGES[statusKey] || '';
	$: checkedAtLabel = lastCheckedAt
		? new Date(lastCheckedAt).toLocaleTimeString('fr-FR', {
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit'
		  })
		: '';

	// ── SSE status handler ─────────────────────────────────────────

	function handleStatusEvent(liveNow: boolean, checkedAt: string, listeners: number) {
		lastCheckedAt = checkedAt;
		listenerCount = listeners;

		if (liveNow) {
			offlineStreak = 0;
			probeReachable = true;
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
				hasError = false;
				statusKey = 'offline';
				stopPlayback();
			} else if (!isPlaying && !isBuffering) {
				statusKey = 'waiting';
			}
		}
	}

	// ── Lifecycle ──────────────────────────────────────────────────

	onMount(() => {
		if (!browser) return;

		const sessionId = getSessionId();
		eventSource = new EventSource(`/api/live/sse?sid=${encodeURIComponent(sessionId)}`);

		eventSource.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data) as { isLive: boolean; checkedAt: string; listeners?: number };
				handleStatusEvent(data.isLive, data.checkedAt, data.listeners ?? 0);
			} catch (e) {
				console.error('[LiveRadio] Failed to parse SSE event:', e);
			}
		};

		eventSource.onerror = () => {
			if (!isPlaying && !isBuffering) {
				statusKey = 'waiting';
			}
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);
	});

	onDestroy(() => {
		eventSource?.close();
		clearReconnectTimer();
		if (browser) {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		}
	});

	function handleVisibilityChange() {
		if (document.visibilityState !== 'visible') return;
		if (!userWantsToPlay || !audio) return;

		if (audio.paused && !audio.ended) {
			attemptReconnect();
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
			hasError = true;
			statusKey = 'unavailable';
			reconnectAttempts = 0;
			clearReconnectTimer();
			return;
		}

		isBuffering = true;
		statusKey = 'reconnecting';

		const delay = RECONNECT_DELAYS[reconnectAttempts] ?? RECONNECT_DELAYS[RECONNECT_DELAYS.length - 1];
		reconnectAttempts += 1;

		clearReconnectTimer();
		reconnectTimer = setTimeout(() => {
			if (!audio || !userWantsToPlay) return;

			// Set a fresh src and load. On mobile, the audio session from the
			// user's initial play gesture is still active, so load + play works
			// without a new user gesture.
			audio.src = `${streamUrl}?t=${Date.now()}`;
			audio.load();
			// Don't call play() here — the audio element will fire 'canplay'
			// then we play from there, or it will fire 'error' to retry.
			audio.play().catch(() => {
				// play() rejected (e.g. mobile policy) — handleError will retry
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
		reconnectAttempts = 0;
		statusKey = 'connecting';

		audio.src = `${streamUrl}?t=${Date.now()}`;
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
		// Don't treat this as an error — the stream is just rebuffering.
		isBuffering = true;
		if (userWantsToPlay) {
			statusKey = reconnectAttempts > 0 ? 'reconnecting' : 'connecting';
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

		// Clear src to stop the browser's built-in retry storm
		if (audio) {
			audio.removeAttribute('src');
			audio.load();
		}

		if (userWantsToPlay) {
			attemptReconnect();
		}
	};
</script>

<div class="mb-8 space-y-4">
	<div
		class={`rounded-2xl border p-5 md:p-6 shadow-sm transition-colors ${
			showLive
				? 'border-red-200 bg-gradient-to-r from-red-50 via-white to-orange-50'
				: 'border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-100'
		}`}
	>
		<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
			<div class="space-y-2">
				<div class="flex items-center gap-2">
					<span class="relative inline-flex h-3 w-3">
						{#if showLive}
							<span
								class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75"
							></span>
						{/if}
						<span
							class={`relative inline-flex h-3 w-3 rounded-full ${
								showLive ? 'bg-red-600' : 'bg-slate-400'
							}`}
						></span>
					</span>
					<span
						class={`text-xs font-black uppercase tracking-[0.18em] ${
							showLive ? 'text-red-600' : 'text-slate-500'
						}`}
					>
						{showLive ? 'En direct' : 'Radio hors ligne'}
					</span>
				</div>
				<h2 class="text-2xl font-black text-slate-900">
					{showLive ? 'Radio en direct' : 'Radio hors ligne'}
				</h2>
				<p class="text-sm font-medium text-slate-600">
					{statusMessage}
				</p>
				{#if listenerCount > 0 && showLive}
					<p class="text-xs font-semibold text-red-500">
						{listenerCount} {listenerCount === 1 ? 'auditeur' : 'auditeurs'} en ligne
					</p>
				{/if}
				{#if checkedAtLabel}
					<p class="text-xs text-slate-500">
						Derniere verification: {checkedAtLabel}
					</p>
				{/if}
			</div>

			<div class="flex items-center gap-2">
				<button
					class={`inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-bold text-white shadow-md transition ${
						canPlay ? 'bg-red-600 hover:bg-red-700' : 'cursor-not-allowed bg-slate-400'
					}`}
					on:click={togglePlay}
					aria-label={isPlaying ? 'Mettre en pause le direct' : 'Ecouter le direct'}
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
					class="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-3 text-xs font-semibold text-slate-700 transition hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
					on:click={toggleMute}
					aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
					disabled={!canPlay}
				>
					{#if isMuted}
						<span>Activer le son</span>
					{:else}
						<span>Couper le son</span>
					{/if}
				</button>
			</div>
		</div>
	</div>

	{#if !showLive}
		<div class="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
			<p class="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
				Information
			</p>
			<p class="mt-2 text-lg font-bold text-slate-900">La radio est hors ligne</p>
			<p class="mt-2 text-sm text-slate-600">
				Cette page se met a jour automatiquement en temps reel.
				Des que le direct commence, le bouton
				<span class="font-bold">Lecture</span>
				devient actif.
			</p>
			{#if hasError}
				<p class="mt-3 text-sm font-semibold text-red-600">
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
			on:canplay={handleCanPlay}
			on:error={handleError}
			on:ended={handleEnded}
		/>
	{/if}
</div>
