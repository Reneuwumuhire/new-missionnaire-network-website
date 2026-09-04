<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import { broadcast, formatBytes, goLivePublic, isStreaming } from '../lib/broadcast.svelte';
	import { setStudioMode } from '../lib/compositor';
	import Dock from './Dock.svelte';
	import Icon from './Icon.svelte';
	import { t } from '../lib/i18n.svelte';
	import { streamHealthIssue } from '../lib/stream-health';
	import { destinationUrl, requiresYouTubeGoLive, studio } from '../lib/state.svelte';
	import { connectYouTube, liveSession, sessionYouTubeChannelId } from '../lib/live-session.svelte';
	import {
		recording,
		recordsCloud,
		recordsLocal,
		startCloudRecording,
		stopCloudRecording
	} from '../lib/recording.svelte';

	let {
		onToggleLive,
		onSettings,
		onSelectSession,
		confirmStop,
		/** Frames the compositor failed to paint on time — OBS's rendering lag. */
		renderMissed
	}: {
		onToggleLive: () => void;
		onSettings: () => void;
		onSelectSession: () => void;
		confirmStop: boolean;
		renderMissed: number;
	} = $props();

	const enabled = $derived(
		studio.destinations.filter((d) => d.enabled && destinationUrl(d).length > 8)
	);
	const recordingMode = $derived(studio.settings.recordingMode);
	const recordingLabel = $derived(t(`recording.${recordingMode}` as never));
	const selectedSession = $derived(
		liveSession.sessions.find(
			(session) => session._id === (liveSession.activeId ?? liveSession.selectedId)
		)
	);
	const recordingActive = $derived(Boolean(recording.localPath) || recording.cloud);
	let now = $state(Date.now());
	$effect(() => {
		const timer = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(timer);
	});
	const recordingDuration = $derived(
		recording.startedAt ? Math.floor((now - recording.startedAt) / 1000) : 0
	);
	const clock = (seconds: number) => new Date(seconds * 1000).toISOString().slice(11, 19);

	// Keep public destinations held until the operator approves the preview.
	const canGoLive = $derived(broadcast.phase === 'live' && !liveSession.activeId);
	const youtubeReady = $derived(
		broadcast.targets.some((target) => target.youtube && target.state === 'live')
	);
	const youtubeRequired = $derived(
		!selectedSession?.is_test &&
			(Boolean(selectedSession?.youtube_url) || requiresYouTubeGoLive(studio.destinations))
	);
	const youtubeSessionConnected = $derived(
		liveSession.youtubeChannels.some(
			(channel) =>
				channel.id === sessionYouTubeChannelId(selectedSession, liveSession.youtubeChannels)
		)
	);

	const stats = $derived(broadcast.stats);
	const healthIssue = $derived(streamHealthIssue(stats, broadcast.captureState));
	const healthMessage = $derived.by(() => {
		if (healthIssue === 'capture') return t('health.captureRecovering');
		if (healthIssue === 'pipeline') return t('health.congested');
		if (healthIssue === 'encoder') return t('health.encoderSlow');
		return '';
	});
	let copiedTestLink = $state(false);

	async function copyTestLink() {
		if (!liveSession.testUrl) return;
		await navigator.clipboard.writeText(liveSession.testUrl);
		copiedTestLink = true;
		setTimeout(() => (copiedTestLink = false), 1500);
	}

	function label(state: string): string {
		if (state === 'live') return t('target.live');
		if (state === 'failed') return t('target.failed');
		return t('target.connecting');
	}

	function dot(state: string): string {
		if (state === 'live') return 'bg-emerald-400';
		if (state === 'failed') return 'bg-red-500';
		return 'animate-pulse bg-amber-400';
	}
</script>

