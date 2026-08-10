<script lang="ts">
	// A draggable divider between two panels. It reports pixel deltas and lets
	// the parent decide what they mean — pixels for the fixed-size edges, weight
	// for the dock row.
	let {
		orientation,
		label,
		onmove
	}: {
		/** 'vertical' = a vertical bar you drag left/right. */
		orientation: 'vertical' | 'horizontal';
		label: string;
		onmove: (deltaPx: number) => void;
	} = $props();

	let dragging = $state(false);
	let last = 0;

	const axis = (event: PointerEvent) => (orientation === 'vertical' ? event.clientX : event.clientY);

	function onPointerDown(event: PointerEvent) {
		dragging = true;
		last = axis(event);
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		event.preventDefault();
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragging) return;
		const now = axis(event);
		onmove(now - last);
		last = now;
	}

	function onPointerUp(event: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
	}

	// Keyboard resizing: a divider that only responds to a precise drag is
	// unusable for anyone who cannot make one.
	function onKeyDown(event: KeyboardEvent) {
		const step = event.shiftKey ? 40 : 8;
		const back = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp';
		const forward = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown';
		if (event.key === back) onmove(-step);
		else if (event.key === forward) onmove(step);
		else return;
		event.preventDefault();
	}
</script>

<!-- A separator that can be moved is a widget, and ARIA says it takes focus and
     key events. The lint rule does not model the resizable case. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	role="separator"
	aria-orientation={orientation}
	aria-label={label}
	tabindex="0"
	class="group relative shrink-0 bg-ink-700 transition-colors hover:bg-primary/60 focus-visible:bg-primary {dragging
		? 'bg-primary'
		: ''} {orientation === 'vertical' ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize'}"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	onkeydown={onKeyDown}
>
	<!-- The visible line stays 1px; this widens the grab area to something a
	     hand can actually hit without making the seam look heavy. -->
	<span
		class="absolute {orientation === 'vertical'
			? '-inset-x-[3px] inset-y-0'
			: '-inset-y-[3px] inset-x-0'}"
	></span>
</div>
