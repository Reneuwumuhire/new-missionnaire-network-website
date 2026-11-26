<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import {
		broadcast,
		formatBytes,
		goLivePublic,
		isStreaming,
		manualRecording,
		stopBroadcast
	} from '../lib/broadcast.svelte';
	import { setStudioMode } from '../lib/compositor';
	import Dock from './Dock.svelte';
	import Icon from './Icon.svelte';
	import { t } from '../lib/i18n.svelte';
	import { streamHealthIssue } from '../lib/stream-health';
	import { destinationUrl, requiresYouTubeGoLive, studio } from '../lib/state.svelte';
	import {
		connectYouTube,
		currentStudioSession,
		currentStudioSessionTitle,
		liveSession,
		sessionYouTubeChannelId
	} from '../lib/live-session.svelte';
	import type { PublicStatus } from '../lib/public-destinations';
	import { recording, recordsLocal } from '../lib/recording.svelte';

	let {
		width,
		onToggleLive,
		onSettings,
		onRecordingSettings,
		onRecord,
		onSelectSession,
		confirmStop,
		/** Frames the compositor failed to paint on time — OBS's rendering lag. */
		renderMissed
	}: {
		width?: number;
		onToggleLive: () => void;
		onSettings: () => void;
		onRecordingSettings: () => void;
		onRecord: () => void;
		onSelectSession: () => void;
		confirmStop: boolean;
		renderMissed: number;
	} = $props();

	const enabled = $derived(
		studio.destinations.filter((d) => d.enabled && destinationUrl(d).length > 8)
	);
	const recordingMode = $derived(studio.settings.recordingMode);
	const recordingLabel = $derived(t(`recording.${recordingMode}` as never));
	const selectedSession = $derived(currentStudioSession());
	const sessionTitle = $derived(currentStudioSessionTitle());

	// Keep public destinations held until the operator approves the preview.
	const publicRun = $derived(liveSession.publicRun);
	const destinations = liveSession.publicDestinations;
	const publicNames: (keyof typeof destinations)[] = $derived(
		publicRun?.youtube ? ['missionnaire', 'youtube'] : ['missionnaire']
	);
	const canGoLive = $derived(
		broadcast.phase === 'live' &&
			!broadcast.stopping &&
			!publicRun?.ending &&
			(!publicRun ||
				destinations.missionnaire.status !== 'live' ||
				(publicRun.youtube && destinations.youtube.status !== 'live'))
	);
	const publicLabels = {
		unknown: 'controls.publicUnknown',
		off: 'controls.publicOff',
		waiting: 'controls.publicWaiting',
		live: 'status.live',
		ended: 'controls.publicEnded'
	} as const satisfies Record<PublicStatus, string>;
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
	let confirmRemoteEnd = $state(false);
	function endRemote() {
		if (!publicRun?.ending && !confirmRemoteEnd) {
			confirmRemoteEnd = true;
			setTimeout(() => (confirmRemoteEnd = false), 4_000);
			return;
		}
		confirmRemoteEnd = false;
		void stopBroadcast();
	}

	async function copyTestLink() {
		if (!liveSession.testUrl) return;
		await navigator.clipboard.writeText(liveSession.testUrl);
		copiedTestLink = true;
		setTimeout(() => (copiedTestLink = false), 1500);
	}

	function label(state: string): string {
		if (state === 'live') return t('target.live');
		if (state === 'failed') return t('target.failed');
		if (state === 'reconnecting') return t('target.reconnecting');
		return t('target.connecting');
	}

	function dot(state: string): string {
		if (state === 'live') return 'bg-emerald-400';
		if (state === 'failed') return 'bg-red-500';
		return 'animate-pulse bg-amber-400';
	}
</script>

