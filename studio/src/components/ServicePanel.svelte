<script lang="ts">
	import { onMount } from 'svelte';
	import { broadcast } from '../lib/broadcast.svelte';
	import { loadSrt, lyrics } from '../lib/lyrics.svelte';
	import {
		listDevices,
		watchDevices,
		openFile,
		mediaVersion,
		type DeviceOption
	} from '../lib/media.svelte';
	import Modal from './Modal.svelte';
	import {
		pickServiceFile,
		serviceFileError,
		subtitleContentError,
		audioContentError
	} from '../lib/service-files';
	import type { Mixer } from '../lib/mixer';
	import { recording } from '../lib/recording.svelte';
	import {
		applyRouting,
		bindPreparedQueue,
		correctLiveTiming,
		endLiveSermon,
		liveReady,
		preparedReady,
		resetService,
		retryLiveRecording,
		selectServiceType,
		serviceRuntime,
		startLiveSermon,
		startPreparedProgramme,
		takeKrefeldLive
	} from '../lib/service-workflow.svelte';
	import {
		activeScene,
		addAudioInput,
		makeLayer,
		persist,
		studio,
		type ServicePhase
	} from '../lib/state.svelte';

	let { mixer }: { mixer: Mixer | null } = $props();
	let outputs = $state<DeviceOption[]>([]);
	let inputs = $state<DeviceOption[]>([]);
	let setupOpen = $state(false);
	let refreshing = $state(false);
	let fileError = $state('');
	let validatingFile = $state(false);
	let pickingFile = $state(false);
	let headphoneError = $state('');

	async function refreshDevices() {
		refreshing = true;
		try {
			[outputs, inputs] = await Promise.all([
				listDevices('audiooutput'),
				listDevices('audioinput')
			]);
		} finally {
			refreshing = false;
		}
	}
	onMount(() => watchDevices(refreshDevices));
	const outputAvailable = $derived(
		outputs.some((device) => device.deviceId === studio.settings.interpreterOutputDeviceId)
	);

	$effect(() => {
		const output = studio.settings.interpreterOutputDeviceId;
		if (mixer && output && outputAvailable) {
			void mixer.setReferenceOutput(output).then((ok) => {
				headphoneError = ok
					? ''
					: 'Could not route audio to these headphones. Reconnect them and select again.';
			});
		}
	});

	async function setHeadphones(deviceId: string) {
		const ok = await mixer?.setReferenceOutput(deviceId);
		headphoneError = ok
			? ''
			: 'Could not select this output. Check your headphones and system sound settings.';
		if (ok) studio.settings.interpreterOutputDeviceId = deviceId;
		persist();
	}

	type PreparedRole = 'openingLayerId' | 'sermonLayerId' | 'closingLayerId';
	async function chooseFile(role: PreparedRole | 'subtitle') {
		if (pickingFile) return;
		pickingFile = true;
		fileError = '';
		try {
			const file = await pickServiceFile(role === 'subtitle' ? 'subtitle' : 'audio');
			if (file) {
				if (role === 'subtitle') await assignSubtitle(file);
				else await assignFile(role, file);
			}
		} catch (error) {
			fileError = String(error);
		} finally {
			pickingFile = false;
		}
	}
	const phaseNames: Record<ServicePhase, string> = {
		ready: 'Ready',
		opening: 'Opening music',
		sermon: 'Sermon',
		closing: 'Closing music / waiting',
		complete: 'Programme complete'
	};

	async function assignFile(role: PreparedRole, file: File) {
		fileError = serviceFileError(file, 'audio') ?? '';
		if (fileError) return;
		validatingFile = true;
		try {
			fileError = (await audioContentError(file)) ?? '';
		} catch {
			fileError = 'Could not read this audio file. Please try again.';
		} finally {
			validatingFile = false;
		}
		if (fileError) return;
		let layer = studio.scenes
			.flatMap((scene) => scene.layers)
			.find(({ id }) => id === studio.service[role]);
		if (!layer) {
			layer = makeLayer('video', file.name, { audioOnly: true, muted: true, fileName: file.name });
			activeScene().layers = [layer, ...activeScene().layers];
			studio.service[role] = layer.id;
		} else {
			layer.fileName = file.name;
			layer.name = file.name;
		}
		openFile(layer, file);
		applyRouting();
		persist();
		bindPreparedQueue();
	}

	async function assignSubtitle(file: File) {
		fileError = serviceFileError(file, 'subtitle') ?? '';
		if (fileError) return;
		let text: string;
		try {
			text = await file.text();
		} catch {
			fileError = 'Could not read this file. Please try again.';
			return;
		}
		fileError = subtitleContentError(text) ?? '';
		if (fileError) return;
		loadSrt(text, file.name);
		studio.service.subtitleFileName = file.name;
		lyrics.onAir = false;
		serviceRuntime.error = null;
		persist();
	}

	function setKrefeld(id: string) {
		studio.service.krefeldLayerId = id || null;
		applyRouting();
		persist();
	}

	function setInterpreter(id: string) {
		if (id.startsWith('device:')) {
			const device = inputs.find((input) => input.deviceId === id.slice(7));
			if (!device) return;
			const source =
				studio.audioSources.find(
					(source) => source.kind === 'input' && source.deviceId === device.deviceId
				) ?? addAudioInput();
			source.deviceId = device.deviceId;
			source.name = device.label;
			id = source.id;
		}
		for (const source of studio.audioSources) {
			if (source.serviceRole === 'interpreter') source.serviceRole = undefined;
			if (source.id === id) source.serviceRole = 'interpreter';
		}
		applyRouting();
		persist();
	}

	const mediaLayers = $derived(
		studio.scenes
			.flatMap((scene) => scene.layers)
			.filter((layer) => ['screen', 'video'].includes(layer.kind) && !layer.audioOnly)
	);
	const interpreterId = $derived(
		studio.audioSources.find((source) => source.serviceRole === 'interpreter')?.id ?? ''
	);
	const missing = $derived.by(() => {
		void mediaVersion.n;
		const required = studio.service.type === 'prepared' ? preparedReady() : liveReady();
		if (validatingFile) required.push('audio file validation');
		if (
			studio.service.type === 'live' &&
			studio.settings.interpreterOutputDeviceId &&
			!outputs.some((device) => device.deviceId === studio.settings.interpreterOutputDeviceId)
		)
			required.push('reconnect interpreter headphones');
		if (studio.service.type === 'live' && headphoneError) required.push('working headphone output');
		return required;
	});
	const editable = $derived(
		['ready', 'complete'].includes(studio.service.phase) && !serviceRuntime.busy && !validatingFile
	);
	function fileName(role: PreparedRole) {
		return (
			studio.scenes
				.flatMap((scene) => scene.layers)
				.find((layer) => layer.id === studio.service[role])?.fileName ?? ''
		);
	}
	const outputMs = () => broadcast.stats?.out_time_ms ?? 0;
	const sermonSeconds = $derived(
		studio.service.sermonStartedAt === null
			? 0
			: Math.max(
					0,
					Math.round(
						((studio.service.sermonEndedAt ?? outputMs()) - studio.service.sermonStartedAt) / 1000
					)
				)
	);

	$effect(() => {
		void studio.service.openingLayerId;
		void studio.service.sermonLayerId;
		void studio.service.closingLayerId;
		bindPreparedQueue();
	});
