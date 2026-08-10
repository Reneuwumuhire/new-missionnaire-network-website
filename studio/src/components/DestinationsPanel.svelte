<script lang="ts">
	import { broadcast } from '../lib/broadcast.svelte';
	import { destinationUrl, id, persist, studio, type Destination } from '../lib/state.svelte';

	let revealed = $state<Record<string, boolean>>({});

	const PRESETS: { name: string; url: string; hint: string }[] = [
		{
			name: 'Missionnaire (app + radio)',
			url: 'rtmp://localhost:1935/live',
			hint: 'Votre serveur MediaMTX — alimente la radio et l’app.'
		},
		{ name: 'YouTube', url: 'rtmp://a.rtmp.youtube.com/live2', hint: 'Clé dans YouTube Studio › Direct.' },
		{ name: 'Facebook', url: 'rtmps://live-api-s.facebook.com:443/rtmp', hint: 'Clé dans Facebook Live Producer.' }
	];

	function add(preset?: (typeof PRESETS)[number]) {
		studio.destinations = [
			...studio.destinations,
			{
				id: id(),
				name: preset?.name ?? 'Nouvelle destination',
				url: preset?.url ?? 'rtmp://',
				key: '',
				enabled: false
			}
		];
		persist();
	}

	function remove(destination: Destination) {
		studio.destinations = studio.destinations.filter((d) => d.id !== destination.id);
		persist();
	}

	/** What the operator sees before going live, so a typo in the path is caught
	 *  on the ground rather than by a failed connection. */
	function preview(destination: Destination): string {
		const full = destinationUrl(destination);
		return destination.key ? full.replace(destination.key.trim(), '••••••') : full;
	}

	function problem(destination: Destination): string | null {
		const url = destination.url.trim();
		if (!url) return 'URL manquante';
		if (!/^rtmps?:\/\//.test(url)) return 'L’URL doit commencer par rtmp:// ou rtmps://';
		if (/[|[\]'"\\\s]/.test(destinationUrl(destination))) return 'Caractère interdit dans l’URL ou la clé';
		return null;
	}
</script>

<div class="space-y-3 overflow-y-auto p-4">
	<p class="text-[11px] leading-relaxed text-white/40">
		Chaque destination activée reçoit le même encodage. Si l’une refuse la connexion, les autres
		continuent — YouTube ne peut pas faire tomber la radio.
	</p>

	{#each studio.destinations as destination (destination.id)}
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
					disabled={broadcast.live}
					onchange={(e) => {
						destination.enabled = (e.currentTarget as HTMLInputElement).checked;
						persist();
					}}
				/>
				<input
					class="studio-input-flush min-w-0 flex-1 text-sm"
					value={destination.name}
					onchange={(e) => {
						destination.name = (e.currentTarget as HTMLInputElement).value;
						persist();
					}}
				/>
				<button class="studio-icon-btn" title="Retirer" aria-label="Retirer" onclick={() => remove(destination)}>×</button>
			</div>

			<div class="mt-2 space-y-1.5">
				<input
					class="studio-input w-full font-mono text-[11px]"
					placeholder="rtmp://serveur/application"
					value={destination.url}
					onchange={(e) => {
						destination.url = (e.currentTarget as HTMLInputElement).value;
						persist();
					}}
				/>
				<div class="flex gap-1.5">
					<input
						class="studio-input min-w-0 flex-1 font-mono text-[11px]"
						type={revealed[destination.id] ? 'text' : 'password'}
						placeholder="clé de flux"
						value={destination.key}
						onchange={(e) => {
							destination.key = (e.currentTarget as HTMLInputElement).value;
							persist();
						}}
					/>
					<button
						class="studio-chip"
						onclick={() => (revealed[destination.id] = !revealed[destination.id])}
						>{revealed[destination.id] ? 'Cacher' : 'Voir'}</button
					>
				</div>
			</div>

			{#if issue}
				<p class="mt-2 text-[11px] text-amber-400/90">{issue}</p>
			{:else}
				<p class="mt-2 truncate font-mono text-[10px] text-white/25">{preview(destination)}</p>
			{/if}
		</div>
	{/each}

	<div class="flex flex-wrap gap-1.5 border-t border-ink-700 pt-3">
		{#each PRESETS as preset (preset.name)}
			<button class="studio-chip" title={preset.hint} onclick={() => add(preset)}>+ {preset.name}</button>
		{/each}
		<button class="studio-chip" onclick={() => add()}>+ Vide</button>
	</div>

	<p class="text-[11px] leading-relaxed text-white/30">
		Les clés sont enregistrées en clair dans les données de l’application, comme le fait OBS. Ne
		partagez pas de capture d’écran avec la clé affichée.
	</p>
</div>
