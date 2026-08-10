<script lang="ts">
	import { FULL_FRAME } from '../lib/geom';
	import { handleFor, listDevices, openCamera, type DeviceOption } from '../lib/media.svelte';
	import { onMount } from 'svelte';
	import { DEFAULT_TEXT_STYLE, persist, selectedLayer, studio } from '../lib/state.svelte';

	let cameras = $state<DeviceOption[]>([]);
	onMount(async () => {
		cameras = await listDevices('videoinput');
	});

	const layer = $derived(selectedLayer());
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
	<p class="p-6 text-center text-[11px] leading-relaxed text-white/30">
		Sélectionnez une source dans la liste, ou cliquez-la directement dans l’aperçu.
	</p>
{:else}
	<div class="space-y-5 overflow-y-auto p-4">
		<div>
			<span class="studio-label">Nom</span>
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
				<span class="studio-label">Appareil</span>
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
					<option value="">Caméra par défaut</option>
					{#each cameras as camera (camera.deviceId)}
						<option value={camera.deviceId}>{camera.label}</option>
					{/each}
				</select>
				{#if handleFor(layer.id)?.error}
					<p class="mt-1 text-[11px] text-amber-400/80">{handleFor(layer.id)?.error}</p>
				{/if}
			</div>
		{/if}

		{#if layer.kind === 'color'}
			<div>
				<span class="studio-label">Couleur</span>
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
				<span class="studio-label">Texte</span>
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
			<label class="flex items-center gap-2 text-sm text-white/70">
				<input
					type="checkbox"
					class="accent-primary"
					checked={layer.showNext ?? false}
					onchange={(e) => {
						layer.showNext = (e.currentTarget as HTMLInputElement).checked;
						commit();
					}}
				/>
				Afficher aussi la ligne suivante
			</label>
		{/if}

		{#if layer.kind === 'video'}
			{@const el = handleFor(layer.id)?.el}
			<div class="flex gap-2">
				<button
					class="studio-chip"
					onclick={() => {
						if (el instanceof HTMLVideoElement) void el.play();
					}}>Lecture</button
				>
				<button
					class="studio-chip"
					onclick={() => {
						if (el instanceof HTMLVideoElement) el.pause();
					}}>Pause</button
				>
				<button
					class="studio-chip"
					onclick={() => {
						if (el instanceof HTMLVideoElement) el.currentTime = 0;
					}}>Début</button
				>
				<button
					class="studio-chip {el instanceof HTMLVideoElement && el.loop ? 'bg-primary/20 text-primary' : ''}"
					onclick={() => {
						if (el instanceof HTMLVideoElement) el.loop = !el.loop;
					}}>Boucle</button
				>
			</div>
		{/if}

		<!-- ── Geometry ─────────────────────────────────────── -->
		<div>
			<div class="mb-1.5 flex items-center justify-between">
				<span class="studio-label mb-0">Position (% du cadre)</span>
				<button
					class="studio-chip"
					onclick={() => {
						layer.rect = { ...FULL_FRAME };
						commit();
					}}>Plein cadre</button
				>
			</div>
			<div class="grid grid-cols-4 gap-1.5">
				{#each [['x', 'X'], ['y', 'Y'], ['w', 'L'], ['h', 'H']] as [key, label] (key)}
					<label class="block">
						<span class="mb-0.5 block text-center text-[10px] text-white/30">{label}</span>
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
				<span class="studio-label">Cadrage</span>
				<div class="flex gap-1">
					{#each [['cover', 'Remplir'], ['contain', 'Entier'], ['stretch', 'Étirer']] as [mode, label] (mode)}
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
			<span class="studio-label">Opacité — {Math.round(layer.opacity * 100)}%</span>
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
				<span class="studio-label">Style du texte</span>

				<label class="block">
					<span class="mb-1 block text-[11px] text-white/40">
						Taille — {Math.round(s.size * 100)}% de la hauteur
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
						<span class="mb-1 block text-[11px] text-white/40">Couleur</span>
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
						<span class="mb-1 block text-[11px] text-white/40">Police</span>
						<select
							class="studio-input w-full"
							value={s.font}
							onchange={(e) => {
								s.font = (e.currentTarget as HTMLSelectElement).value as 'body' | 'display';
								commit();
							}}
						>
							<option value="body">Outfit (sans)</option>
							<option value="display">Cormorant (serif)</option>
						</select>
					</label>
				</div>

				<div class="grid grid-cols-2 gap-2">
					<div>
						<span class="mb-1 block text-[11px] text-white/40">Alignement</span>
						<div class="flex gap-1">
							{#each [['left', '⇤'], ['center', '↔'], ['right', '⇥']] as [value, glyph] (value)}
								<button
									class="studio-chip flex-1 {s.align === value ? 'bg-primary/20 text-primary' : ''}"
									onclick={() => {
										s.align = value as typeof s.align;
										commit();
									}}>{glyph}</button
								>
							{/each}
						</div>
					</div>
					<div>
						<span class="mb-1 block text-[11px] text-white/40">Vertical</span>
						<div class="flex gap-1">
							{#each [['top', '⇡'], ['middle', '↕'], ['bottom', '⇣']] as [value, glyph] (value)}
								<button
									class="studio-chip flex-1 {s.valign === value ? 'bg-primary/20 text-primary' : ''}"
									onclick={() => {
										s.valign = value as typeof s.valign;
										commit();
									}}>{glyph}</button
								>
							{/each}
						</div>
					</div>
				</div>

				<div>
					<span class="mb-1 block text-[11px] text-white/40">Fond</span>
					<div class="flex flex-wrap gap-1">
						{#each [['transparent', 'Aucun'], ['rgba(0,0,0,0.55)', 'Sombre'], ['rgba(0,0,0,0.85)', 'Opaque'], ['rgba(255,136,12,0.85)', 'Orange']] as [value, label] (value)}
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
					<label class="flex items-center gap-2 text-[12px] text-white/60">
						<input
							type="checkbox"
							class="accent-primary"
							checked={s.shadow}
							onchange={(e) => {
								s.shadow = (e.currentTarget as HTMLInputElement).checked;
								commit();
							}}
						/>
						Ombre portée
					</label>
					<label class="flex items-center gap-2 text-[12px] text-white/60">
						<input
							type="checkbox"
							class="accent-primary"
							checked={s.uppercase}
							onchange={(e) => {
								s.uppercase = (e.currentTarget as HTMLInputElement).checked;
								commit();
							}}
						/>
						Majuscules
					</label>
				</div>
			</div>
		{/if}
	</div>
{/if}
