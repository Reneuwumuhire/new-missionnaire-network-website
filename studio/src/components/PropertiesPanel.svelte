<script lang="ts">
	import { FULL_FRAME } from '../lib/geom';
	import Icon, { type IconName } from './Icon.svelte';
	import { t } from '../lib/i18n.svelte';
	import {
		applyCursor,
		canHideCursor,
		clampTime,
		handleFor,
		listDevices,
		openCamera,
		type DeviceOption
	} from '../lib/media.svelte';
	import { onMount } from 'svelte';
	import { followMedia, lyrics } from '../lib/lyrics.svelte';
	import { DEFAULT_TEXT_STYLE, persist, selectedLayer, studio } from '../lib/state.svelte';

	let cameras = $state<DeviceOption[]>([]);
	onMount(async () => {
		cameras = await listDevices('videoinput');
	});

	const layer = $derived(selectedLayer());

	// The transport reads the element, which is not reactive state — so it is
	// polled while this panel is open. `timeupdate` alone fires about four times
	// a second, which is too coarse for a scrub bar to feel attached to the
	// thumb.
	let media = $state<HTMLVideoElement | null>(null);
	let position = $state(0);
	let duration = $state(0);
	let playing = $state(false);

	$effect(() => {
		const el = layer?.kind === 'video' ? handleFor(layer.id)?.el : null;
		media = el instanceof HTMLVideoElement ? el : null;
		const timer = setInterval(() => {
			if (!media) return;
			position = media.currentTime;
			duration = Number.isFinite(media.duration) ? media.duration : 0;
			playing = !media.paused && !media.ended;
		}, 100);
		return () => clearInterval(timer);
	});

	function seek(seconds: number) {
		if (!media) return;
		media.currentTime = clampTime(seconds, media.duration);
		position = media.currentTime;
	}

	const skip = (delta: number) => seek((media?.currentTime ?? 0) + delta);

	function togglePlay() {
		if (!media) return;
		if (media.paused) void media.play();
		else media.pause();
		playing = !media.paused;
	}

	/** m:ss, which is all a service needs. */
	function clock(seconds: number): string {
		if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
		const total = Math.floor(seconds);
		return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
	}
	const style = $derived(layer?.style ?? null);

	function commit() {
		persist();
	}

	function ensureStyle() {
		if (layer && !layer.style) layer.style = { ...DEFAULT_TEXT_STYLE };
	}

	const PCT = (v: number) => Math.round(v * 1000) / 10;
</script>