</script>

<section
	class="mx-4 mt-2 shrink-0 rounded-lg border border-ink-700 bg-ink-900/80 px-4 py-3"
	aria-label="Service workflow"
>
	<div class="flex flex-wrap items-center gap-3">
		<div class="mr-auto">
			<div class="flex items-center gap-2">
				<span class="h-2 w-2 rounded-full {missing.length ? 'bg-amber-400' : 'bg-emerald-400'}"
				></span>
				<span class="text-xs font-semibold text-fg/90"
					>{studio.service.type === 'prepared'
						? 'Pre-recorded Kinyarwanda'
						: 'Live from Krefeld'}</span
				>
				<span class="rounded bg-ink-700 px-2 py-0.5 text-[10px] text-fg/60"
					>{phaseNames[studio.service.phase]}</span
				>
			</div>
			<p class="mt-1 text-[11px] text-fg/45">
				{studio.service.type === 'prepared'
					? 'Opening music → Kinyarwanda sermon → Closing music'
					: 'Krefeld programme with live Kinyarwanda interpretation'}
			</p>
		</div>
		<button
			class="studio-chip rounded px-3 py-2"
			onclick={() => {
				setupOpen = true;
				void refreshDevices();
			}}>{editable ? 'Set up service' : 'View setup'}</button
		>
	</div>
	{#if setupOpen}
		<Modal title="Service setup" onclose={() => (setupOpen = false)}>
			<div class="space-y-5 p-5">
				<p class="text-xs leading-relaxed text-fg/50">
					Choose your service type, then prepare the sources below. Your selections are saved
					automatically.
				</p>
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-[10px] font-semibold uppercase tracking-wider text-fg/40">Service</span>
					<button
						class="studio-chip {studio.service.type === 'prepared'
							? 'border-primary/50 bg-primary/15 text-primary'
							: ''}"
						disabled={!editable}
						aria-pressed={studio.service.type === 'prepared'}
						onclick={() => selectServiceType('prepared')}>Pre-recorded Kinyarwanda</button
					>
					<button
						class="studio-chip {studio.service.type === 'live'
							? 'border-primary/50 bg-primary/15 text-primary'
							: ''}"
						disabled={!editable}
						aria-pressed={studio.service.type === 'live'}
						onclick={() => selectServiceType('live')}>Live from Krefeld</button
					>
					<span class="ml-auto text-[11px] text-fg/55">{phaseNames[studio.service.phase]}</span>
					{#if studio.service.type === 'prepared'}
						<span class="text-[10px] text-fg/35">Existing sermon file · no recording</span>
					{:else}
						<span
							class="text-[10px] {serviceRuntime.recordingStatus === 'failed'
								? 'text-red-300'
								: 'text-fg/35'}"
						>
							{serviceRuntime.recordingStatus === 'idle'
								? 'Live recording ready'
								: serviceRuntime.recordingStatus}
						</span>
					{/if}
				</div>

				<fieldset
					disabled={!editable || pickingFile}
					class="grid gap-4 disabled:opacity-60 sm:grid-cols-2"
				>
					<legend class="mb-3 text-xs font-semibold text-fg/80"
						>{studio.service.type === 'prepared'
							? 'Programme audio'
							: 'Sources & audio routing'}</legend
					>
					{#if studio.service.type === 'prepared'}
						{#each [['Opening music', 'openingLayerId'], ['Kinyarwanda recording', 'sermonLayerId'], ['Closing music', 'closingLayerId']] as item}
							<label class="min-w-0 rounded-lg border border-ink-700 bg-ink-850 p-3">
								<span class="block text-xs font-medium text-fg/80">{item[0]}</span>
								<span
									class="mt-1 block truncate text-[11px] text-fg/45"
									title={fileName(item[1] as PreparedRole)}
									>{fileName(item[1] as PreparedRole) || 'Choose an audio file'}</span
								>
								<button
									type="button"
									class="studio-chip mt-3 rounded px-3 py-2"
									aria-label={`Choose ${item[0]}`}
									onclick={() => void chooseFile(item[1] as PreparedRole)}>Choose audio…</button
								>
							</label>
						{/each}
						<label class="min-w-0"
							><span class="studio-label">Images only — sound excluded</span>
							<select
								class="studio-input h-8 w-full"
								value={studio.service.krefeldLayerId ?? ''}
								onchange={(event) => setKrefeld(event.currentTarget.value)}
							>
								<option value="">Prepared title card</option>
								{#each mediaLayers as layer (layer.id)}<option value={layer.id}>{layer.name}</option
									>{/each}
							</select></label
						>
					{:else}
						<label class="min-w-0"
							><span class="studio-label">Continuous Krefeld live</span>
							<select
								class="studio-input h-8 w-full"
								value={studio.service.krefeldLayerId ?? ''}
								onchange={(e) => setKrefeld(e.currentTarget.value)}
							>
								<option value="">Choose source</option>
								{#each mediaLayers as layer (layer.id)}<option value={layer.id}>{layer.name}</option
									>{/each}
							</select>
						</label>
						<label class="min-w-0"
							><span class="studio-label">Interpreter</span>
							<select
								class="studio-input h-8 w-full"
								value={interpreterId}
								onchange={(e) => setInterpreter(e.currentTarget.value)}
							>
								<option value="">Choose microphone</option>
								{#each studio.audioSources.filter((source) => source.kind === 'input') as source (source.id)}<option
										value={source.id}>{source.name}</option
									>{/each}
								<optgroup label="Available microphones">
									{#each inputs.filter((device) => !studio.audioSources.some((source) => source.kind === 'input' && source.deviceId === device.deviceId)) as input (input.deviceId)}
										<option value={`device:${input.deviceId}`}>{input.label}</option>
									{/each}
								</optgroup>
							</select>
						</label>
						<label class="min-w-0"
							><span class="studio-label">Subtitle timing language</span><input
								class="studio-input h-8 w-full"
								bind:value={studio.service.subtitleTimingLanguage}
								onblur={persist}
								placeholder="French"
							/></label
						>
						<label class="min-w-0"
							><span class="studio-label">Interpreter headphones</span>
							<select
								class="studio-input h-8 w-full"
								value={studio.settings.interpreterOutputDeviceId}
								onchange={(event) => void setHeadphones(event.currentTarget.value)}
							>
								<option value="">Choose headphones</option>
								{#if studio.settings.interpreterOutputDeviceId && !outputAvailable}<option
										value={studio.settings.interpreterOutputDeviceId}
										>Selected headphones — disconnected</option
									>{/if}
								{#each outputs as output (output.deviceId)}<option value={output.deviceId}
										>{output.label}</option
									>{/each}
							</select></label
						>
						<div class="flex items-center justify-between gap-3 sm:col-span-2">
							<p class="text-[11px] text-fg/45">
								Connect Bluetooth headphones in system settings. Devices refresh automatically.
							</p>
							<button
								type="button"
								class="studio-chip shrink-0 rounded px-3 py-2"
								disabled={refreshing}
								onclick={() => void refreshDevices()}
								>{refreshing ? 'Refreshing…' : 'Refresh devices'}</button
							>
						</div>
					{/if}

					<label class="min-w-0 rounded-lg border border-ink-700 bg-ink-850 p-3 sm:col-span-2">
						<span class="block truncate text-xs font-medium text-fg/80"
							>Sermon subtitles {studio.service.subtitleFileName
								? `· ${studio.service.subtitleFileName}`
								: ''}</span
						>
						<button
							type="button"
							class="studio-chip mt-3 rounded px-3 py-2"
							onclick={() => void chooseFile('subtitle')}>Choose subtitles (.srt)…</button
						>
						<span class="mt-2 block text-[11px] text-fg/40"
							>SubRip (.srt) with timed sermon captions.</span
						>
					</label>
				</fieldset>
				{#if studio.service.type === 'prepared'}<p class="text-[11px] text-fg/45">
						Supported audio: MP3, WAV, M4A, AAC, AIFF and FLAC. Video is selected separately as an
						image source.
					</p>{/if}
				{#if fileError}<p
						role="alert"
						class="rounded border border-red-400/30 bg-red-400/10 p-3 text-xs text-red-300"
					>
						{fileError}
					</p>{/if}
				{#if validatingFile}<p role="status" class="text-xs text-fg/60">
						Checking audio file…
					</p>{/if}
				{#if headphoneError}<p role="alert" class="text-xs text-red-300">{headphoneError}</p>{/if}
				<div class="flex items-center justify-between gap-4 border-t border-ink-700 pt-4">
					<p class="text-[11px] {missing.length ? 'text-amber-300' : 'text-emerald-300'}">
						{missing.length
							? `Still needed: ${missing.join(', ')}`
							: 'Everything is ready for this service.'}
					</p>
					<button
						class="shrink-0 rounded bg-primary px-5 py-2 text-xs font-semibold text-black"
						onclick={() => (setupOpen = false)}>Done</button
					>
				</div>
			</div>
		</Modal>
	{/if}

	<div class="mt-2 flex flex-wrap items-center justify-end gap-2">
		{#if studio.service.type === 'prepared'}
			<button
				class="bg-primary px-3 py-2 text-[11px] font-semibold text-black disabled:opacity-35"
				disabled={serviceRuntime.busy || studio.service.phase !== 'ready' || missing.length > 0}
				onclick={() => void startPreparedProgramme()}>Start programme</button
			>
		{:else if studio.service.phase === 'ready'}
			<button
				class="studio-chip px-3 py-2"
				disabled={missing.length > 0 || serviceRuntime.busy}
				onclick={() => void takeKrefeldLive()}>Take Krefeld live</button
			>
		{:else if studio.service.phase === 'opening'}
			<button
				class="bg-primary px-3 py-2 text-[11px] font-semibold text-black"
				disabled={serviceRuntime.busy}
				onclick={() => void startLiveSermon(outputMs())}>Start sermon</button
			>
		{:else if studio.service.phase === 'sermon'}
			<button
				class="bg-red-500 px-3 py-2 text-[11px] font-semibold text-white"
				disabled={serviceRuntime.busy}
				onclick={() => void endLiveSermon(outputMs())}>End sermon</button
			>
		{:else}
			<span class="max-w-56 text-[10px] text-fg/50"
				>Sermon ended — recording {serviceRuntime.recordingStatus}; Krefeld continues</span
			>
		{/if}
		{#if studio.service.phase !== 'ready'}<button class="studio-chip" onclick={resetService}
				>Reset</button
			>{/if}
	</div>

	{#if studio.service.type === 'live' && studio.service.phase === 'sermon'}
		<div class="mt-2 flex items-center gap-2 text-[10px] text-fg/45">
			<span
				>Recording sermon · {Math.floor(sermonSeconds / 60)}:{String(sermonSeconds % 60).padStart(
					2,
					'0'
				)}</span
			>
			<button class="studio-chip" onclick={() => correctLiveTiming(-250)}>−0.25s</button>
			<button class="studio-chip" onclick={() => correctLiveTiming(250)}>+0.25s</button>
		</div>
	{/if}
	{#if missing.length && studio.service.phase === 'ready'}<p
			class="mt-1 text-[10px] text-amber-300"
		>
			Required: {missing.join(', ')}
		</p>{/if}
	{#if serviceRuntime.error}<p class="mt-1 text-[10px] text-red-300">{serviceRuntime.error}</p>{/if}
	{#if serviceRuntime.recordingStatus === 'failed' && studio.service.phase === 'sermon'}
		<button
			class="studio-chip mt-1 border-red-400/50 text-red-200"
			onclick={() => void retryLiveRecording()}>Retry recording</button
		>
	{/if}
	{#if serviceRuntime.recordingStatus === 'saved' && recording.savedId}
		<a
			class="ml-2 text-[10px] text-primary underline"
			href={`${studio.settings.adminSiteUrl}/recordings`}
			target="_blank"
			rel="noreferrer">Open saved recording</a
		>
	{/if}
	{#if headphoneError}<p class="mt-1 text-[10px] text-red-300">{headphoneError}</p>{/if}
</section>
