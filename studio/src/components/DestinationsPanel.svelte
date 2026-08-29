<script lang="ts">
	import { broadcast, isStreaming } from '../lib/broadcast.svelte';
	import Icon from './Icon.svelte';
	import { t } from '../lib/i18n.svelte';
	import { destinationUrl, id, type Destination } from '../lib/state.svelte';
	import {
		connectWithAdmin,
		connectYouTube,
		disconnectYouTube,
		liveSession
	} from '../lib/live-session.svelte';

	// The RTMP list belongs to the Settings draft and reaches the show only on
	// Apply. OAuth channel actions are account commands, so they take effect now.
	let { destinations = $bindable([] as Destination[]) } = $props();

	let revealed = $state<Record<string, boolean>>({});

	const PRESETS = [
		{
			name: () => t('stream.presetMissionnaire'),
			url: 'rtmp://missionnaire-streaming-app.fly.dev:1935/live',
			platform: 'missionnaire' as const,
			hint: () => t('stream.presetMissionnaireHint')
		},
		{
			name: () => t('stream.presetYouTubeManual'),
			url: 'rtmp://a.rtmp.youtube.com/live2',
			platform: 'youtube' as const,
			hint: () => t('stream.presetYouTubeHint')
		},
		{
			name: () => t('stream.presetFacebook'),
			url: 'rtmps://live-api-s.facebook.com:443/rtmp',
			platform: 'facebook' as const,
			hint: () => t('stream.presetFacebookHint')
		}
	];

	function add(preset?: (typeof PRESETS)[number]) {
		destinations = [
			...destinations,
			{
				id: id(),
				name: preset?.name() ?? t('stream.newDestination'),
				url: preset?.url ?? 'rtmp://',
				key: '',
				enabled: false,
				platform: preset?.platform ?? 'custom',
				managed: false,
				// Preflight is useful only when the destination receives the signal.
				hold: false
			}
		];
	}

	async function removeChannel(channelId: string, title: string) {
		if (!confirm(t('stream.disconnectConfirm', { channel: title }))) return;
		await disconnectYouTube(channelId);
	}

	function remove(destination: Destination) {
		destinations = destinations.filter((d) => d.id !== destination.id);
	}

	/** What the operator sees before going live, so a typo in the path is caught
	 *  on the ground rather than by a failed connection. */
	function preview(destination: Destination): string {
		const full = destinationUrl(destination);
		return destination.key ? full.replace(destination.key.trim(), '••••••') : full;
	}

	function problem(destination: Destination): string | null {
		const url = destination.url.trim();
		if (!url) return t('stream.missingUrl');
		if (!/^rtmps?:\/\//.test(url)) return t('stream.badScheme');
		if (/[|[\]'"\\\s]/.test(destinationUrl(destination))) return t('stream.badCharacter');
		return null;
	}
</script>

<section class="space-y-3 border-b border-ink-700 p-4">
	<div>
		<h3 class="text-[12px] font-semibold text-fg/80">{t('stream.youtubeChannels')}</h3>
		<p class="mt-1 text-[11px] leading-relaxed text-fg/40">{t('stream.youtubeChannelsHint')}</p>
	</div>
	{#if !liveSession.operatorName}
		<p class="border border-amber-500/25 bg-amber-500/5 p-2 text-[11px] text-amber-300">
			{t('stream.connectAdminFirst')}
		</p>
	{:else if liveSession.youtubeChannels.length === 0}
		<p class="text-[11px] text-fg/35">{t('stream.noYouTubeChannels')}</p>
	{:else}
		<div class="space-y-1.5">
			{#each liveSession.youtubeChannels as channel (channel.id)}
				<div class="flex items-center gap-2 border border-ink-700 bg-ink-850 px-3 py-2">
					<span class="h-2 w-2 rounded-full bg-emerald-400"></span>
					<span class="min-w-0 flex-1 truncate text-[12px] text-fg/75">{channel.title}</span>
					<button
						class="studio-chip text-red-300"
						disabled={isStreaming()}
						onclick={() => void removeChannel(channel.id, channel.title)}
						>{t('stream.disconnectChannel')}</button
					>
				</div>
			{/each}
		</div>
	{/if}
	<button
		class="studio-chip"
		disabled={liveSession.youtubeConnecting || isStreaming()}
		onclick={() => void (liveSession.operatorName ? connectYouTube() : connectWithAdmin())}
	>
		{liveSession.youtubeConnecting
			? t('controls.youtubeConnecting')
			: liveSession.operatorName
				? t('stream.addYouTubeChannel')
				: t('stream.connectAdmin')}
	</button>
	{#if liveSession.youtubeError}
		<p class="text-[11px] text-red-400">{liveSession.youtubeError}</p>
	{/if}
</section>

<div class="space-y-3 p-4">
	<div>
		<h3 class="text-[12px] font-semibold text-fg/80">{t('stream.manualOutputs')}</h3>
		<p class="mt-1 text-[11px] leading-relaxed text-fg/40">{t('stream.intro')}</p>
	</div>

	{#each destinations.filter((destination) => !destination.managed) as destination (destination.id)}
		{@const issue = problem(destination)}
		<div
			class="border p-3 {destination.enabled
				? 'border-primary/40 bg-primary/[0.06]'
				: 'border-ink-700 bg-ink-850'}"
		>
			<div class="flex items-center gap-2">
				<input
					type="checkbox"
					class="h-4 w-4 accent-primary"
					checked={destination.enabled}
					disabled={isStreaming()}
					onchange={(e) => {
						destination.enabled = (e.currentTarget as HTMLInputElement).checked;
					}}
				/>
				<input
					class="studio-input-flush min-w-0 flex-1 text-sm"
					value={destination.name}
					onchange={(e) => {
						destination.name = (e.currentTarget as HTMLInputElement).value;
					}}
				/>
				<button
					class="studio-icon-btn"
					title={t('common.remove')}
					aria-label={t('common.remove')}
					onclick={() => remove(destination)}><Icon name="trash" size={14} /></button
				>
			</div>

			<div class="mt-2 space-y-1.5">
				<input
					class="studio-input w-full font-mono text-[11px]"
					placeholder={t('stream.urlPlaceholder')}
					value={destination.url}
					onchange={(e) => {
						destination.url = (e.currentTarget as HTMLInputElement).value;
					}}
				/>
				<div class="flex gap-1.5">
					<input
						class="studio-input min-w-0 flex-1 font-mono text-[11px]"
						type={revealed[destination.id] ? 'text' : 'password'}
						placeholder={t('stream.keyPlaceholder')}
						value={destination.key}
						onchange={(e) => {
							destination.key = (e.currentTarget as HTMLInputElement).value;
						}}
					/>
					<button
						class="studio-chip"
						onclick={() => (revealed[destination.id] = !revealed[destination.id])}
						>{revealed[destination.id] ? t('stream.hideKey') : t('stream.showKey')}</button
					>
				</div>
			</div>

			<label class="mt-2 flex items-start gap-2 text-[11px] text-fg/60">
				<input
					type="checkbox"
					class="mt-0.5 accent-primary"
					checked={destination.hold}
					disabled={isStreaming()}
					onchange={(e) => {
						destination.hold = (e.currentTarget as HTMLInputElement).checked;
					}}
				/>
				<span>
					{t('stream.hold')}
					<span class="mt-0.5 block text-[10px] leading-relaxed text-fg/35">
						{t('stream.holdHint')}
					</span>
				</span>
			</label>

			{#if issue}
				<p class="mt-2 text-[11px] text-amber-400/90">{issue}</p>
			{:else}
				<p class="mt-2 truncate font-mono text-[10px] text-fg/25">{preview(destination)}</p>
			{/if}
		</div>
	{/each}

	<div class="flex flex-wrap gap-1.5 border-t border-ink-700 pt-3">
		{#each PRESETS as preset (preset.url)}
			<button class="studio-chip" title={preset.hint()} onclick={() => add(preset)}
				>+ {preset.name()}</button
			>
		{/each}
		<button class="studio-chip" onclick={() => add()}>+ {t('stream.presetBlank')}</button>
	</div>

	<p class="text-[11px] leading-relaxed text-fg/30">{t('stream.keyWarning')}</p>
</div>
