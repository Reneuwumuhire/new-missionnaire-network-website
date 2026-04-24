<script lang="ts">
	import { onMount } from 'svelte';

	export let src: string;
	export let srcset: string = '';
	export let sizes: string = '';
	export let placeholderSrc: string;
	export let alt: string = '';
	export let width: number | undefined = undefined;
	export let height: number | undefined = undefined;
	export let loading: 'lazy' | 'eager' = 'lazy';
	export let fetchpriority: 'high' | 'low' | 'auto' = 'auto';
	// Classes applied to the real <img> so callers can keep their existing
	// hover/object-fit styles (the wrapper <div> is presentational only).
	let className: string = '';
	export { className as class };

	let loaded = false;
	let placeholderBroken = false;
	let realImg: HTMLImageElement | undefined;

	function handleLoad() {
		loaded = true;
	}

	// Cached images may never fire `load` on attach because the browser resolved
	// them synchronously. Check `complete` + `naturalWidth` after mount so we
	// don't sit on a blurred frame indefinitely.
	onMount(() => {
		if (realImg?.complete && realImg.naturalWidth > 0) {
			loaded = true;
		}
	});
</script>

<div class="blur-up-wrap relative h-full w-full overflow-hidden">
	{#if placeholderSrc && !placeholderBroken}
		<img
			src={placeholderSrc}
			alt=""
			aria-hidden="true"
			on:error={() => (placeholderBroken = true)}
			class="blur-up-placeholder absolute inset-0 h-full w-full object-cover"
			style:opacity={loaded ? 0 : 1}
		/>
	{/if}
	<img
		bind:this={realImg}
		{src}
		{srcset}
		{sizes}
		{alt}
		{loading}
		{fetchpriority}
		{width}
		{height}
		decoding="async"
		on:load={handleLoad}
		on:error
		class={className}
		style:opacity={loaded ? 1 : 0}
		style:transition="opacity 400ms ease-out"
	/>
</div>

<style>
	.blur-up-placeholder {
		/* scale slightly so the blur's soft edges don't show inside the crop */
		transform: scale(1.1);
		filter: blur(12px);
		transition: opacity 400ms ease-out;
	}
</style>
