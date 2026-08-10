<script lang="ts">
	import { onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { broadcast, pickMimeType } from '../lib/broadcast.svelte';
	import DestinationsPanel from './DestinationsPanel.svelte';
	import Icon, { type IconName } from './Icon.svelte';
	import { LOCALES, i18n, setLocale, t } from '../lib/i18n.svelte';
	import { DEFAULT_LAYOUT } from '../lib/layout';
	import { persist, studio } from '../lib/state.svelte';

	// Categories down the left, one page at a time — OBS's Settings window.
	// Destinations live under `Stream` here for the same reason they do there.
	type Page = 'general' | 'stream' | 'output' | 'video' | 'layout' | 'about';
	const PAGES: { id: Page; label: () => string; icon: IconName }[] = [
		{ id: 'general', label: () => t('settings.general'), icon: 'gear' },
		{ id: 'stream', label: () => t('settings.stream'), icon: 'monitor' },
		{ id: 'output', label: () => t('settings.output'), icon: 'film' },
		{ id: 'video', label: () => t('settings.video'), icon: 'image' },
		{ id: 'layout', label: () => t('settings.layout'), icon: 'alignLeft' },
		{ id: 'about', label: () => t('settings.about'), icon: 'music' }
	];

	let page = $state<Page>('general');

	interface FfmpegInfo {
		path: string;
		version: string;
		hardware_h264: boolean;
	}

	let ffmpeg = $state<FfmpegInfo | null>(null);
	let ffmpegError = $state<string | null>(null);
	const mime = pickMimeType();

	onMount(async () => {
		try {
			ffmpeg = await invoke<FfmpegInfo>('check_ffmpeg');
			if (!ffmpeg.hardware_h264 && studio.settings.encoder === 'hardware') {
				studio.settings.encoder = 'software';
				persist();
			}
		} catch (err) {
			ffmpegError = String(err);
		}
	});

	const RESOLUTIONS: [number, number, string][] = [
		[854, 480, '480p'],
		[1280, 720, '720p'],
		[1920, 1080, '1080p']
	];

	// Bitrates that YouTube recommends and that a modest upstream can hold.
	const SUGGESTED: Record<string, number> = { '480p': 1800, '720p': 3500, '1080p': 6000 };

	function setResolution(width: number, height: number, label: string) {
		studio.settings.width = width;
		studio.settings.height = height;
		studio.settings.videoBitrateKbps = SUGGESTED[label];
		persist();
	}

	const uploadMbps = $derived(
		Math.round(((studio.settings.videoBitrateKbps + studio.settings.audioBitrateKbps) * 1.3) / 100) /
			10
	);
</script>

<div class="flex min-h-[26rem]">
	<nav class="w-40 shrink-0 border-r border-ink-700 bg-ink-850 py-2">
		{#each PAGES as entry (entry.id)}
			<button
				class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors {page ===
				entry.id
					? 'bg-primary text-black'
					: 'text-white/65 hover:bg-white/5 hover:text-white'}"
				onclick={() => (page = entry.id)}
			>
				<Icon name={entry.icon} size={14} />
				{entry.label()}
			</button>
		{/each}
	</nav>

	<div class="min-w-0 flex-1">
		{#if page === 'stream'}
			<DestinationsPanel />
		{:else}
			<div class="space-y-5 p-4">
				{#if page === 'general'}
					<div>
						<span class="studio-label">{t('settings.language')}</span>
						<div class="flex gap-1">
							{#each LOCALES as option (option.id)}
								<button
									class="studio-chip flex-1 {i18n.locale === option.id
										? 'bg-primary/20 text-primary'
										: ''}"
									onclick={() => setLocale(option.id)}>{option.label}</button
								>
							{/each}
						</div>
					</div>
				{/if}

				{#if page === 'output'}
					{#if broadcast.live}
						<p class="border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
							{t('settings.liveWarning')}
						</p>
					{/if}

					<label class="block">
						<span class="studio-label">
							{t('settings.videoBitrate', { kbps: studio.settings.videoBitrateKbps })}
						</span>
						<input
							type="range"
							min="800"
							max="9000"
							step="100"
							class="w-full accent-primary"
							value={studio.settings.videoBitrateKbps}
							oninput={(e) => {
								studio.settings.videoBitrateKbps = Number(
									(e.currentTarget as HTMLInputElement).value
								);
								persist();
							}}
						/>
						<span class="text-[11px] text-white/30">
							{t('settings.uploadHint', { mbps: uploadMbps })}
						</span>
					</label>

					<div>
						<span class="studio-label">{t('settings.audioBitrate')}</span>
						<div class="flex gap-1">
							{#each [96, 128, 160, 192] as kbps (kbps)}
								<button
									class="studio-chip flex-1 {studio.settings.audioBitrateKbps === kbps
										? 'bg-primary/20 text-primary'
										: ''}"
									onclick={() => {
										studio.settings.audioBitrateKbps = kbps;
										persist();
									}}>{kbps}</button
								>
							{/each}
						</div>
					</div>

					<div>
						<span class="studio-label">{t('settings.encoder')}</span>
						<div class="flex gap-1">
							<button
								class="studio-chip flex-1 {studio.settings.encoder === 'hardware'
									? 'bg-primary/20 text-primary'
									: ''}"
								disabled={ffmpeg ? !ffmpeg.hardware_h264 : false}
								onclick={() => {
									studio.settings.encoder = 'hardware';
									persist();
								}}>{t('settings.hardware')}</button
							>
							<button
								class="studio-chip flex-1 {studio.settings.encoder === 'software'
									? 'bg-primary/20 text-primary'
									: ''}"
								onclick={() => {
									studio.settings.encoder = 'software';
									persist();
								}}>{t('settings.software')}</button
							>
						</div>
						<p class="mt-1 text-[11px] text-white/30">{t('settings.encoderHint')}</p>
					</div>
				{/if}

				{#if page === 'video'}
					<div>
						<span class="studio-label">{t('settings.resolution')}</span>
						<div class="flex gap-1">
							{#each RESOLUTIONS as [width, height, label] (label)}
								<button
									class="studio-chip flex-1 {studio.settings.width === width
										? 'bg-primary/20 text-primary'
										: ''}"
									onclick={() => setResolution(width, height, label)}>{label}</button
								>
							{/each}
						</div>
					</div>

					<div>
						<span class="studio-label">{t('settings.fps')}</span>
						<div class="flex gap-1">
							{#each [24, 25, 30, 60] as fps (fps)}
								<button
									class="studio-chip flex-1 {studio.settings.fps === fps
										? 'bg-primary/20 text-primary'
										: ''}"
									onclick={() => {
										studio.settings.fps = fps;
										persist();
									}}>{fps}</button
								>
							{/each}
						</div>
					</div>
				{/if}

				{#if page === 'layout'}
					<div>
						<span class="studio-label">{t('settings.layout')}</span>
						<button
							class="studio-chip"
							onclick={() => {
								studio.settings.layout = {
									...DEFAULT_LAYOUT,
									weights: { ...DEFAULT_LAYOUT.weights }
								};
								persist();
							}}>{t('settings.resetLayout')}</button
						>
						<p class="mt-1 text-[11px] leading-relaxed text-white/30">{t('settings.layoutHint')}</p>
					</div>
				{/if}

				{#if page === 'about'}
					<div class="space-y-1.5 font-mono text-[11px]">
						<span class="studio-label font-body">{t('settings.system')}</span>
						{#if ffmpegError}
							<p class="text-red-400">{ffmpegError}</p>
						{:else if ffmpeg}
							<p class="text-white/45">{ffmpeg.version}</p>
							<p class="text-white/25">{ffmpeg.path}</p>
							<p class="text-white/45">
								{t('settings.hardwareEncoding', {
									state: ffmpeg.hardware_h264
										? t('settings.available')
										: t('settings.unavailable')
								})}
							</p>
						{:else}
							<p class="text-white/30">{t('settings.checking')}</p>
						{/if}
						<p class="text-white/45">
							{t('settings.capture', { mime: mime ?? t('settings.unavailable') })}
						</p>
					</div>

					{#if broadcast.command.length > 0}
						<details class="border-t border-ink-700 pt-4">
							<summary class="cursor-pointer text-[11px] text-white/40">
								{t('settings.ffmpegCommand')}
							</summary>
							<pre
								class="mt-2 overflow-x-auto whitespace-pre-wrap break-all bg-ink-950 p-2 font-mono text-[10px] text-white/40">{broadcast.command.join(
									' '
								)}</pre>
						</details>
					{/if}

					{#if broadcast.log.length > 0}
						<details class="border-t border-ink-700 pt-4">
							<summary class="cursor-pointer text-[11px] text-white/40">
								{t('settings.ffmpegLog', { count: broadcast.log.length })}
							</summary>
							<pre
								class="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap break-all bg-ink-950 p-2 font-mono text-[10px] text-white/40">{broadcast.log
									.slice(-40)
									.join('\n')}</pre>
						</details>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>
