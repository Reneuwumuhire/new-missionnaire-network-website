<script lang="ts">
	import { audioPreview } from '$lib/stores/audio-preview';
	import { t } from '$lib/i18n';

	// Plays through the ONE shared audio element (see $lib/stores/audio-preview)
	// — no per-row <audio> elements. Starting this row stops any other row.
	let { src }: { src: string } = $props();

	const isActive = $derived($audioPreview.src === src);
	const playing = $derived(isActive && $audioPreview.playing);
	const progress = $derived(
		isActive && $audioPreview.duration > 0
			? ($audioPreview.currentTime / $audioPreview.duration) * 100
			: 0
	);

	function formatDuration(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}
</script>

<div class="flex items-center gap-2">
	<button
		onclick={() => audioPreview.toggle(src)}
		aria-label={playing ? $t('audio.preview.pause') : $t('audio.preview.play')}
		aria-pressed={playing}
		class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors {playing
			? 'bg-primary text-white'
			: 'bg-cream-dark text-stone-600 hover:bg-missionnaire-50 hover:text-primary'}"
	>
		{#if playing}
			<svg class="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
				<rect x="6" y="4" width="4" height="16" rx="1" />
				<rect x="14" y="4" width="4" height="16" rx="1" />
			</svg>
		{:else}
			<svg class="ml-0.5 h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
				<path d="M8 5v14l11-7z" />
			</svg>
		{/if}
	</button>

	{#if isActive}
		<div class="flex items-center gap-2">
			<div class="h-1 w-16 overflow-hidden rounded-full bg-cream-dark">
				<div class="h-full rounded-full bg-primary transition-all" style="width: {progress}%"></div>
			</div>
			<span class="text-xs tabular-nums text-stone-400">
				{formatDuration($audioPreview.currentTime)}
			</span>
		</div>
	{/if}
</div>
