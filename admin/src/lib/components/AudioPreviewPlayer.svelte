<script lang="ts">
	let { src }: { src: string } = $props();

	let audio: HTMLAudioElement | undefined = $state(undefined);
	let playing = $state(false);
	let progress = $state(0);

	function toggle() {
		if (!audio) return;
		if (playing) {
			audio.pause();
		} else {
			// Pause all other audio elements on the page
			document.querySelectorAll('audio').forEach((a) => {
				if (a !== audio) a.pause();
			});
			audio.play();
		}
	}

	function handleTimeUpdate() {
		if (!audio || !audio.duration) return;
		progress = (audio.currentTime / audio.duration) * 100;
	}

	function formatDuration(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}
</script>

<div class="flex items-center gap-2">
	<audio
		bind:this={audio}
		{src}
		preload="none"
		onplay={() => (playing = true)}
		onpause={() => (playing = false)}
		onended={() => { playing = false; progress = 0; }}
		ontimeupdate={handleTimeUpdate}
	></audio>

	<button
		onclick={toggle}
		class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors {playing ? 'bg-primary text-white' : 'bg-cream-dark text-stone-600 hover:bg-missionnaire-50 hover:text-primary'}"
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

	{#if playing && audio}
		<div class="flex items-center gap-2">
			<div class="h-1 w-16 overflow-hidden rounded-full bg-cream-dark">
				<div class="h-full rounded-full bg-primary transition-all" style="width: {progress}%"></div>
			</div>
			<span class="text-xs tabular-nums text-stone-400">
				{formatDuration(audio.currentTime)}
			</span>
		</div>
	{/if}
</div>
