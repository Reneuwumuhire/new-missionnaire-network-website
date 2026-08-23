<script lang="ts">
	import { invoke } from '@tauri-apps/api/core';
	import {
		broadcast,
		formatBytes,
		goLiveHeld,
		heldDestinations,
		isStreaming,
		stopHeld
	} from '../lib/broadcast.svelte';
	import Dock from './Dock.svelte';
	import Icon from './Icon.svelte';
	import { t } from '../lib/i18n.svelte';
	import { destinationUrl, persist, studio } from '../lib/state.svelte';
	import { liveSession } from '../lib/live-session.svelte';

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
	const selectedSession = $derived(liveSession.sessions.find((session) => session._id === liveSession.selectedId));

	// Held destinations get nothing at all until this is pressed, so a platform
	// that publishes on first frame cannot go public on its own. Once connected
	// the app still cannot stop YouTube's broadcast — only stop feeding it —
	// which is why the button below opens Studio rather than claiming to.
	const held = $derived(heldDestinations());
	const canGoLive = $derived(broadcast.phase === 'live' && held.length > 0);
	const youtubeReady = $derived(
		broadcast.heldLive && broadcast.targets.some((target) => target.youtube && target.state === 'live')
	);

	const stats = $derived(broadcast.stats);
	const congested = $derived(
		Boolean(stats && (stats.discarded_chunks > 0 || stats.speed < 0.95 || stats.dropped_frames > 0))
	);

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
			disabled={broadcast.starting || (!isStreaming() && (enabled.length === 0 || !liveSession.selectedId))}
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
		{#if liveSession.operatorName}
			<p class="px-1 text-[10px] text-fg/35">Signed in: {liveSession.operatorName}</p>
		{/if}

		<button
			class="flex h-8 w-full items-center justify-between border border-ink-700 px-2 text-[11px] text-fg/60 transition-colors hover:border-ink-500 hover:text-fg"
			onclick={onSelectSession}
			title="Choose or create the public live session"
		>
			<span>Live session</span>
			<span class={selectedSession ? 'max-w-36 truncate text-emerald-300' : 'text-amber-300'}>{selectedSession?.title ?? 'Choose one'}</span>
		</button>

		<button
			class="flex h-8 w-full items-center justify-between border border-ink-700 px-2 text-[11px] text-fg/60 transition-colors hover:border-ink-500 hover:text-fg"
			onclick={onSettings}
			title={t('controls.recordingHint')}
		>
			<span>{t('controls.recording')}</span>
			<span class={recordingMode === 'off' ? 'text-fg/35' : 'text-emerald-300'}>{recordingLabel}</span>
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
				// Entering Studio Mode, the scene on air is whatever is showing now.
				// Leaving it, the edit scene becomes the program scene by definition
				// (see onAirSceneId), so there is nothing to reconcile.
				if (!studio.settings.studioMode) studio.programSceneId = studio.activeSceneId;
				studio.settings.studioMode = !studio.settings.studioMode;
				persist();
			}}>{t('controls.studioMode')}</button
		>

		<button
			class="h-9 w-full border border-ink-600 text-[13px] text-fg/70 transition-colors hover:border-ink-500 hover:text-fg"
			onclick={onSettings}
		>
			{t('controls.settings')}
			<!-- No enabled destination means Start Streaming is disabled; say so
			     here rather than leaving a dead button with no explanation. -->
			{#if enabled.length === 0}
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
				<span class="text-[10px] {congested ? 'text-amber-400' : 'text-emerald-400'}">
					{congested ? '⚠' : t('health.good')}
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
					<dd class="shrink-0 {stats.discarded_chunks > 0 ? 'text-amber-400' : 'text-fg/70'}">
						{stats.discarded_chunks}
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
			</dl>

			{#if congested}
				<p class="mt-1.5 flex items-start gap-1 text-[10px] leading-snug text-amber-400/90">
					<Icon name="more" size={10} class="mt-px" />
					{t('health.congested')}
				</p>
			{/if}
		</div>
	{/if}
</Dock>
