<script lang="ts">
	import { onMount } from 'svelte';

	// Classes applied to the real <img> so callers can keep their existing
	// hover/object-fit styles (the wrapper <div> is presentational only).
	interface Props {
		src: string;
		srcset?: string;
		sizes?: string;
		placeholderSrc: string;
		alt: string;
		width?: number | undefined;
		height?: number | undefined;
		loading?: 'lazy' | 'eager';
		fetchpriority?: 'high' | 'low' | 'auto';
		class?: string;
		onerror?: (event: Event) => void;
	}

	let {
		src,
		srcset = '',
		sizes = '',
		placeholderSrc,
		alt,
		width = undefined,
		height = undefined,
		loading = 'lazy',
		fetchpriority = 'auto',
		class: className = '',
		onerror = undefined
	}: Props = $props();
	

	let loaded = $state(false);
	let placeholderBroken = $state(false);
	let realImg: HTMLImageElement | undefined = $state();

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
			onerror={() => (placeholderBroken = true)}
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
		onload={handleLoad}
		{onerror}
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
