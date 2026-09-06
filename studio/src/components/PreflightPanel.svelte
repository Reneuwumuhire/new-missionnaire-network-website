<script lang="ts">
	import { onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { pickMimeType } from '../lib/broadcast.svelte';
	import { t, type TranslationKey } from '../lib/i18n.svelte';
	import { handleForLayer, mediaVersion } from '../lib/media.svelte';
	import type { Mixer } from '../lib/mixer';
	import {
		destinationProblem,
		evaluatePreflight,
		requiredRecordingBytes,
		type PreflightCheckId,
		type PreflightLevel
	} from '../lib/preflight';
	import { recordsCloud, recordsLocal } from '../lib/recording.svelte';
	import { liveReady, preparedReady } from '../lib/service-workflow.svelte';
	import {
		audioLayers,
		destinationPlatform,
		destinationUrl,
		programScene,
		requiresYouTubeGoLive,
		studio
	} from '../lib/state.svelte';
	import {
		liveSession,
		refreshYouTubeStatus,
		sessionYouTubeChannelId
	} from '../lib/live-session.svelte';

	let {
		mixer,
		canvasReady,
		renderFps,
		onclose,
		onstart
	}: {
		mixer: Mixer | null;
		canvasReady: boolean;
		renderFps: number;
		onclose: () => void;
		onstart: () => void;
	} = $props();

	let checking = $state(true);
	let encoderReady = $state<boolean | null>(null);
	let encoderDetail = $state('');
	let availableRecordingBytes = $state<number | null>(null);
	let storageDetail = $state('');
	let audioPeak = $state(0);

	const selectedSession = $derived(
		liveSession.sessions.find((session) => session._id === liveSession.selectedId) ?? null
	);
	const enabledDestinations = $derived(
		studio.destinations.filter((destination) => destination.enabled)
	);
	const immediateDestinations = $derived(
		enabledDestinations.filter((destination) => !destination.hold)
	);
	const invalidDestinations = $derived(
		enabledDestinations
			.filter((destination) => destinationProblem(destinationUrl(destination)))
			.map((destination) => destination.name)
	);
	const mediaState = $derived.by(() => {
		void mediaVersion.n;
		const failed: string[] = [];
		const missing: string[] = [];
		for (const layer of programScene().layers) {
			if (!layer.visible || !['camera', 'screen', 'image', 'video'].includes(layer.kind)) continue;
			const handle = handleForLayer(layer);
			const optionalPicture =
				studio.service.type === 'prepared' && layer.id === studio.service.krefeldLayerId;
			if (handle?.error && !optionalPicture) failed.push(layer.name);
			else if (handle?.error) missing.push(layer.name);
			else if (!handle) missing.push(layer.name);
		}
		return { failed, missing };
	});
	const audioIds = $derived([
		...studio.audioSources.filter((source) => !source.muted).map((source) => source.id),
		...audioLayers()
			.filter((layer) => !layer.muted)
			.map((layer) => layer.id)
	]);
	const audioConfigured = $derived(studio.audioSources.length + audioLayers().length > 0);
	const audioMuted = $derived(audioConfigured && audioIds.length === 0);
	const audioConnected = $derived(audioIds.some((id) => mixer?.has(id)));
	const missionnaireEnabled = $derived(
		enabledDestinations.some((destination) => destinationPlatform(destination) === 'missionnaire')
	);
	const youtubeRequired = $derived(
		!selectedSession?.is_test &&
			(Boolean(selectedSession?.youtube_url) || requiresYouTubeGoLive(studio.destinations))
	);
	const youtubeConnected = $derived(
		Boolean(
			sessionYouTubeChannelId(selectedSession, liveSession.youtubeChannels) &&
			liveSession.youtubeChannels.length
		)
	);
	const requiredBytes = $derived(
		requiredRecordingBytes(studio.settings.videoBitrateKbps, studio.settings.audioBitrateKbps)
	);

	const checks = $derived(
		evaluatePreflight({
			hasSession: Boolean(selectedSession),
			destinationCount: immediateDestinations.length + (recordsLocal() ? 1 : 0),
			invalidDestinations,
			isOnline: navigator.onLine,
			recorderSupported: Boolean(pickMimeType()),
			encoderReady,
			canvasReady,
			failedSources: mediaState.failed,
			missingSources: mediaState.missing,
			audioConfigured,
			audioConnected,
			audioMuted,
			audioPeak,
			renderFps,
			targetFps: studio.settings.fps,
			adminRequired: missionnaireEnabled || recordsCloud() || Boolean(selectedSession),
			adminConnected: Boolean(liveSession.operatorName),
			missionnaireRequired: Boolean(selectedSession),
			missionnaireReady: liveSession.missionnaireReady,
			youtubeRequired,
			youtubeConnected,
			localRecording: recordsLocal(),
			availableRecordingBytes,
			requiredRecordingBytes: requiredBytes,
			serviceMissing: studio.service.type === 'prepared' ? preparedReady() : liveReady()
		})
	);
	const blockers = $derived(checks.filter(({ level }) => level === 'block').length);
	const warnings = $derived(checks.filter(({ level }) => level === 'warning').length);

	const labels: Record<PreflightCheckId, TranslationKey> = {
		session: 'preflight.session',
		destination: 'preflight.destination',
		network: 'preflight.network',
		encoder: 'preflight.encoder',
		canvas: 'preflight.canvas',
		sources: 'preflight.sources',
		audio: 'preflight.audio',
		rendering: 'preflight.rendering',
		admin: 'preflight.admin',
		missionnaire: 'preflight.missionnaire',
		youtube: 'preflight.youtube',
		service: 'preflight.service',
		storage: 'preflight.storage'
	};

	function stateLabel(level: PreflightLevel): string {
		if (level === 'block') return t('preflight.blocked');
		if (level === 'warning') return t('preflight.warning');
		return t('preflight.ready');
	}

	function detail(id: PreflightCheckId, fallback?: string): string {
		if (id === 'encoder') return encoderDetail || t('preflight.encoderChecking');
		if (id === 'storage') {
			return availableRecordingBytes === null
				? storageDetail || t('preflight.storageUnknown')
				: t('preflight.storageAvailable', {
						available: formatBytes(availableRecordingBytes),
						needed: formatBytes(requiredBytes)
					});
		}
		if (id === 'audio') {
			if (!audioConfigured) return t('preflight.audioMissing');
			if (audioMuted) return t('preflight.audioMuted');
			if (!audioConnected) return t('preflight.audioDisconnected');
			if (audioPeak < 0.001) return t('preflight.audioSilent');
			return t('preflight.audioMoving');
		}
		if (id === 'rendering') return t('preflight.renderingDetail', { fps: fallback ?? '' });
		if (id === 'sources' && fallback) return t('preflight.sourceDetail', { names: fallback });
		if (id === 'service' && fallback) return fallback;
		if (id === 'destination' && fallback)
			return t('preflight.destinationDetail', { names: fallback });
		return '';
	}

	function formatBytes(bytes: number): string {
		if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)} MB`;
		return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
	}

	async function runChecks() {
		checking = true;
		encoderReady = null;
		encoderDetail = '';
		availableRecordingBytes = null;
		storageDetail = '';
		audioPeak = 0;

		const work: Promise<void>[] = [
			invoke<{ version: string }>('check_ffmpeg')
				.then((result) => {
					encoderReady = true;
					encoderDetail = result.version.split('\n')[0];
				})
				.catch((error) => {
					encoderReady = false;
					encoderDetail = String(error);
				})
		];
		if (liveSession.operatorName) work.push(refreshYouTubeStatus());
		if (recordsLocal()) {
			work.push(
				invoke<{ path: string; availableBytes: number }>('recording_space')
					.then((result) => {
						availableRecordingBytes = result.availableBytes;
						storageDetail = result.path;
					})
					.catch((error) => {
						storageDetail = String(error);
					})
			);
		}
		await Promise.allSettled(work);
		checking = false;
	}

	onMount(() => {
		void runChecks();
		const meter = setInterval(() => {
			for (const id of audioIds) {
				const peak = mixer?.peaks(id) ?? [0, 0];
				audioPeak = Math.max(audioPeak, peak[0], peak[1]);
			}
		}, 100);
		return () => clearInterval(meter);
	});
</script>

<div class="space-y-4 p-5">
	<div>
		<p class="text-[13px] leading-relaxed text-fg/70">{t('preflight.intro')}</p>
		<p class="mt-1 text-[11px] leading-relaxed text-fg/40">{t('preflight.previewHint')}</p>
	</div>

	<div class="grid gap-2 sm:grid-cols-2">
		{#each checks as check (check.id)}
			{@const checkDetail = detail(check.id, check.detail)}
			<div
				class="border p-3 {check.level === 'block'
					? 'border-red-500/35 bg-red-500/[0.06]'
					: check.level === 'warning'
						? 'border-amber-500/35 bg-amber-500/[0.06]'
						: 'border-emerald-500/25 bg-emerald-500/[0.04]'}"
			>
				<div class="flex items-center gap-2">
					<span
						class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold {check.level ===
						'block'
							? 'bg-red-500/20 text-red-300'
							: check.level === 'warning'
								? 'bg-amber-500/20 text-amber-300'
								: 'bg-emerald-500/20 text-emerald-300'}"
						>{check.level === 'pass' ? '✓' : check.level === 'warning' ? '!' : '×'}</span
					>
					<strong class="min-w-0 flex-1 truncate text-[12px] text-fg/85"
						>{t(labels[check.id])}</strong
					>
					<span
						class="text-[9px] font-semibold uppercase tracking-wider {check.level === 'block'
							? 'text-red-300'
							: check.level === 'warning'
								? 'text-amber-300'
								: 'text-emerald-300'}">{stateLabel(check.level)}</span
					>
				</div>
				{#if checkDetail}
					<p class="mt-1.5 break-words pl-7 text-[10px] leading-relaxed text-fg/45">
						{checkDetail}
					</p>
				{/if}
			</div>
		{/each}
	</div>

	<div class="flex items-center justify-between gap-3 border-t border-ink-700 pt-4">
		<div class="text-[11px]">
			{#if blockers > 0}
				<span class="text-red-300">{t('preflight.blockerCount', { count: blockers })}</span>
			{:else if warnings > 0}
				<span class="text-amber-300">{t('preflight.warningCount', { count: warnings })}</span>
			{:else}
				<span class="text-emerald-300">{t('preflight.allReady')}</span>
			{/if}
		</div>
		<div class="flex gap-2">
			<button class="studio-chip px-3" disabled={checking} onclick={() => void runChecks()}>
				{checking ? t('preflight.checking') : t('preflight.runAgain')}
			</button>
			<button class="studio-chip px-3" onclick={onclose}>{t('common.cancel')}</button>
			<button
				class="bg-primary px-4 py-2 text-[12px] font-semibold text-black disabled:cursor-not-allowed disabled:opacity-35"
				disabled={checking || blockers > 0}
				onclick={onstart}
			>
				{warnings > 0 ? t('preflight.startAnyway') : t('preflight.start')}
			</button>
		</div>
	</div>
</div>
