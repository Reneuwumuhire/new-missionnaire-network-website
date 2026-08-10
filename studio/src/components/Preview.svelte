<script lang="ts">
	import { applyDrag, hitHandle, type Handle } from '../lib/geom';
	import { activeScene, persist, studio } from '../lib/state.svelte';

	// The program canvas. It is rendered at broadcast resolution and scaled
	// down with CSS — what you see is exactly what goes out, pixel for pixel.
	let { oncanvas }: { oncanvas: (canvas: HTMLCanvasElement) => void } = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let box = $state<HTMLDivElement | null>(null);
	let drag = $state<{ handle: Handle; startX: number; startY: number; layerId: string } | null>(null);

	$effect(() => {
		if (canvas) oncanvas(canvas);
	});

	const selected = $derived(
		activeScene().layers.find((l) => l.id === studio.selectedLayerId && !l.locked && l.visible) ??
			null
	);

	function normalisedPoint(event: PointerEvent): { x: number; y: number } | null {
		if (!box) return null;
		const rect = box.getBoundingClientRect();
		return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
	}

	function onPointerDown(event: PointerEvent) {
		const point = normalisedPoint(event);
		if (!point) return;
		// Topmost unlocked layer under the cursor wins, matching every editor.
		const layers = activeScene().layers;
		for (const layer of layers) {
			if (layer.locked || !layer.visible) continue;
			const handle = hitHandle(layer.rect, point.x, point.y);
			if (!handle) continue;
			studio.selectedLayerId = layer.id;
			drag = { handle, startX: point.x, startY: point.y, layerId: layer.id };
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
			return;
		}
		studio.selectedLayerId = null;
	}

	function onPointerMove(event: PointerEvent) {
		if (!drag) return;
		const point = normalisedPoint(event);
		if (!point) return;
		const scene = activeScene();
		const layer = scene.layers.find((l) => l.id === drag!.layerId);
		if (!layer) return;
		layer.rect = applyDrag(layer.rect, drag.handle, point.x - drag.startX, point.y - drag.startY);
		drag.startX = point.x;
		drag.startY = point.y;
	}

	function onPointerUp() {
		if (drag) persist();
		drag = null;
	}

	const cursor = $derived(drag?.handle === 'move' ? 'grabbing' : 'default');
</script>

<div class="flex h-full min-h-0 flex-col">
	<div class="flex min-h-0 flex-1 items-center justify-center bg-black/40 p-4">
		<div
			bind:this={box}
			role="application"
			aria-label="Aperçu du programme"
			class="relative w-full max-w-full shadow-2xl shadow-black/60 ring-1 ring-ink-700"
			style="aspect-ratio: {studio.settings.width} / {studio.settings.height}; max-height: 100%; cursor: {cursor}"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
		>
			<canvas
				bind:this={canvas}
				width={studio.settings.width}
				height={studio.settings.height}
				class="block h-full w-full"
			></canvas>

			{#if selected}
				<!-- Selection frame. Pointer events stay on the parent so a drag that
				     starts on a handle keeps tracking outside the frame. -->
				<div
					class="pointer-events-none absolute border-2 border-primary/90"
					style="left:{selected.rect.x * 100}%; top:{selected.rect.y * 100}%; width:{selected.rect.w *
						100}%; height:{selected.rect.h * 100}%"
				>
					{#each [['-6px', '-6px'], ['calc(100% - 6px)', '-6px'], ['-6px', 'calc(100% - 6px)'], ['calc(100% - 6px)', 'calc(100% - 6px)']] as [left, top] (left + top)}
						<span
							class="absolute h-3 w-3 border border-black/60 bg-primary"
							style="left:{left}; top:{top}"
						></span>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
