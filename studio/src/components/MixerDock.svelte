<script lang="ts">
	import { onMount } from 'svelte';
	import { handleFor, listDevices, openMic, release, type DeviceOption } from '../lib/media.svelte';
	import {
		appAudio,
		isCapturing,
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
	import { id, liveAudioLayers, persist, studio, type AudioSource, type Layer } from '../lib/state.svelte';

	let { mixer }: { mixer: Mixer | null } = $props();

	let inputs = $state<DeviceOption[]>([]);
	let levels = $state<Record<string, { db: number; hold: number }>>({});
	let devicesOpen = $state<string | null>(null);

	onMount(() => {
		void refreshDevices();
		let last = performance.now();
		// 30 Hz: enough for a meter to look alive without burning a core.
		const timer = setInterval(() => {
			if (!mixer) return;
			const now = performance.now();
			const elapsed = now - last;
			last = now;
			const next: Record<string, { db: number; hold: number }> = {};
			for (const stripId of mixer.ids()) {
				const db = toDb(mixer.peak(stripId));
				next[stripId] = {
					db,
					hold: decayHold(levels[stripId]?.hold ?? 0, meterFraction(db), elapsed)
				};
			}
			levels = next;
		}, 33);
		return () => clearInterval(timer);
	});

	async function refreshDevices() {
		inputs = await listDevices('audioinput');
	}

	async function connect(source: AudioSource) {
		await openMic(source.id, source.deviceId);
		// Labels stay blank until permission is granted, so re-read after.
		await refreshDevices();
	}

	let adding = $state(false);

	function addSource(kind: 'input' | 'app') {
		adding = false;
		studio.audioSources = [
			...studio.audioSources,
			{
				id: id(),
				name:
					kind === 'app'
						? t('mixer.appName')
						: t('mixer.micName', { number: studio.audioSources.length + 1 }),
				kind,
				gain: 1,
				muted: false
			}
		];
		persist();
		if (kind === 'app') void refreshApps();
	}

	/** Attach an application to an app source and start capturing it. */
	async function captureApp(source: AudioSource, app: AudioApp) {
		if (!mixer) return;
		source.appId = app.id;
		source.name = app.name;
		persist();
		devicesOpen = null;
		await startAppAudio(mixer, source.id, app);
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
	}

	/** Global mics first, then whatever the scene ON AIR contributes. */
	const strips = $derived<Strip[]>([
		...studio.audioSources.map((source) => ({ id: source.id, name: source.name, isMic: true, source })),
		...liveAudioLayers().map((layer) => ({ id: layer.id, name: layer.name, isMic: false, source: layer }))
	]);

	/** Why a strip is silent. A screen or window share that connected but
	 *  carries no audio track is the WebKit limitation, not a broken source —
	 *  saying "No audio track" and stopping there leaves the operator hunting
	 *  for a fault that is not theirs. */
	function silenceReason(strip: Strip): { label: string; hint: string } {
		const handle = handleFor(strip.id);
		if (handle?.error) return { label: handle.error, hint: handle.error };
		if (!strip.isMic && (strip.source as Layer).kind === 'screen' && handle?.stream) {
			return { label: t('mixer.noSurfaceAudio'), hint: t('mixer.noSurfaceAudioHint') };
		}
		return { label: t('mixer.noAudioTrack'), hint: '' };
	}

	function setLevel(strip: Strip, gain: number, muted: boolean) {
		strip.source.gain = gain;
		strip.source.muted = muted;
		mixer?.setLevel(strip.id, gain, muted);
		persist();
	}
</script>

<Dock id="mixer" title={t('dock.audioMixer')}>
	{#snippet actions()}
		<label class="mr-1 flex cursor-pointer items-center gap-1.5 text-[10px] text-fg/45">
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
				onclick={() => (adding = !adding)}><Icon name="plus" /></button
			>
			{#if adding}
				<div class="absolute right-0 top-7 z-30 w-56 border border-ink-600 bg-ink-850 py-1 shadow-2xl shadow-black/70">
					<button class="block w-full px-3 py-2 text-left hover:bg-primary/15" onclick={() => addSource('input')}>
						<span class="block text-[13px] text-fg/90">{t('mixer.addMic')}</span>
						<span class="block text-[11px] text-fg/40">{t('mixer.addMicHint')}</span>
					</button>
					<button class="block w-full px-3 py-2 text-left hover:bg-primary/15" onclick={() => addSource('app')}>
						<span class="block text-[13px] text-fg/90">{t('mixer.addApp')}</span>
						<span class="block text-[11px] text-fg/40">{t('mixer.addAppHint')}</span>
					</button>
				</div>
			{/if}
		</div>
	{/snippet}

	{#if studio.settings.monitorAudio}
		<p class="border-b border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] text-amber-300/90">
			{t('mixer.monitorWarning')}
		</p>
	{/if}

	{#each strips as strip (strip.id)}
		{@const connected = mixer?.has(strip.id) ?? false}
		{@const level = levels[strip.id]}
		<div class="group border-b border-ink-800 px-3 py-2">
			<div class="flex items-baseline gap-2">
				{#if strip.isMic}
					<input
						class="studio-input-flush min-w-0 flex-1 text-[12px]"
						value={strip.name}
						onchange={(e) => {
							strip.source.name = (e.currentTarget as HTMLInputElement).value;
							persist();
						}}
					/>
				{:else}
					<span class="min-w-0 flex-1 truncate px-1 text-[12px] text-fg/80">{strip.name}</span>
				{/if}
				<span class="shrink-0 font-mono text-[10px] {connected ? 'text-fg/50' : 'text-fg/20'}">
					{connected && level ? formatDb(level.db) : '—'}
				</span>
				{#if strip.isMic}
					<button
						class="studio-icon-btn opacity-0 group-hover:opacity-100"
						title={t('mixer.chooseInput')}
						aria-label={t('mixer.chooseInput')}
						onclick={() => (devicesOpen = devicesOpen === strip.id ? null : strip.id)}>
							<Icon name="more" size={14} />
						</button>
				{/if}
			</div>

			{#if devicesOpen === strip.id && strip.isMic}
				{@const source = strip.source as AudioSource}
				<div class="mt-1 flex gap-1">
					{#if source.kind === 'app'}
						<select
							class="studio-input h-7 min-w-0 flex-1 py-0 text-[11px]"
							value={source.appId ?? ''}
							onchange={(e) => {
								const app = appAudio.apps.find(
									(a) => a.id === (e.currentTarget as HTMLSelectElement).value
								);
								if (app) void captureApp(source, app);
							}}
						>
							<option value="">{t('mixer.chooseApp')}</option>
							{#each appAudio.apps as app (app.id)}
								<option value={app.id}>{app.name}</option>
							{/each}
						</select>
						<button
							class="studio-icon-btn"
							title={t('mixer.refreshApps')}
							aria-label={t('mixer.refreshApps')}
							onclick={() => refreshApps()}><Icon name="refresh" size={13} /></button
						>
					{:else}
						<select
							class="studio-input h-7 min-w-0 flex-1 py-0 text-[11px]"
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
					{/if}
					<button
						class="studio-icon-btn"
						title={t('common.remove')}
						aria-label={t('common.remove')}
						onclick={() => removeSource(source)}>
						<Icon name="trash" size={14} />
					</button>
				</div>
			{/if}

			{#if connected}
				<!-- dBFS meter. The gradient underneath is the whole −60→0 scale, and
				     the overlay masks everything above the current level — so a given
				     colour always sits at the same dB, which is the point of a meter. -->
				<div class="relative mt-1.5 h-2.5 w-full bg-ink-950">
					<div
						class="absolute inset-0"
						style="background: linear-gradient(to right, #10b981 0%, #10b981 66%, #fbbf24 66%, #fbbf24 85%, #ef4444 85%, #ef4444 100%)"
					></div>
					<div class="absolute inset-y-0 right-0 bg-ink-950/95" style="left: {meterFraction(level?.db ?? -Infinity) * 100}%"></div>
					{#if level && level.hold > 0.01}
						<div class="absolute inset-y-0 w-0.5 bg-fg/70" style="left: {level.hold * 100}%"></div>
					{/if}
				</div>
				<div class="relative mt-0.5 h-3">
					{#each METER_TICKS as tick (tick)}
						<span
							class="absolute top-0 -translate-x-1/2 font-mono text-[8px] text-fg/25"
							style="left: {meterFraction(tick) * 100}%">{tick}</span
						>
					{/each}
				</div>

				<div class="mt-0.5 flex items-center gap-2">
					<button
						class="shrink-0 text-sm {strip.source.muted ? 'text-red-400' : 'text-fg/50 hover:text-fg'}"
						title={strip.source.muted ? t('mixer.unmute') : t('mixer.mute')}
						aria-label={strip.source.muted ? t('mixer.unmute') : t('mixer.mute')}
						onclick={() => setLevel(strip, strip.source.gain, !strip.source.muted)}
					>
						<Icon name={strip.source.muted ? 'volumeOff' : 'volume'} size={16} />
					</button>
					<input
						type="range"
						min="0"
						max="1"
						step="0.005"
						class="min-w-0 flex-1 accent-primary"
						aria-label={t('mixer.fader')}
						value={gainPosition(strip.source.gain)}
						oninput={(e) =>
							setLevel(
								strip,
								faderGain(Number((e.currentTarget as HTMLInputElement).value)),
								strip.source.muted
							)}
					/>
					<!-- Where the fader is, which is a different number from the meter
					     above it and the one an operator calls out. -->
					<button
						class="w-14 shrink-0 text-right font-mono text-[10px] text-fg/45 transition-colors hover:text-fg"
						title={t('mixer.unity')}
						onclick={() => setLevel(strip, 1, strip.source.muted)}
					>
						{formatDb(faderDb(gainPosition(strip.source.gain)))}
					</button>
				</div>
			{:else if strip.isMic}
				{@const source = strip.source as AudioSource}
				{#if source.kind === 'app'}
					<button
						class="studio-chip mt-1.5 w-full text-left text-[11px]"
						onclick={async () => {
							await refreshApps();
							devicesOpen = strip.id;
						}}
					>
						{appAudio.error ??
							(appAudio.supported ? t('mixer.chooseApp') : t('mixer.appAudioUnsupported'))}
					</button>
				{:else}
					<button
						class="studio-chip mt-1.5 w-full text-left text-[11px]"
						onclick={() => connect(source)}
					>
						{handleFor(strip.id)?.error ?? t('mixer.connect')}
					</button>
				{/if}
			{:else}
				{@const reason = silenceReason(strip)}
				<p class="mt-1.5 text-[11px] leading-snug text-fg/35" title={reason.hint}>
					{reason.label}
				</p>
				{#if reason.hint}
					<p class="mt-0.5 text-[10px] leading-snug text-fg/25">{reason.hint}</p>
				{/if}
			{/if}
		</div>
	{:else}
		<p class="px-3 py-4 text-[11px] text-fg/30">{t('mixer.empty')}</p>
	{/each}
</Dock>