<Dock id="controls" title={t('dock.controls')} {width}>
	<div class="space-y-1.5 p-2">
		<button
			class="flex h-8 w-full items-center justify-between border border-ink-700 px-2 text-[12px] text-muted transition-colors hover:border-ink-500 hover:text-fg"
			disabled={isStreaming() || Boolean(publicRun)}
			onclick={onSelectSession}
			title={isStreaming()
				? 'Live session is locked while streaming'
				: 'Choose or create the public live session'}
		>
			<span>Live session</span>
			<span class={sessionTitle ? 'max-w-36 truncate text-success' : 'text-warning'}
				>{sessionTitle ?? 'Choose one'}</span
			>
		</button>
		{#if liveSession.operatorName && youtubeRequired && !youtubeSessionConnected}
			<button
				class="flex h-8 w-full items-center justify-between border border-ink-700 px-2 text-[12px] text-muted transition-colors hover:border-red-500/50 hover:text-danger"
				disabled={liveSession.youtubeConnecting}
				onclick={() => void connectYouTube()}
			>
				<span
					>{liveSession.youtubeConnecting
						? t('controls.youtubeConnecting')
						: t('controls.connectYouTube')}</span
				>
				<span class="max-w-28 truncate"
					>{selectedSession?.youtube_channel_title ?? liveSession.youtubeChannel ?? ''}</span
				>
			</button>
			{#if liveSession.youtubeError}
				<p class="text-[12px] leading-snug text-danger">{liveSession.youtubeError}</p>
			{/if}
		{/if}
		<button
			class="h-10 w-full text-[13px] font-medium transition-colors {isStreaming()
				? confirmStop
					? 'bg-red-600 text-white'
					: 'border border-red-500/50 text-danger hover:bg-red-600/15'
				: 'bg-primary text-black hover:bg-missionnaire-400'} disabled:cursor-not-allowed disabled:opacity-40"
			disabled={broadcast.starting ||
				broadcast.stopping ||
				(!isStreaming() &&
					(publicRun?.ending ||
						(enabled.length === 0 && !recordsLocal()) ||
						!liveSession.selectedId))}
			onclick={onToggleLive}
		>
			{#if broadcast.stopping}
				{t('controls.stopping')}
			{:else if broadcast.starting}
				{t('controls.starting')}
			{:else if isStreaming() && confirmStop}
				{t('controls.confirmStop')}
			{:else if broadcast.phase === 'connecting'}
				{t('controls.reaching')}
			{:else if broadcast.phase === 'live'}
				{t(publicRun ? 'controls.stopStreaming' : 'controls.stopPreviewSignal')}
			{:else}
				{t('controls.startStreaming')}
			{/if}
		</button>
		{#if canGoLive}
			<button
				class="flex h-10 w-full items-center justify-center gap-2 bg-red-600 text-[13px] font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-wait disabled:opacity-50"
				disabled={broadcast.publishing || liveSession.publicBusy}
				title={t('controls.goLiveHint')}
				onclick={() => void goLivePublic()}
			>
				{#if broadcast.publishing}
					<span
						class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white"
					></span>
					{t('controls.starting')}
				{:else}
					{t(
						publicRun
							? 'controls.retryPublicStart'
							: selectedSession?.is_test
								? 'controls.startPrivateTest'
								: 'controls.goLive'
					)}
				{/if}
			</button>
		{/if}
		{#if publicRun}
			<div class="space-y-1 border border-ink-700 p-2 text-[12px]" aria-live="polite">
				{#each publicNames as name (name)}
					{@const destination = destinations[name]}
					{@const youtubeStarting =
						name === 'youtube' &&
						broadcast.publishing &&
						!publicRun.ending &&
						destination.status !== 'live' &&
						!destination.error}
					<div class="flex justify-between gap-2">
						<span>{name === 'youtube' ? 'YouTube' : 'Missionnaire'}</span>
						<span
							class={destination.error
								? 'text-danger'
								: destination.status === 'live'
									? 'text-success'
									: youtubeStarting
										? 'text-warning'
										: 'text-muted'}
						>
							{publicRun.isTest && destination.status === 'live'
								? t('controls.privateTestActive')
								: youtubeStarting
									? t('controls.youtubePreparing')
									: t(publicLabels[destination.status])}
						</span>
					</div>
					{#if destination.error}<p class="break-words leading-snug text-danger">
							{destination.error}
						</p>{/if}
				{/each}
			</div>
			{#if !isStreaming() && !broadcast.starting && !broadcast.stopping}
				<button
					class="h-8 w-full border border-red-500/50 text-[12px] text-danger disabled:opacity-50"
					disabled={liveSession.publicBusy}
					onclick={endRemote}
				>
					{t(
						publicRun.ending
							? 'controls.retryPublicEnd'
							: confirmRemoteEnd
								? 'controls.confirmStop'
								: 'controls.endPublic'
					)}
				</button>
			{/if}
		{/if}
		{#if selectedSession?.is_test && liveSession.testUrl}
			<div class="grid grid-cols-[1fr_auto] gap-1" title={liveSession.testUrl}>
				<button
					class="h-8 border border-primary/40 text-[12px] text-accent hover:bg-primary/10"
					onclick={() => void invoke('open_url', { url: liveSession.testUrl! })}
					>Open private test link</button
				>
				<button
					class="h-8 border border-ink-600 px-2 text-[12px] text-muted hover:text-fg"
					onclick={() => void copyTestLink()}>{copiedTestLink ? 'Copied' : 'Copy'}</button
				>
			</div>
		{/if}
	</div>

	<div
		class="space-y-1.5 border-t border-ink-700 p-2"
		role="group"
		aria-label={t('controls.recording')}
	>
		<div class="flex gap-1.5">
			<button
				class="flex min-h-8 min-w-0 flex-1 items-center justify-center gap-2 border px-1.5 text-[12px] disabled:opacity-50 {manualRecording.active
					? 'border-red-500/60 bg-red-500/10 font-semibold text-danger hover:bg-red-500/20'
					: 'border-ink-600 hover:border-ink-500'}"
				disabled={broadcast.stopping || Boolean(manualRecording.pending)}
				aria-busy={Boolean(manualRecording.pending)}
				onclick={recordingMode === 'off' && !manualRecording.active
					? onRecordingSettings
					: onRecord}
			>
				{#if manualRecording.active}
					<span class="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden="true"></span>
				{/if}
				{t(
					manualRecording.pending === 'stopping'
						? 'controls.savingRecording'
						: manualRecording.pending === 'starting'
							? 'controls.startingRecording'
							: manualRecording.active
								? 'controls.stopRecording'
								: 'controls.startRecording'
				)}
			</button>
			<button
				class="min-h-8 shrink-0 border border-ink-700 px-2 text-[12px] hover:border-ink-500 {recordingMode ===
				'off'
					? 'text-muted'
					: 'text-success'}"
				onclick={onRecordingSettings}
				title={t('controls.recordingHint')}
				aria-label={`${t('controls.recording')} · ${recordingLabel}`}>{recordingLabel}</button
			>
		</div>
		{#if !manualRecording.active && (recording.localPath || recording.cloud)}
			<p class="flex items-center gap-1.5 text-[12px] font-medium text-danger" role="status">
				<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-hidden="true"></span>
				{t('controls.broadcastRecording')}
			</p>
		{/if}
		{#if recording.error}<p role="status" class="break-words text-xs text-danger">
				{recording.error}
			</p>{/if}
		{#if manualRecording.path && !manualRecording.active}
			<p class="truncate text-xs text-muted" title={manualRecording.path}>
				{manualRecording.path.split(/[/\\]/).at(-1)}
			</p>
		{/if}
	</div>

	<div class="grid grid-cols-2 gap-1.5 border-t border-ink-700 p-2">
		<button
			class="min-h-8 min-w-0 border px-1 text-[12px] transition-colors {studio.settings.studioMode
				? 'border-primary/60 bg-primary/15 text-accent'
				: 'border-ink-600 text-muted hover:border-ink-500 hover:text-fg'}"
			aria-pressed={studio.settings.studioMode}
			onclick={() => {
				setStudioMode(!studio.settings.studioMode);
			}}>{t('controls.studioMode')}</button
		>

		<button
			class="min-h-8 min-w-0 border border-ink-600 px-1 text-[12px] text-fg/70 transition-colors hover:border-ink-500 hover:text-fg"
			onclick={onSettings}
		>
			{t('controls.settings')}
			<!-- No enabled destination means Start Streaming is disabled; say so
			     here rather than leaving a dead button with no explanation. -->
			{#if enabled.length === 0 && !recordsLocal()}
				<span class="ml-1 font-mono text-[12px] text-warning">!</span>
			{/if}
		</button>
	</div>

	{#if broadcast.targets.length || stats || (youtubeRequired && youtubeSessionConnected) || publicRun?.youtube}
		<details class="border-t border-ink-700">
			<summary class="cursor-pointer px-2 py-2 text-[12px] text-muted hover:text-fg">
				{t('controls.streamDetails')}
				{#if healthIssue || broadcast.targets.some((target) => target.state === 'failed' || target.state === 'reconnecting')}
					<span class="ml-1 text-warning">{t('health.attention')}</span>
				{/if}
			</summary>
			<div class="px-2">
				{#if youtubeReady || publicRun?.youtube || (youtubeRequired && youtubeSessionConnected)}
					<button
						class="min-h-8 w-full text-left text-[12px] text-muted hover:text-fg"
						title={selectedSession?.youtube_channel_title || t('controls.openYouTubeHint')}
						onclick={() => invoke('open_url', { url: 'https://studio.youtube.com/' })}
					>
						{t('controls.openYouTube')}
					</button>
				{/if}
			</div>

			<!-- ── Per-destination connection state ───────────────── -->
			{#if broadcast.targets.length > 0}
				<div class="border-t border-ink-700 px-2 py-2">
					{#each broadcast.targets as target (target.name + target.host)}
						<div class="flex items-center gap-2" title={target.reason ?? ''}>
							<span class="h-1.5 w-1.5 shrink-0 rounded-full {dot(target.state)}"></span>
							<span class="min-w-0 flex-1 truncate text-[12px] text-fg/75">{target.name}</span>
							<span
								class="shrink-0 text-[12px] {target.state === 'failed'
									? 'text-danger'
									: target.state === 'live'
										? 'text-success'
										: 'text-warning'}">{label(target.state)}</span
							>
						</div>
						<p class="mb-1 truncate pl-3.5 font-mono text-[12px] text-muted">{target.host}</p>
						{#if target.reason && (target.state === 'reconnecting' || target.state === 'failed')}
							<p class="mb-1 break-words pl-3.5 text-[12px] text-warning">{target.reason}</p>
						{/if}
					{/each}
				</div>
			{/if}

			<!-- ── Stream health: the Stats-dock fields ffmpeg can actually source ── -->
			{#if stats}
				<div class="border-t border-ink-700 px-2 py-2">
					<div class="mb-1 flex items-center justify-between">
						<span class="text-[12px] font-semibold uppercase tracking-wider text-muted">
							{t('health.title')}
						</span>
						<span class="text-[12px] {healthIssue ? 'text-warning' : 'text-success'}">
							{healthIssue ? '⚠' : t('health.good')}
						</span>
					</div>

					<dl class="space-y-0.5 font-mono text-[12px]">
						<div class="flex justify-between gap-2">
							<dt class="truncate text-muted">{t('health.bitrate')}</dt>
							<dd class="shrink-0 text-fg/70">
								{Math.round(stats.bitrate_kbps)} / {studio.settings.videoBitrateKbps +
									studio.settings.audioBitrateKbps}
							</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="truncate text-muted">{t('health.dataOut')}</dt>
							<dd class="shrink-0 text-fg/70">{formatBytes(stats.total_bytes)}</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="truncate text-muted">{t('health.droppedNetwork')}</dt>
							<dd class="shrink-0 {stats.dropped_frames > 0 ? 'text-warning' : 'text-fg/70'}">
								{stats.dropped_frames}
							</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="truncate text-muted">{t('health.encodingLag')}</dt>
							<dd class="shrink-0 {stats.backpressure_events > 0 ? 'text-warning' : 'text-fg/70'}">
								{stats.backpressure_events}
							</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="truncate text-muted">{t('health.renderingLag')}</dt>
							<dd class="shrink-0 {renderMissed > 0 ? 'text-warning' : 'text-fg/70'}">
								{renderMissed}
							</dd>
						</div>
						<div class="flex justify-between gap-2">
							<dt class="truncate text-muted">{t('health.speed')}</dt>
							<dd class="shrink-0 {stats.speed < 0.95 ? 'text-warning' : 'text-fg/70'}">
								{stats.speed.toFixed(2)}×
							</dd>
						</div>
						{#if broadcast.recoveries > 0}
							<div class="flex justify-between gap-2">
								<dt class="truncate text-muted">{t('health.recoveries')}</dt>
								<dd class="shrink-0 text-fg/70">{broadcast.recoveries}</dd>
							</div>
						{/if}
					</dl>

					{#if healthIssue}
						<p class="mt-1.5 flex items-start gap-1 text-[12px] leading-snug text-warning">
							<Icon name="more" size={10} class="mt-px" />
							{healthMessage}
						</p>
					{/if}
				</div>
			{/if}
		</details>
	{/if}
</Dock>
