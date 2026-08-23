<script lang="ts">
	import { broadcast, isStreaming } from '../lib/broadcast.svelte';
	import Icon from './Icon.svelte';
	import { t } from '../lib/i18n.svelte';
	import { destinationUrl, id, type Destination } from '../lib/state.svelte';

	// The list belongs to the Settings dialog, which stages every change and
	// only puts them into the show on Apply. Nothing here writes to the store.
	let { destinations = $bindable([] as Destination[]) } = $props();

	let revealed = $state<Record<string, boolean>>({});

	const PRESETS = [
		{
			name: () => t('stream.presetMissionnaire'),
			url: 'rtmp://localhost:1935/live',
			hint: () => t('stream.presetMissionnaireHint')
		},
		{
			name: () => t('stream.presetYouTube'),
			url: 'rtmp://a.rtmp.youtube.com/live2',
			hint: () => t('stream.presetYouTubeHint')
		},
		{
			name: () => t('stream.presetFacebook'),
			url: 'rtmps://live-api-s.facebook.com:443/rtmp',
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
				// Preflight is useful only when the destination receives the signal.
				hold: false
			}
		];
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

<div class="space-y-3 p-4">
	<p class="text-[11px] leading-relaxed text-fg/40">{t('stream.intro')}</p>

	{#each destinations as destination (destination.id)}
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
				<button class="studio-icon-btn" title={t('common.remove')} aria-label={t('common.remove')} onclick={() => remove(destination)}><Icon name="trash" size={14} /></button>
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
			<button class="studio-chip" title={preset.hint()} onclick={() => add(preset)}>+ {preset.name()}</button>
		{/each}
		<button class="studio-chip" onclick={() => add()}>+ {t('stream.presetBlank')}</button>
	</div>

	<p class="text-[11px] leading-relaxed text-fg/30">{t('stream.keyWarning')}</p>
</div>