{#if !layer}
	<p class="p-6 text-center text-[11px] leading-relaxed text-fg/30">
		{t('props.empty')}
	</p>
{:else}
	<div class="space-y-5 p-4">
		<div>
			<span class="studio-label">{t('common.name')}</span>
			<input
				class="studio-input w-full"
				value={layer.name}
				onchange={(e) => {
					layer.name = (e.currentTarget as HTMLInputElement).value;
					commit();
				}}
			/>
		</div>

		{#if layer.kind === 'camera'}
			<div>
				<span class="studio-label">{t('props.device')}</span>
				<select
					class="studio-input w-full"
					value={layer.deviceId ?? ''}
					onchange={async (e) => {
						layer.deviceId = (e.currentTarget as HTMLSelectElement).value || undefined;
						commit();
						await openCamera(layer, studio.settings.width, studio.settings.height);
						cameras = await listDevices('videoinput');
					}}
				>
					<option value="">{t('props.defaultCamera')}</option>
					{#each cameras as camera (camera.deviceId)}
						<option value={camera.deviceId}>{camera.label}</option>
					{/each}
				</select>
				{#if handleFor(layer.id)?.error}
					<p class="mt-1 text-[11px] text-amber-400/80">{handleFor(layer.id)?.error}</p>
				{/if}
			</div>
		{/if}

			{#if layer.kind === 'screen'}
			<div class="space-y-1">
				<label class="flex items-center gap-2 text-sm text-fg/70">
					<input
						type="checkbox"
						class="accent-primary"
						checked={layer.hideCursor ?? false}
						onchange={async (e) => {
							layer.hideCursor = (e.currentTarget as HTMLInputElement).checked;
							commit();
							// Applied to the share already running, so the switch does not
							// wait for a reconnect and another trip through the picker.
							await applyCursor(layer);
						}}
					/>
					{t('props.hideCursor')}
				</label>
				{#if !canHideCursor()}
					<p class="text-[11px] leading-snug text-fg/35">{t('props.hideCursorUnsupported')}</p>
				{/if}
			</div>
		{/if}

		{#if layer.kind === 'color'}
			<div>
				<span class="studio-label">{t('props.color')}</span>
				<input
					type="color"
					class="h-10 w-full cursor-pointer border border-ink-600 bg-ink-800"
					value={layer.color ?? '#000000'}
					oninput={(e) => {
						layer.color = (e.currentTarget as HTMLInputElement).value;
						commit();
					}}
				/>
			</div>
		{/if}

		{#if layer.kind === 'text'}
			<div>
				<span class="studio-label">{t('props.text')}</span>
				<textarea
					class="studio-input h-24 w-full resize-none"
					value={layer.text ?? ''}
					oninput={(e) => {
						layer.text = (e.currentTarget as HTMLTextAreaElement).value;
						commit();
					}}
				></textarea>
			</div>
		{/if}

		{#if layer.kind === 'lyrics'}
			<label class="flex items-center gap-2 text-sm text-fg/70">
				<input
					type="checkbox"
					class="accent-primary"
					checked={layer.showNext ?? false}
					onchange={(e) => {
						layer.showNext = (e.currentTarget as HTMLInputElement).checked;
						commit();
					}}
				/>
				{t('props.showNextLine')}
			</label>
		{/if}

		{#if layer.kind === 'video'}
			<!-- The transport lives under the preview, not behind a dialog: this
			     panel is for what a source *is*, not for driving it mid-service. -->
			<p class="text-[11px] leading-relaxed text-fg/35">{t('props.transportMoved')}</p>
		{/if}

		<!-- ── Geometry ─────────────────────────────────────── -->
		<div>
			<div class="mb-1.5 flex items-center justify-between">
				<span class="studio-label mb-0">{t('props.position')}</span>
				<button
					class="studio-chip"
					onclick={() => {
						layer.rect = { ...FULL_FRAME };
						commit();
					}}>{t('props.fullFrame')}</button
				>
			</div>
			<div class="grid grid-cols-4 gap-1.5">
				{#each [['x', 'X'], ['y', 'Y'], ['w', 'L'], ['h', 'H']] as [key, label] (key)}
					<label class="block">
						<span class="mb-0.5 block text-center text-[10px] text-fg/30">{label}</span>
						<input
							type="number"
							step="0.5"
							class="studio-input w-full text-center font-mono text-xs"
							value={PCT(layer.rect[key as 'x'])}
							onchange={(e) => {
								layer.rect = {
									...layer.rect,
									[key]: Number((e.currentTarget as HTMLInputElement).value) / 100
								};
								commit();
							}}
						/>
					</label>
				{/each}
			</div>
		</div>

		{#if ['camera', 'screen', 'image', 'video'].includes(layer.kind)}
			<div>
				<span class="studio-label">{t('props.crop')}</span>
				<div class="flex gap-1">
					{#each [['cover', t('props.cover')], ['contain', t('props.contain')], ['stretch', t('props.stretch')]] as [mode, label] (mode)}
						<button
							class="studio-chip flex-1 {layer.fit === mode ? 'bg-primary/20 text-primary' : ''}"
							onclick={() => {
								layer.fit = mode as typeof layer.fit;
								commit();
							}}>{label}</button
						>
					{/each}
				</div>
			</div>
		{/if}

		<label class="block">
			<span class="studio-label">{t('props.opacity', { percent: Math.round(layer.opacity * 100) })}</span>
			<input
				type="range"
				min="0"
				max="1"
				step="0.01"
				class="w-full accent-primary"
				value={layer.opacity}
				oninput={(e) => {
					layer.opacity = Number((e.currentTarget as HTMLInputElement).value);
					commit();
				}}
			/>
		</label>

		<!-- ── Text styling ─────────────────────────────────── -->
		{#if layer.kind === 'text' || layer.kind === 'lyrics'}
			{@const s = (ensureStyle(), layer.style ?? DEFAULT_TEXT_STYLE)}
			<div class="space-y-3 border-t border-ink-700 pt-4">
				<span class="studio-label">{t('props.textStyle')}</span>

				<label class="block">
					<span class="mb-1 block text-[11px] text-fg/40">
						{t('props.size', { percent: Math.round(s.size * 100) })}
					</span>
					<input
						type="range"
						min="0.02"
						max="0.2"
						step="0.005"
						class="w-full accent-primary"
						value={s.size}
						oninput={(e) => {
							s.size = Number((e.currentTarget as HTMLInputElement).value);
							commit();
						}}
					/>
				</label>

				<div class="grid grid-cols-2 gap-2">
					<label class="block">
						<span class="mb-1 block text-[11px] text-fg/40">{t('props.color')}</span>
						<input
							type="color"
							class="h-9 w-full cursor-pointer border border-ink-600 bg-ink-800"
							value={s.color}
							oninput={(e) => {
								s.color = (e.currentTarget as HTMLInputElement).value;
								commit();
							}}
						/>
					</label>
					<label class="block">
						<span class="mb-1 block text-[11px] text-fg/40">{t('props.font')}</span>
						<select
							class="studio-input w-full"
							value={s.font}
							onchange={(e) => {
								s.font = (e.currentTarget as HTMLSelectElement).value as 'body' | 'display';
								commit();
							}}
						>
							<option value="body">{t('props.fontBody')}</option>
							<option value="display">{t('props.fontDisplay')}</option>
						</select>
					</label>
				</div>

				<div class="grid grid-cols-2 gap-2">
					<div>
						<span class="mb-1 block text-[11px] text-fg/40">{t('props.align')}</span>
						<div class="flex gap-1">
							{#each [['left', 'alignLeft'], ['center', 'alignCenter'], ['right', 'alignRight']] as [value, icon] (value)}
								<button
									class="studio-chip flex flex-1 justify-center {s.align === value
										? 'bg-primary/20 text-primary'
										: ''}"
									aria-label={value}
									onclick={() => {
										s.align = value as typeof s.align;
										commit();
									}}><Icon name={icon as IconName} size={14} /></button
								>
							{/each}
						</div>
					</div>
					<div>
						<span class="mb-1 block text-[11px] text-fg/40">{t('props.valign')}</span>
						<div class="flex gap-1">
							<!-- Same glyphs turned a quarter: top/middle/bottom read as
							     left/centre/right rotated, which is how they behave. -->
							{#each [['top', 'alignLeft'], ['middle', 'alignCenter'], ['bottom', 'alignRight']] as [value, icon] (value)}
								<button
									class="studio-chip flex flex-1 justify-center {s.valign === value
										? 'bg-primary/20 text-primary'
										: ''}"
									aria-label={value}
									onclick={() => {
										s.valign = value as typeof s.valign;
										commit();
									}}><Icon name={icon as IconName} size={14} rotate={1} /></button
								>
							{/each}
						</div>
					</div>
				</div>

				<div>
					<span class="mb-1 block text-[11px] text-fg/40">{t('props.background')}</span>
					<div class="flex flex-wrap gap-1">
						{#each [['transparent', t('props.bgNone')], ['rgba(0,0,0,0.55)', t('props.bgDark')], ['rgba(0,0,0,0.85)', t('props.bgSolid')], ['rgba(255,136,12,0.85)', t('props.bgAccent')]] as [value, label] (value)}
							<button
								class="studio-chip {s.background === value ? 'bg-primary/20 text-primary' : ''}"
								onclick={() => {
									s.background = value;
									commit();
								}}>{label}</button
							>
						{/each}
					</div>
				</div>

				<div class="flex flex-wrap gap-3">
					<label class="flex items-center gap-2 text-[12px] text-fg/60">
						<input
							type="checkbox"
							class="accent-primary"
							checked={s.shadow}
							onchange={(e) => {
								s.shadow = (e.currentTarget as HTMLInputElement).checked;
								commit();
							}}
						/>
						{t('props.shadow')}
					</label>
					<label class="flex items-center gap-2 text-[12px] text-fg/60">
						<input
							type="checkbox"
							class="accent-primary"
							checked={s.uppercase}
							onchange={(e) => {
								s.uppercase = (e.currentTarget as HTMLInputElement).checked;
								commit();
							}}
						/>
						{t('props.uppercase')}
					</label>
				</div>
			</div>
		{/if}
	</div>
{/if}
