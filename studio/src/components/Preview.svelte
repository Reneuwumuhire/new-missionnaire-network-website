<script lang="ts">
	import { startRenderLoop } from '../lib/compositor';
	import { applyDrag, cursorForHandle, hitHandle, type Handle } from '../lib/geom';
	import { activeScene, persist, studio } from '../lib/state.svelte';

	// A canvas rendered at broadcast resolution and scaled down with CSS — what
	// you see is exactly what goes out, pixel for pixel. The program instance is
	// the one MediaRecorder captures.
	let {
		label,
		sceneId,
		program,
		editable,
		live = false,
		oncanvas
	}: {
		label: string;
		sceneId: () => string;
		/** Program canvas: renders transitions, and is the capture source. */
		program: boolean;
		/** Only the scene being edited accepts layer dragging. */
		editable: boolean;
		live?: boolean;
		oncanvas?: (canvas: HTMLCanvasElement) => void;
	} = $props();

	let canvas = $state<HTMLCanvasElement | null>(null);
	let box = $state<HTMLDivElement | null>(null);
	let area = $state<HTMLDivElement | null>(null);
	let drag = $state<{ handle: Handle; startX: number; startY: number; layerId: string } | null>(null);
	/** Handle under the pointer when nothing is being dragged, so the cursor
	 *  announces what a press would do before it is pressed. */
	let hover = $state<Handle | null>(null);
	let fitted = $state({ w: 0, h: 0 });

	$effect(() => {
		if (!canvas) return;
		oncanvas?.(canvas);
		return startRenderLoop(canvas, sceneId, program, () => studio.settings.fps);
	});

	// Size the frame from the measured area rather than from `aspect-ratio` plus
	// `max-height`: CSS can only honour one of width and height when both are
	// constrained, so the box would grow past the window and push the docks off
	// the bottom. Measuring makes it fit both axes, always.
	$effect(() => {
		const el = area;
		if (!el) return;
		const ratio = studio.settings.width / studio.settings.height;
		const measure = () => {
			const scale = Math.min(el.clientWidth / ratio, el.clientHeight);
			fitted = { w: Math.max(0, Math.floor(scale * ratio)), h: Math.max(0, Math.floor(scale)) };
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	});

	const selected = $derived(
		editable
			? (activeScene().layers.find((l) => l.id === studio.selectedLayerId && !l.locked && l.visible) ??
				null)
			: null
	);

	function normalisedPoint(event: PointerEvent): { x: number; y: number } | null {
		if (!box) return null;
		const rect = box.getBoundingClientRect();
		return {
			x: (event.clientX - rect.left) / rect.width,
			y: (event.clientY - rect.top) / rect.height
		};
	}

	/** Topmost unlocked layer under the point, and which of its handles —
	 *  matching every editor, and the same search the cursor and the drag use. */
	function handleAt(point: { x: number; y: number }): { layerId: string; handle: Handle } | null {
		for (const layer of activeScene().layers) {
			if (layer.locked || !layer.visible) continue;
			const handle = hitHandle(layer.rect, point.x, point.y);
			if (handle) return { layerId: layer.id, handle };
		}
		return null;
	}

	function onPointerDown(event: PointerEvent) {
		if (!editable) return;
		const point = normalisedPoint(event);
		if (!point) return;
		const hit = handleAt(point);
		if (!hit) {
			studio.selectedLayerId = null;
			return;
		}
		studio.selectedLayerId = hit.layerId;
		drag = { handle: hit.handle, startX: point.x, startY: point.y, layerId: hit.layerId };
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
	}

	function onPointerMove(event: PointerEvent) {
		const point = normalisedPoint(event);
		if (!point) return;
		if (!drag) {
			hover = editable ? (handleAt(point)?.handle ?? null) : null;
			return;
		}
		const layer = activeScene().layers.find((l) => l.id === drag!.layerId);
		if (!layer) return;
		layer.rect = applyDrag(layer.rect, drag.handle, point.x - drag.startX, point.y - drag.startY);
		drag.startX = point.x;
		drag.startY = point.y;
	}

	function onPointerUp() {
		if (drag) persist();
		drag = null;
	}

	const cursor = $derived(cursorForHandle(drag?.handle ?? hover, drag !== null));
</script>

<div class="flex min-h-0 min-w-0 flex-1 flex-col">
	<div class="flex h-5 shrink-0 items-center justify-center gap-2">
		<span
			class="text-[9px] font-bold uppercase tracking-[0.2em] {live
				? 'text-red-400'
				: 'text-fg/35'}">{label}</span
		>
		{#if live}
			<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500"></span>
		{/if}
	</div>
	<div bind:this={area} class="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
		<div
			bind:this={box}
			role="application"
			aria-label={label}
			class="relative ring-1 {live ? 'ring-red-500/70' : 'ring-ink-700'}"
			style="width: {fitted.w}px; height: {fitted.h}px; cursor: {cursor}"
			onpointerdown={onPointerDown}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={onPointerUp}
			onpointerleave={() => (hover = null)}
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
					{#each [['-5px', '-5px'], ['calc(100% - 5px)', '-5px'], ['-5px', 'calc(100% - 5px)'], ['calc(100% - 5px)', 'calc(100% - 5px)']] as [left, top] (left + top)}
						<span
							class="absolute h-2.5 w-2.5 border border-black/60 bg-primary"
							style="left:{left}; top:{top}"
						></span>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>
