type Drop = (insertion: number) => void;

export function createListReorder() {
	let drag: { pointerId: number; startY: number; list: HTMLElement; drop: Drop } | null = null;
	let moved = false;
	let insertion = $state<number | null>(null);

	function findInsertion(list: HTMLElement, event: PointerEvent) {
		const bounds = list.parentElement?.getBoundingClientRect();
		if (
			!bounds ||
			event.clientX < bounds.left ||
			event.clientX > bounds.right ||
			event.clientY < bounds.top ||
			event.clientY > bounds.bottom
		)
			return null;

		const rows = Array.from(list.children);
		const index = rows.findIndex((row) => {
			const rect = row.getBoundingClientRect();
			return event.clientY < rect.top + rect.height / 2;
		});
		return index < 0 ? rows.length : index;
	}

	function cancel(event: PointerEvent) {
		if (drag?.pointerId !== event.pointerId) return;
		drag = null;
		insertion = null;
	}

	return {
		get insertion() {
			return insertion;
		},
		start(event: PointerEvent, drop: Drop) {
			if (event.button !== 0 || drag || !(event.target instanceof Element)) return false;
			const control = event.target.closest('button, input');
			if (control && !control.hasAttribute('data-reorder-grip')) return false;
			const row = event.currentTarget as HTMLElement;
			if (!row.parentElement) return false;
			(control ?? row).setPointerCapture(event.pointerId);
			drag = { pointerId: event.pointerId, startY: event.clientY, list: row.parentElement, drop };
			moved = false;
			return true;
		},
		move(event: PointerEvent) {
			if (!drag || drag.pointerId !== event.pointerId) return;
			if (!moved && Math.abs(event.clientY - drag.startY) < 4) return;
			moved = true;
			insertion = findInsertion(drag.list, event);
		},
		finish(event: PointerEvent) {
			if (!drag || drag.pointerId !== event.pointerId) return;
			const { list, drop } = drag;
			const target = moved ? findInsertion(list, event) : null;
			cancel(event);
			if (target !== null) drop(target);
		},
		cancel,
		// Pointer capture can generate a click at release even after a reorder.
		wasDrag(event: MouseEvent) {
			return event.detail > 0 && moved;
		}
	};
}
