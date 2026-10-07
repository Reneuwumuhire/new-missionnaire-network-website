<script lang="ts">
	import { onMount } from 'svelte';
	import {
		askForMicrophone,
		handleFor,
		listDevices,
		watchDevices,
		mediaVersion,
		openMic,
		openPrivacySettings,
		permissions,
		previewAudioId,
		previewAudioLayer,
		release,
		type DeviceOption
	} from '../lib/media.svelte';
	import {
		DESKTOP_AUDIO,
		appAudio,
		capturingApp,
		refreshApps,
		startAppAudio,
		stopAppAudio,
		type AudioApp
	} from '../lib/appaudio.svelte';
	import {
		METER_TICKS,
		decayHold,
		faderDb,
		faderGain,
		formatDb,
		gainPosition,
		meterFraction,
		toDb
	} from '../lib/meter';
	import type { Mixer } from '../lib/mixer';
	import Dock from './Dock.svelte';
	import Icon from './Icon.svelte';
	import { t } from '../lib/i18n.svelte';
	import {
		addAppAudio,
		addAudioInput,
		audioLayers,
		persist,
		studio,
		type AudioSource,
		type Layer
	} from '../lib/state.svelte';

	let { mixer }: { mixer: Mixer | null } = $props();

	let inputs = $state<DeviceOption[]>([]);
	let levels = $state<Record<string, { peaks: [number, number]; hold: [number, number] }>>({});
	let devicesOpen = $state<string | null>(null);

	onMount(() => {
		const stopWatching = watchDevices(refreshDevices);
		let last = performance.now();
		// 30 Hz: enough for a meter to look alive without burning a core.
		const timer = setInterval(() => {
			if (!mixer) return;
			const now = performance.now();
			const elapsed = now - last;
			last = now;
			const next: Record<string, { peaks: [number, number]; hold: [number, number] }> = {};
			for (const stripId of mixer.ids()) {
				const peaks = mixer.peaks(stripId);
				const previous = levels[stripId]?.hold ?? [0, 0];
				next[stripId] = {
					peaks,
					hold: [
						decayHold(previous[0], meterFraction(toDb(peaks[0])), elapsed),
						decayHold(previous[1], meterFraction(toDb(peaks[1])), elapsed)
					]
				};
			}
			levels = next;
		}, 33);
		return () => {
			clearInterval(timer);
			stopWatching();
		};
	});

	async function refreshDevices() {
		inputs = await listDevices('audioinput');
	}

	/** Input sources with a request already in flight — see the effect below. */
	const opening = new Set<string>();

	async function connect(source: AudioSource) {
		await openMic(source.id, source.deviceId);
		// Labels stay blank until permission is granted, so re-read after.
		await refreshDevices();
	}

	/** null closed, 'menu' the two kinds, 'apps' the list of applications. */
	let adding = $state<'menu' | 'apps' | null>(null);

	function addInput() {
		adding = null;
		// The effect below opens it: existing is what makes a source live.
		addAudioInput();
	}

	/** OBS asks which application before the source exists, and so does this.
	 *  A strip that says "Choose an application" is not a source, it is a chore
	 *  left in the mixer — the list comes first, and the strip that appears is
	 *  named after the app and already capturing (the effect below sees the
	 *  appId and starts it). */
	function addAppSource(app: AudioApp) {
		adding = null;
		addAppAudio(app.id, app.name);
	}

	/** Attach an application to a strip and start capturing it. An "Application
	 *  audio" source and a shared window take the same path from here on: the
	 *  same worklet, fader, meter and route to the encoder. */
	async function captureApp(strip: Strip, app: AudioApp) {
		if (!mixer) return;
		strip.source.appId = app.id;
		// The window keeps the name the operator gave it; a placeholder app
		// source has nothing better to be called than the app.
		if (strip.isMic) strip.source.name = app.name;
		failed.delete(attempt(strip.id, app.id));
		persist();
		devicesOpen = null;
		await startAppAudio(mixer, strip.id, app);
	}

	function removeSource(source: AudioSource) {
		release(source.id);
		if (mixer) void stopAppAudio(mixer, source.id);
		mixer?.remove(source.id);
		studio.audioSources = studio.audioSources.filter((s) => s.id !== source.id);
		persist();
	}

	interface Strip {
		id: string;
		name: string;
		isMic: boolean;
		source: AudioSource | Layer;
		preview?: boolean;
	}

	/** Global mics first, then the layers that carry sound: what the scene ON AIR
	 *  contributes, plus any window capturing an application wherever it lives.
	 *  A selected Preview recording gets its own local-only strip. */
	const strips = $derived.by((): Strip[] => {
		void mediaVersion.n;
		const preview = previewAudioLayer();
		return [
			...studio.audioSources.map((source) => ({
				id: source.id,
				name: source.name,
				isMic: true,
				source
			})),
			...(preview
				? [
						{
							id: previewAudioId(preview.id),
							name: `${t('preview.preview')} · ${preview.name}`,
							isMic: false,
							source: preview,
							preview: true
						}
					]
				: []),
			...audioLayers().map((layer) => ({
				id: layer.id,
				name: preview?.id === layer.id ? `${t('preview.program')} · ${layer.name}` : layer.name,
				isMic: false,
				source: layer
			}))
		];
	});

	/** Strips whose sound comes from the native per-application capture: an
	 *  "Application audio" source, and every window or screen share — the engine
	 *  hands those over silent, so the application's own output stands in. */
	function isAppStrip(strip: Strip): boolean {
		return strip.isMic
			? (strip.source as AudioSource).kind === 'app'
			: (strip.source as Layer).kind === 'screen';
	}

	function inactiveReason(strip: Strip): string {
		const error = handleFor(strip.source.id)?.error;
		if (error) return error;
		if (isAppStrip(strip))
			return appAudio.error ?? (strip.source.appId ? t('mixer.appGone') : t('mixer.chooseApp'));
		return strip.isMic ? t('mixer.connect') : t('mixer.noAudioTrack');
	}

	/** Captures that came back with an error, so a failing one is not retried
	 *  forever by the effect below. Keyed by strip *and* application: pointing a
	 *  source at a different window is a different attempt, and refusing to make
	 *  it because an earlier application failed is how a strip stays dark for the
	 *  rest of the service. Choosing an application clears its entry. */
	const failed = new Set<string>();
	const attempt = (id: string, appId: string) => `${id}:${appId}`;

	/** Every strip that knows its application captures it, without being asked
	 *  twice: a window whose app was recognised on sharing, and an application
	 *  source coming back after a restart. OBS behaves this way — a configured
	 *  source is live as soon as it is in the scene, never a strip waiting for
	 *  the operator to re-pick what it already knows. */
	$effect(() => {
		void mediaVersion.n;
		const bus = mixer;
		if (!bus) return;

		// An input device is open because the source exists, not because someone
		// pressed Connect: a strip restored from the last service, or one added
		// before the microphone was allowed, would otherwise sit there saying
		// "Connect input" with an empty device menu behind it.
		//
		// `opening` is what keeps it to one attempt. openMic releases the old
		// handle before it asks for the new stream, and a released handle is a
		// change this effect watches — so without the guard every pending
		// request spawns another, and the device never settles.
		for (const source of studio.audioSources) {
			if (source.kind !== 'input' || handleFor(source.id) || opening.has(source.id)) continue;
			opening.add(source.id);
			void connect(source).finally(() => opening.delete(source.id));
		}

		const wanting = [...studio.audioSources.filter((s) => s.kind === 'app'), ...audioLayers()];
		for (const source of wanting) {
			if (!source.appId) continue;
			// What the strip is actually capturing, not merely whether it has one.
			// Re-sharing a window points the source at another application, and a
			// strip left running the old one is a meter that never matches the
			// picture — or, when the new share had no sound to find, nothing at all.
			if (capturingApp(source.id) === source.appId) continue;
			const key = attempt(source.id, source.appId);
			if (failed.has(key)) continue;
			failed.add(key);
			void startAppAudio(bus, source.id, { id: source.appId, name: source.name }).then((ok) => {
				// One shot per application: a closed one must not be retried on
				// every frame. A different application is a different attempt.
				if (ok) failed.delete(key);
			});
		}
	});

	function setLevel(strip: Strip, gain: number, muted: boolean) {
		strip.source.gain = gain;
		strip.source.muted = muted;
		mixer?.setLevel(strip.id, gain, muted);
		persist();
	}

	const optionsStrip = $derived(strips.find((strip) => strip.id === devicesOpen));

	function toggleOptions(strip: Strip) {
		devicesOpen = devicesOpen === strip.id ? null : strip.id;
		if (devicesOpen && isAppStrip(strip)) void refreshApps();
	}
