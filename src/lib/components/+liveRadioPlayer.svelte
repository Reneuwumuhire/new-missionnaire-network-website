<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';

	const STATUS_MESSAGES: Record<string, string> = {
		offline: 'La radio est hors ligne',
		listening: 'Vous ecoutez le direct',
		connecting: 'Connexion en cours...',
		availablePressPlay: 'Direct disponible. Appuyez sur Lecture.',
		unstableReconnecting: 'Le direct est instable, reconnexion...',
		waiting: 'En attente du signal...',
		cannotPlay: 'Impossible de lire le direct pour le moment',
		unavailable: 'Le direct est indisponible pour le moment'
	};

	let audio: HTMLAudioElement | null = null;
	let isPlaying = false;
	let isMuted = false;
	let isBuffering = false;
	let hasError = false;
	let isLive = false;
	let lastCheckedAt = '';
	let statusKey = 'waiting';
	let eventSource: EventSource | null = null;
	let offlineStreak = 0;

	const OFFLINE_THRESHOLD = 3;
	const streamUrl = '/api/live/audio';

	$: showLive = isLive || isPlaying || isBuffering;
	$: canPlay = isLive || isPlaying;
	$: statusMessage = STATUS_MESSAGES[statusKey] || '';
	$: checkedAtLabel = lastCheckedAt
		? new Date(lastCheckedAt).toLocaleTimeString('fr-FR', {
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit'
		  })
		: '';

	function handleStatusEvent(liveNow: boolean, checkedAt: string) {
		lastCheckedAt = checkedAt;

		if (liveNow) {
			offlineStreak = 0;
			isLive = true;
			hasError = false;
			statusKey = isPlaying
				? 'listening'
				: isBuffering
				? 'connecting'
				: 'availablePressPlay';
		} else {
			offlineStreak += 1;
			if (isPlaying || isBuffering) {
				statusKey = 'unstableReconnecting';
			} else if (offlineStreak >= OFFLINE_THRESHOLD) {
				isLive = false;
				statusKey = 'offline';
				if (audio && !audio.paused) {
					audio.pause();
				}
			} else {
				statusKey = 'waiting';
			}
		}
	}

	onMount(() => {
		if (!browser) return;

		eventSource = new EventSource('/api/live/sse');

		eventSource.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data) as { isLive: boolean; checkedAt: string };
				handleStatusEvent(data.isLive, data.checkedAt);
			} catch (e) {
				console.error('[LiveRadio] Failed to parse SSE event:', e);
			}
		};

		eventSource.onerror = () => {
			// EventSource auto-reconnects; just update status while disconnected
			if (!isPlaying && !isBuffering) {
				statusKey = 'waiting';
			}
		};
	});

	onDestroy(() => {
		eventSource?.close();
	});

	const togglePlay = async () => {
		if (!audio) return;

		try {
			if (audio.paused) {
				if (!isLive) {
					hasError = true;
					statusKey = 'offline';
					return;
				}
				hasError = false;
				isBuffering = true;
				audio.load();
				await audio.play();
			} else {
				audio.pause();
			}
		} catch (error) {
			console.error('[LiveRadio] Playback error:', error);
			hasError = true;
			isPlaying = false;
			statusKey = 'cannotPlay';
		}
	};

	const toggleMute = () => {
		if (!audio) return;
		audio.muted = !audio.muted;
		isMuted = audio.muted;
	};

	const handlePlay = () => {
		isPlaying = true;
		isBuffering = false;
		hasError = false;
		isLive = true;
		offlineStreak = 0;
		statusKey = 'listening';
	};

	const handlePause = () => {
		isPlaying = false;
		if (isLive) {
			statusKey = 'availablePressPlay';
		}
	};

	const handleWaiting = () => {
		isBuffering = true;
		statusKey = 'connecting';
	};

	const handleCanPlay = () => {
		isBuffering = false;
		if (isPlaying) {
			statusKey = 'listening';
		}
	};

	const handleError = () => {
		hasError = true;
		isPlaying = false;
		isBuffering = false;
		statusKey = 'unavailable';
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
			src={streamUrl}
			preload="none"
			on:play={handlePlay}
			on:pause={handlePause}
			on:waiting={handleWaiting}
			on:canplay={handleCanPlay}
			on:error={handleError}
		/>
	{/if}
</div>