<Dock id="controls" title={t('dock.controls')}>
	<div class="space-y-1.5 p-2">
		<button
			class="h-10 w-full text-[13px] font-medium transition-colors {isStreaming()
				? confirmStop
					? 'bg-red-600 text-fg'
					: 'border border-red-500/50 text-red-400 hover:bg-red-600/15'
				: 'bg-primary text-black hover:bg-missionnaire-400'} disabled:cursor-not-allowed disabled:opacity-40"
			disabled={broadcast.starting ||
				(!isStreaming() && ((enabled.length === 0 && !recordsLocal()) || !liveSession.selectedId))}
			onclick={onToggleLive}
		>
			{#if broadcast.starting}
				{t('controls.starting')}
			{:else if broadcast.phase === 'connecting'}
				{t('controls.reaching')}
			{:else if broadcast.phase === 'live'}
				{confirmStop ? t('controls.confirmStop') : t('controls.stopStreaming')}
			{:else}
				{t('controls.startStreaming')}
			{/if}
		</button>
		{#if canGoLive}
			<button
				class="flex h-10 w-full items-center justify-center gap-2 bg-red-600 text-[13px] font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-wait disabled:opacity-50"
				disabled={broadcast.publishing ||
					liveSession.starting ||
					(youtubeRequired && !youtubeSessionConnected)}
				title={t('controls.goLiveHint')}
				onclick={() => void goLivePublic()}
			>
				{#if broadcast.publishing || liveSession.starting}
					<span
						class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white"
					></span>
					{t('controls.starting')}
				{:else}
					{t('controls.goLive')}
				{/if}
			</button>
		{:else if liveSession.activeId}
			<div
				class="flex h-8 items-center justify-center border border-red-500/40 bg-red-600/10 text-[11px] font-medium text-red-300"
			>
				{t('controls.publicLive')}
			</div>
		{/if}
		{#if liveSession.operatorName && youtubeRequired}
			<button
				class="flex h-8 w-full items-center justify-between border border-ink-700 px-2 text-[11px] transition-colors {youtubeSessionConnected
					? 'text-emerald-300'
					: 'text-fg/60 hover:border-red-500/50 hover:text-red-300'}"
				disabled={liveSession.youtubeConnecting}
				onclick={() => void connectYouTube()}
			>
				<span
					>{liveSession.youtubeConnecting
						? t('controls.youtubeConnecting')
						: youtubeSessionConnected
							? t('controls.youtubeConnected')
							: t('controls.connectYouTube')}</span
				>
				<span class="max-w-28 truncate"
					>{selectedSession?.youtube_channel_title ?? liveSession.youtubeChannel ?? ''}</span
				>
			</button>
			{#if liveSession.youtubeError && !youtubeSessionConnected}
				<p class="text-[10px] leading-snug text-red-400">{liveSession.youtubeError}</p>
			{/if}
		{/if}
		{#if selectedSession?.is_test && liveSession.testUrl}
			<div class="grid grid-cols-[1fr_auto] gap-1" title={liveSession.testUrl}>
				<button
					class="h-8 border border-primary/40 text-[11px] text-primary hover:bg-primary/10"
					onclick={() => void invoke('open_url', { url: liveSession.testUrl! })}
					>Open private test link</button
				>
				<button
					class="h-8 border border-ink-600 px-2 text-[10px] text-fg/65 hover:text-fg"
					onclick={() => void copyTestLink()}>{copiedTestLink ? 'Copied' : 'Copy'}</button
				>
			</div>
		{/if}
		<button
			class="flex h-8 w-full items-center justify-between border border-ink-700 px-2 text-[11px] text-fg/60 transition-colors hover:border-ink-500 hover:text-fg"
			disabled={isStreaming()}
			onclick={onSelectSession}
			title={isStreaming()
				? 'Live session is locked while streaming'
				: 'Choose or create the public live session'}
		>
			<span>Live session</span>
			<span class={selectedSession ? 'max-w-36 truncate text-emerald-300' : 'text-amber-300'}
				>{selectedSession?.title ?? 'Choose one'}</span
			>
		</button>
		{#if isStreaming() && (recordsCloud() || recordsLocal())}
			<button
				class="flex h-8 w-full items-center justify-between border border-ink-700 px-2 text-[11px] {recordingActive
					? 'text-red-300'
					: 'text-fg/60'}"
				disabled={recordsLocal() && !recordsCloud()}
				onclick={() => (recording.cloud ? void stopCloudRecording() : void startCloudRecording())}
			>
				<span
					>{recordsCloud()
						? recording.cloud
							? 'Stop recording'
							: 'Start recording'
						: recording.startedAt
							? 'Recording local'
							: 'Local recording armed'}</span
				>
				<span class="font-mono">{recordingActive ? clock(recordingDuration) : '00:00:00'}</span>
			</button>
		{/if}

		<button
			class="flex h-8 w-full items-center justify-between border border-ink-700 px-2 text-[11px] text-fg/60 transition-colors hover:border-ink-500 hover:text-fg"
			onclick={onSettings}
			title={t('controls.recordingHint')}
		>
			<span>{t('controls.recording')}</span>
			<span class={recordingMode === 'off' ? 'text-fg/35' : 'text-emerald-300'}
				>{recordingLabel}</span
			>
		</button>

		{#if youtubeReady}
			<button
				class="h-9 w-full bg-red-600 text-[13px] font-medium text-fg transition-colors hover:bg-red-500"
				title={t('controls.openYouTubeHint')}
				onclick={() => invoke('open_url', { url: 'https://studio.youtube.com/' })}
			>
				{t('controls.openYouTube')}
			</button>
		{/if}

		<button
			class="h-9 w-full border text-[13px] transition-colors {studio.settings.studioMode
				? 'border-primary/60 bg-primary/15 text-primary'
				: 'border-ink-600 text-fg/60 hover:border-ink-500 hover:text-fg'}"
			onclick={() => {
				setStudioMode(!studio.settings.studioMode);
			}}>{t('controls.studioMode')}</button
		>

		<button
			class="h-9 w-full border border-ink-600 text-[13px] text-fg/70 transition-colors hover:border-ink-500 hover:text-fg"
			onclick={onSettings}
		>
			{t('controls.settings')}
			<!-- No enabled destination means Start Streaming is disabled; say so
			     here rather than leaving a dead button with no explanation. -->
			{#if enabled.length === 0 && !recordsLocal()}
				<span class="ml-1 font-mono text-[10px] text-amber-400">!</span>
			{/if}
		</button>
	</div>

	<!-- ── Per-destination connection state ───────────────── -->
	{#if broadcast.targets.length > 0}
		<div class="border-t border-ink-700 px-2 py-2">
			{#each broadcast.targets as target (target.name + target.host)}
				<div class="flex items-center gap-2" title={target.reason ?? ''}>
					<span class="h-1.5 w-1.5 shrink-0 rounded-full {dot(target.state)}"></span>
					<span class="min-w-0 flex-1 truncate text-[12px] text-fg/75">{target.name}</span>
					<span
						class="shrink-0 text-[10px] {target.state === 'failed'
							? 'text-red-400'
							: target.state === 'live'
								? 'text-emerald-400'
								: 'text-amber-400'}">{label(target.state)}</span
					>
				</div>
				<p class="mb-1 truncate pl-3.5 font-mono text-[9px] text-fg/25">{target.host}</p>
			{/each}
		</div>
	{/if}

	<!-- ── Stream health: the Stats-dock fields ffmpeg can actually source ── -->
	{#if stats}
		<div class="border-t border-ink-700 px-2 py-2">
			<div class="mb-1 flex items-center justify-between">
				<span class="text-[10px] font-semibold uppercase tracking-wider text-fg/35">
					{t('health.title')}
				</span>
				<span class="text-[10px] {healthIssue ? 'text-amber-400' : 'text-emerald-400'}">
					{healthIssue ? '⚠' : t('health.good')}
				</span>
			</div>

			<dl class="space-y-0.5 font-mono text-[10px]">
				<div class="flex justify-between gap-2">
					<dt class="truncate text-fg/40">{t('health.bitrate')}</dt>
					<dd class="shrink-0 text-fg/70">
						{Math.round(stats.bitrate_kbps)} / {studio.settings.videoBitrateKbps +
							studio.settings.audioBitrateKbps}
					</dd>
				</div>
				<div class="flex justify-between gap-2">
					<dt class="truncate text-fg/40">{t('health.dataOut')}</dt>
					<dd class="shrink-0 text-fg/70">{formatBytes(stats.total_bytes)}</dd>
				</div>
				<div class="flex justify-between gap-2">
					<dt class="truncate text-fg/40">{t('health.droppedNetwork')}</dt>
					<dd class="shrink-0 {stats.dropped_frames > 0 ? 'text-amber-400' : 'text-fg/70'}">
						{stats.dropped_frames}
					</dd>
				</div>
				<div class="flex justify-between gap-2">
					<dt class="truncate text-fg/40">{t('health.encodingLag')}</dt>
					<dd class="shrink-0 {stats.backpressure_events > 0 ? 'text-amber-400' : 'text-fg/70'}">
						{stats.backpressure_events}
					</dd>
				</div>
				<div class="flex justify-between gap-2">
					<dt class="truncate text-fg/40">{t('health.renderingLag')}</dt>
					<dd class="shrink-0 {renderMissed > 0 ? 'text-amber-400' : 'text-fg/70'}">
						{renderMissed}
					</dd>
				</div>
				<div class="flex justify-between gap-2">
					<dt class="truncate text-fg/40">{t('health.speed')}</dt>
					<dd class="shrink-0 {stats.speed < 0.95 ? 'text-amber-400' : 'text-fg/70'}">
						{stats.speed.toFixed(2)}×
					</dd>
				</div>
				{#if broadcast.recoveries > 0}
					<div class="flex justify-between gap-2">
						<dt class="truncate text-fg/40">{t('health.recoveries')}</dt>
						<dd class="shrink-0 text-fg/70">{broadcast.recoveries}</dd>
					</div>
				{/if}
			</dl>

			{#if healthIssue}
				<p class="mt-1.5 flex items-start gap-1 text-[10px] leading-snug text-amber-400/90">
					<Icon name="more" size={10} class="mt-px" />
					{healthMessage}
				</p>
			{/if}
		</div>
	{/if}
</Dock>