</script>

<!-- The device menu. Shown both in a connected strip's options and on a strip
     that has not come up yet — choosing the device is how you connect it, so
     hiding the list behind a gear you cannot reach is a dead end. -->
{#snippet deviceSelect(source: AudioSource)}
	<select
		class="studio-input h-7 min-w-0 flex-1 py-0 text-[12px]"
		aria-label={t('mixer.chooseInput')}
		value={source.deviceId ?? ''}
		onchange={(e) => {
			source.deviceId = (e.currentTarget as HTMLSelectElement).value || undefined;
			persist();
			void connect(source);
		}}
	>
		<option value="">{t('mixer.defaultInput')}</option>
		{#each inputs as device (device.deviceId)}
			<option value={device.deviceId}>{device.label}</option>
		{/each}
	</select>
{/snippet}

<Dock id="mixer" title={t('dock.audioMixer')}>
	{#snippet actions()}
		<label class="mr-1 flex cursor-pointer items-center gap-1.5 text-[12px] text-muted">
			<input
				type="checkbox"
				class="accent-primary"
				checked={studio.settings.monitorAudio}
				onchange={(e) => {
					studio.settings.monitorAudio = (e.currentTarget as HTMLInputElement).checked;
					mixer?.setMonitor(studio.settings.monitorAudio);
					persist();
				}}
			/>
			{t('mixer.monitor')}
		</label>
		<div class="relative">
			<button
				class="studio-icon-btn"
				title={t('mixer.addSource')}
				aria-label={t('mixer.addSource')}
				onclick={() => (adding = adding ? null : 'menu')}><Icon name="plus" /></button
			>
			{#if adding === 'menu'}
				<div
					class="absolute right-0 top-7 z-30 w-56 border border-ink-600 bg-ink-850 py-1 shadow-2xl shadow-black/70"
				>
					<button class="block w-full px-3 py-2 text-left hover:bg-primary/15" onclick={addInput}>
						<span class="block text-[13px] text-fg/90">{t('mixer.addMic')}</span>
						<span class="block text-[12px] text-muted">{t('mixer.addMicHint')}</span>
					</button>
					<button
						class="block w-full px-3 py-2 text-left hover:bg-primary/15"
						onclick={async () => {
							adding = 'apps';
							await refreshApps();
						}}
					>
						<span class="block text-[13px] text-fg/90">{t('mixer.addApp')}</span>
						<span class="block text-[12px] text-muted">{t('mixer.addAppHint')}</span>
					</button>
				</div>
			{:else if adding === 'apps'}
				<!-- Which application, before the strip exists — the source is created
				     already named and already capturing, as OBS creates one from its
				     properties dialog. -->
				<div
					class="absolute right-0 top-7 z-30 max-h-72 w-56 overflow-y-auto border border-ink-600 bg-ink-850 py-1 shadow-2xl shadow-black/70"
				>
					{#each appAudio.apps as app (app.id)}
						<button
							class="block w-full truncate px-3 py-1.5 text-left text-[12px] text-fg/85 hover:bg-primary/15"
							onclick={() => addAppSource(app)}>{app.name}</button
						>
					{:else}
						<p class="px-3 py-2 text-[12px] leading-snug text-muted">
							{appAudio.error ?? t('mixer.appAudioUnsupported')}
						</p>
					{/each}
				</div>
			{/if}
		</div>
	{/snippet}

	{#if permissions.microphone === 'denied'}
		<!-- A refusal cannot be undone from in here, so say what happened and
		     point at the one place it can be changed. -->
		<div class="flex items-center gap-2 border-b border-red-500/25 bg-red-500/10 px-3 py-1.5">
			<p class="min-w-0 flex-1 text-[12px] leading-snug text-danger">
				{t('mixer.micDenied')}
				{permissions.message}
			</p>
			<button class="studio-chip shrink-0 text-[12px]" onclick={() => askForMicrophone()}>
				{t('mixer.micRetry')}
			</button>
			<button
				class="studio-chip shrink-0 text-[12px]"
				onclick={() => openPrivacySettings('microphone')}
			>
				{t('mixer.openPrivacy')}
			</button>
		</div>
	{/if}

	{#if studio.settings.monitorAudio}
		<p class="border-b border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[12px] text-warning">
			{t('mixer.monitorWarning')}
		</p>
	{/if}

	{#if optionsStrip}
		{@const strip = optionsStrip}
		{@const source = strip.source as AudioSource}
		<div class="flex flex-wrap items-center gap-1 border-b border-ink-700 bg-ink-850 px-2 py-1.5">
			<span class="max-w-32 truncate text-[12px] text-fg/80">{strip.name}</span>
			{#if isAppStrip(strip)}
				<select
					class="studio-input h-7 min-w-40 flex-1 py-0 text-[12px]"
					aria-label={t('mixer.chooseApp')}
					value={strip.source.appId ?? ''}
					onchange={(e) => {
						const picked = (e.currentTarget as HTMLSelectElement).value;
						const app =
							picked === DESKTOP_AUDIO
								? { id: DESKTOP_AUDIO, name: t('mixer.desktopAudio') }
								: appAudio.apps.find((a) => a.id === picked);
						if (app) void captureApp(strip, app);
					}}
				>
					<option value="">{t('mixer.chooseApp')}</option>
					<option value={DESKTOP_AUDIO}>{t('mixer.desktopAudio')}</option>
					{#each appAudio.apps as app (app.id)}
						<option value={app.id}>{app.name}</option>
					{/each}
				</select>
				<button
					class="studio-icon-btn"
					title={t('mixer.refreshApps')}
					aria-label={t('mixer.refreshApps')}
					onclick={() => refreshApps()}
				>
					<Icon name="refresh" size={13} />
				</button>
			{:else if strip.isMic}
				{@render deviceSelect(source)}
			{/if}
			{#if !levels[strip.id]}
				<span class="max-w-52 truncate text-[12px] text-muted" title={inactiveReason(strip)}>
					{inactiveReason(strip)}
				</span>
			{/if}
			<button
				class="studio-chip px-2 text-[12px]"
				title={t('mixer.unity')}
				onclick={() => setLevel(strip, 1, strip.source.muted)}>0 dB</button
			>
			{#if strip.isMic}
				<button
					class="studio-icon-btn"
					title={t('common.remove')}
					aria-label={t('common.remove')}
					onclick={() => removeSource(source)}
				>
					<Icon name="trash" size={14} />
				</button>
			{/if}
			<button
				class="studio-icon-btn"
				title={t('common.close')}
				aria-label={t('common.close')}
				onclick={() => (devicesOpen = null)}>×</button
			>
		</div>
	{/if}

	<div class="flex min-h-[230px] flex-1 overflow-x-auto overflow-y-hidden bg-[#1b1b1e]">
		{#each strips as strip (strip.id)}
			{@const level = levels[strip.id]}
			<!-- The levels poll is reactive; the mixer's internal Map is not. -->
			{@const connected = Boolean(level)}
			{@const position = gainPosition(strip.source.gain)}
			<div class="flex h-full w-[112px] shrink-0 flex-col border-r border-[#3a3a3d]">
				<div
					class="h-[18px] text-center text-[12px] font-semibold leading-[18px] {connected
						? strip.preview
							? 'bg-[#4a331d] text-[#ffc080]'
							: 'bg-[#21355d] text-[#9ebfff]'
						: 'bg-[#29292d] text-[#a4a4ab]'}"
					title={!connected ? inactiveReason(strip) : undefined}
				>
					{connected
						? strip.preview
							? t('preview.preview')
							: t('mixer.active')
						: t('mixer.inactive')}
				</div>
				<div class="flex h-[22px] min-w-0 items-center pl-1.5 pr-1">
					{#if strip.isMic}
						<input
							class="studio-input-flush min-w-0 flex-1 truncate text-[12px]"
							aria-label={strip.name}
							value={strip.name}
							onchange={(e) => {
								strip.source.name = (e.currentTarget as HTMLInputElement).value;
								persist();
							}}
						/>
					{:else}
						<span class="min-w-0 flex-1 truncate text-[12px] text-fg/90" title={strip.name}
							>{strip.name}</span
						>
					{/if}
					<button
						class="text-[#bdbdc5]"
						title={t('mixer.options')}
						aria-label={`${strip.name}: ${t('mixer.options')}`}
						onclick={() => toggleOptions(strip)}><Icon name="down" size={12} /></button
					>
				</div>
				<div
					class="h-[22px] px-1.5 font-mono text-[12px] leading-[20px] {strip.source.muted
						? 'text-danger line-through'
						: 'text-[#a7a7ae]'}"
				>
					{formatDb(faderDb(position))}
				</div>

				<div class="flex min-h-0 flex-1 items-stretch gap-1 px-2" data-meter={strip.id}>
					<div class="relative w-6 shrink-0">
						<span
							class="pointer-events-none absolute inset-x-0 h-px bg-fg/40"
							style="bottom: {gainPosition(1) * 100}%"
						></span>
						<input
							type="range"
							min="0"
							max="1"
							step="0.005"
							class="studio-fader studio-fader-vertical"
							style="--level: {position * 100}%"
							aria-label={`${strip.name}: ${t('mixer.fader')}`}
							aria-orientation="vertical"
							aria-valuetext={formatDb(faderDb(position))}
							value={position}
							oninput={(e) =>
								setLevel(
									strip,
									faderGain(Number((e.currentTarget as HTMLInputElement).value)),
									strip.source.muted
								)}
						/>
					</div>
					<div class="flex h-full shrink-0 gap-px">
						{#each [0, 1] as channel (channel)}
							{@const fraction = meterFraction(toDb(level?.peaks[channel] ?? 0))}
							<div
								class="relative h-full w-[8px] bg-ink-950"
								role="meter"
								aria-label={`${strip.name} ${channel + 1}`}
								aria-valuemin="-60"
								aria-valuemax="0"
								aria-valuenow={Math.max(-60, Math.round(toDb(level?.peaks[channel] ?? 0)))}
							>
								<div
									class="absolute inset-0"
									class:opacity-40={!connected}
									style="background: linear-gradient(to top, #19ad4b 0%, #19ad4b 70%, #c4ba28 70%, #c4ba28 90%, #bb292d 90%, #bb292d 100%)"
								></div>
								{#if connected}
									<div
										class="absolute inset-x-0 top-0 bg-ink-950/60"
										style="height: {(1 - fraction) * 100}%"
									></div>
								{/if}
								{#if level && level.hold[channel] > 0.01}
									<div
										class="absolute inset-x-0 h-px bg-fg/80"
										style="bottom: {level.hold[channel] * 100}%"
									></div>
								{/if}
							</div>
						{/each}
					</div>
					<div
						class="relative min-w-0 flex-1 font-mono text-[#b9b9bf]"
						style="font-size: 9px; line-height: 10px"
					>
						{#each METER_TICKS as tick (tick)}
							<span
								class="absolute left-0"
								style="top: calc({(1 - meterFraction(tick)) * 100}% - {(1 - meterFraction(tick)) *
									10}px)">{tick}</span
							>
						{/each}
					</div>
				</div>

				<div class="flex h-8 items-center justify-between px-2">
					<button
						class="text-sm {strip.source.muted ? 'text-danger' : 'text-muted hover:text-fg'}"
						title={strip.source.muted ? t('mixer.unmute') : t('mixer.mute')}
						aria-label={strip.source.muted ? t('mixer.unmute') : t('mixer.mute')}
						onclick={() => setLevel(strip, strip.source.gain, !strip.source.muted)}
					>
						<Icon name={strip.source.muted ? 'volumeOff' : 'volume'} size={16} />
					</button>
					<button
						class="studio-icon-btn"
						title={t('mixer.options')}
						aria-label={`${strip.name}: ${t('mixer.options')}`}
						onclick={() => toggleOptions(strip)}><Icon name="gear" size={14} /></button
					>
				</div>
			</div>
		{:else}
			<p class="px-3 py-4 text-[12px] text-muted">{t('mixer.empty')}</p>
		{/each}
	</div>
</Dock>
