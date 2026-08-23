<script lang="ts">
	import { onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { broadcast, isStreaming, pickMimeType } from '../lib/broadcast.svelte';
	import DestinationsPanel from './DestinationsPanel.svelte';
	import Icon, { type IconName } from './Icon.svelte';
	import { LOCALES, THEMES, applyTheme, i18n, setLocale, t, theme } from '../lib/i18n.svelte';
	import { DEFAULT_LAYOUT } from '../lib/layout';
	import { persist, stageableSettings, studio, type Destination } from '../lib/state.svelte';

	let { onclose }: { onclose: () => void } = $props();

	// Nothing here reaches the show until Apply, the way OBS's Settings window
	// works. Changing the resolution or the bitrate mid-service by mis-clicking
	// a chip is not something an operator should be able to do by accident.
	//
	// The layout is not staged: the splitters write to it from outside this
	// dialog, so applying a copy taken when it opened would undo whatever was
	// dragged in the meantime. Reset Layout stays an immediate action for the
	// same reason — it is a command, not a setting.
	let draft = $state({
		settings: stageableSettings(studio.settings),
		destinations: $state.snapshot(studio.destinations) as Destination[],
		locale: i18n.locale
	});

	const dirty = $derived(
		JSON.stringify(draft.settings) !== JSON.stringify(stageableSettings(studio.settings)) ||
			JSON.stringify(draft.destinations) !== JSON.stringify($state.snapshot(studio.destinations)) ||
			draft.locale !== i18n.locale
	);

	function apply() {
		Object.assign(studio.settings, $state.snapshot(draft.settings));
		studio.destinations = $state.snapshot(draft.destinations) as Destination[];
		if (draft.locale !== i18n.locale) setLocale(draft.locale);
	}

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
			if (!ffmpeg.hardware_h264 && draft.settings.encoder === 'hardware') {
				draft.settings.encoder = 'software';
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
		draft.settings.width = width;
		draft.settings.height = height;
		draft.settings.videoBitrateKbps = SUGGESTED[label];
	}

	const uploadMbps = $derived(
		Math.round(((draft.settings.videoBitrateKbps + draft.settings.audioBitrateKbps) * 1.3) / 100) /
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
					: 'text-fg/65 hover:bg-fg/5 hover:text-fg'}"
				onclick={() => (page = entry.id)}
			>
				<Icon name={entry.icon} size={14} />
				{entry.label()}
			</button>
		{/each}
	</nav>

	<div class="min-w-0 flex-1">
		{#if page === 'stream'}
			<DestinationsPanel bind:destinations={draft.destinations} />
		{:else}
			<div class="space-y-5 p-4">
				{#if page === 'general'}
					<div>
						<span class="studio-label">{t('settings.language')}</span>
						<div class="flex gap-1">
							{#each LOCALES as option (option.id)}
								<button
									class="studio-chip flex-1 {draft.locale === option.id
										? 'bg-primary/20 text-primary'
										: ''}"
									onclick={() => (draft.locale = option.id)}>{option.label}</button
								>
							{/each}
						</div>
					</div>

					<div>
						<span class="studio-label">{t('settings.theme')}</span>
						<!-- Applied on click rather than staged behind Apply, like the
						     layout above it: which theme suits the room is a question you
						     answer by looking, and nothing on air changes either way. -->
						<div class="flex gap-1">
							{#each THEMES as option (option.id)}
								<button
									class="studio-chip flex-1 {theme.current === option.id
										? 'bg-primary/20 text-primary'
										: ''}"
									aria-pressed={theme.current === option.id}
									onclick={() => applyTheme(option.id)}>{option.label()}</button
								>
							{/each}
						</div>
						<p class="mt-1.5 text-[11px] leading-relaxed text-fg/45">{t('settings.themeHint')}</p>
					</div>
				{/if}

				{#if page === 'output'}
					<div>
						<span class="studio-label">{t('settings.recording')}</span>
						<div class="flex gap-1">
							{#each ['off', 'local', 'cloud', 'both'] as mode}
								<button class="studio-chip flex-1 {draft.settings.recordingMode === mode ? 'bg-primary/20 text-primary' : ''}" onclick={() => (draft.settings.recordingMode = mode as typeof draft.settings.recordingMode)}>{t(`recording.${mode}` as never)}</button>
							{/each}
						</div>
						<p class="mt-1 text-[11px] text-fg/35">{t('settings.recordingHint')}</p>
					</div>
					{#if draft.settings.recordingMode === 'cloud' || draft.settings.recordingMode === 'both'}
						<label class="block"><span class="studio-label">{t('settings.recorderUrl')}</span><input class="studio-input w-full" type="url" bind:value={draft.settings.recorderUrl} /></label>
						<label class="block"><span class="studio-label">{t('settings.recorderToken')}</span><input class="studio-input w-full" type="password" bind:value={draft.settings.recorderToken} /></label>
					{/if}

					{#if isStreaming()}
						<p class="border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
							{t('settings.liveWarning')}
						</p>
					{/if}

					<label class="block">
						<span class="studio-label">
							{t('settings.videoBitrate', { kbps: draft.settings.videoBitrateKbps })}
						</span>
						<input
							type="range"
							min="800"
							max="9000"
							step="100"
							class="w-full accent-primary"
							value={draft.settings.videoBitrateKbps}
							oninput={(e) => {
								draft.settings.videoBitrateKbps = Number(
									(e.currentTarget as HTMLInputElement).value
								);
							}}
						/>
						<span class="text-[11px] text-fg/30">
							{t('settings.uploadHint', { mbps: uploadMbps })}
						</span>
					</label>

					<div>
						<span class="studio-label">{t('settings.audioBitrate')}</span>
						<div class="flex gap-1">
							{#each [96, 128, 160, 192] as kbps (kbps)}
								<button
									class="studio-chip flex-1 {draft.settings.audioBitrateKbps === kbps
										? 'bg-primary/20 text-primary'
										: ''}"
									onclick={() => {
										draft.settings.audioBitrateKbps = kbps;
									}}>{kbps}</button
								>
							{/each}
						</div>
					</div>

					<div>
						<span class="studio-label">{t('settings.encoder')}</span>
						<div class="flex gap-1">
							<button
								class="studio-chip flex-1 {draft.settings.encoder === 'hardware'
									? 'bg-primary/20 text-primary'
									: ''}"
								disabled={ffmpeg ? !ffmpeg.hardware_h264 : false}
								onclick={() => {
									draft.settings.encoder = 'hardware';
								}}>{t('settings.hardware')}</button
							>
							<button
								class="studio-chip flex-1 {draft.settings.encoder === 'software'
									? 'bg-primary/20 text-primary'
									: ''}"
								onclick={() => {
									draft.settings.encoder = 'software';
								}}>{t('settings.software')}</button
							>
						</div>
						<p class="mt-1 text-[11px] text-fg/30">{t('settings.encoderHint')}</p>
					</div>
				{/if}

				{#if page === 'video'}
					<div>
						<span class="studio-label">{t('settings.resolution')}</span>
						<div class="flex gap-1">
							{#each RESOLUTIONS as [width, height, label] (label)}
								<button
									class="studio-chip flex-1 {draft.settings.width === width
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
									class="studio-chip flex-1 {draft.settings.fps === fps
										? 'bg-primary/20 text-primary'
										: ''}"
									onclick={() => {
										draft.settings.fps = fps;
									}}>{fps}</button
								>
							{/each}
						</div>
					</div>
				{/if}

				{#if page === 'video'}
					<label class="flex items-start gap-2 border-t border-ink-700 pt-4 text-[13px] text-fg/75">
						<input
							type="checkbox"
							class="mt-0.5 accent-primary"
							checked={draft.settings.barsWhenNoSource}
							onchange={(e) => {
								draft.settings.barsWhenNoSource = (e.currentTarget as HTMLInputElement).checked;
							}}
						/>
						<span>
							{t('settings.testPattern')}
							<span class="mt-0.5 block text-[11px] leading-relaxed text-fg/35">
								{t('settings.testPatternHint')}
							</span>
						</span>
					</label>
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
							}}>{t('settings.resetLayout')}</button
						>
						<p class="mt-1 text-[11px] leading-relaxed text-fg/30">{t('settings.layoutHint')}</p>
					</div>
				{/if}

				{#if page === 'about'}
					<div class="space-y-1.5 font-mono text-[11px]">
						<span class="studio-label font-body">{t('settings.system')}</span>
						{#if ffmpegError}
							<p class="text-red-400">{ffmpegError}</p>
						{:else if ffmpeg}
							<p class="text-fg/45">{ffmpeg.version}</p>
							<p class="text-fg/25">{ffmpeg.path}</p>
							<p class="text-fg/45">
								{t('settings.hardwareEncoding', {
									state: ffmpeg.hardware_h264
										? t('settings.available')
										: t('settings.unavailable')
								})}
							</p>
						{:else}
							<p class="text-fg/30">{t('settings.checking')}</p>
						{/if}
						<p class="text-fg/45">
							{t('settings.capture', { mime: mime ?? t('settings.unavailable') })}
						</p>
					</div>

					{#if broadcast.command.length > 0}
						<details class="border-t border-ink-700 pt-4">
							<summary class="cursor-pointer text-[11px] text-fg/40">
								{t('settings.ffmpegCommand')}
							</summary>
							<pre
								class="mt-2 overflow-x-auto whitespace-pre-wrap break-all bg-ink-950 p-2 font-mono text-[10px] text-fg/40">{broadcast.command.join(
									' '
								)}</pre>
						</details>
					{/if}

					{#if broadcast.log.length > 0}
						<details class="border-t border-ink-700 pt-4">
							<summary class="cursor-pointer text-[11px] text-fg/40">
								{t('settings.ffmpegLog', { count: broadcast.log.length })}
							</summary>
							<pre
								class="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap break-all bg-ink-950 p-2 font-mono text-[10px] text-fg/40">{broadcast.log
									.slice(-40)
									.join('\n')}</pre>
						</details>
					{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>

<!-- OBS's Cancel / Apply / OK, and for the same reason: an operator who
     mis-clicks a resolution chip during a service has not changed anything
     until they say so. Closing the dialog any other way — Escape, the cross,
     a click outside — discards, which is what Cancel means. -->
<footer
	class="sticky bottom-0 z-10 flex shrink-0 items-center gap-2 border-t border-ink-700 bg-ink-850 px-4 py-3"
>
	<span class="min-w-0 flex-1 truncate text-[11px] {dirty ? 'text-amber-300/90' : 'text-fg/30'}">
		{dirty ? t('settings.unsaved') : t('settings.saved')}
	</span>
	<button class="studio-chip px-3" onclick={onclose}>{t('common.cancel')}</button>
	<button class="studio-chip px-3" disabled={!dirty} onclick={apply}>{t('settings.apply')}</button>
	<button
		class="studio-chip bg-primary/20 px-3 text-primary"
		onclick={() => {
			apply();
			onclose();
		}}>{t('settings.save')}</button
	>
</footer>
