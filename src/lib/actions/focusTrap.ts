/** Trap keyboard focus inside a node (modal dialogs, popovers, drawers).
 *
 *  On mount the previously focused element is remembered and, unless
 *  `initialFocus` is `false`, the first focusable descendant is focused.
 *  Tab / Shift+Tab cycle within the node's focusable elements, Escape
 *  invokes `onEscape`, and on destroy focus is restored to the element
 *  that was focused before the trap was activated.
 *
 *  Example:
 *    <div use:focusTrap={{ onEscape: close }} role="dialog">…</div>
 */
export interface FocusTrapOptions {
	onEscape?: () => void;
	initialFocus?: boolean;
}

const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'audio[controls]',
	'video[controls]',
	'[contenteditable]:not([contenteditable="false"])',
	'[tabindex]:not([tabindex="-1"])'
].join(', ');

export function focusTrap(node: HTMLElement, options: FocusTrapOptions = {}) {
	let { onEscape, initialFocus = true } = options;
	const previouslyFocused = document.activeElement as HTMLElement | null;

	const getFocusable = (): HTMLElement[] =>
		Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
			(el) => el.offsetParent !== null || el === document.activeElement
		);

	const handleKeydown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			if (onEscape) {
				event.stopPropagation();
				onEscape();
			}
			return;
		}
		if (event.key !== 'Tab') return;

		const focusable = getFocusable();
		if (focusable.length === 0) {
			event.preventDefault();
			return;
		}

		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		const active = document.activeElement as HTMLElement | null;

		if (event.shiftKey) {
			if (active === first || !active || !node.contains(active)) {
				event.preventDefault();
				last.focus();
			}
		} else if (active === last || !active || !node.contains(active)) {
			event.preventDefault();
			first.focus();
		}
	};

	// Listen at the document level (capture): if the opening click leaves
	// focus on the trigger or <body> — common when the dialog is portaled
	// after mount — a node-scoped listener would never hear Escape.
	document.addEventListener('keydown', handleKeydown, true);

	// Focus on the next frame so `use:portal` (which re-parents the dialog
	// to <body> after mount) has finished before we measure focusability.
	const focusFrame = requestAnimationFrame(() => {
		if (!initialFocus) return;
		const focusable = getFocusable();
		if (focusable.length > 0) focusable[0].focus();
		else {
			node.setAttribute('tabindex', '-1');
			node.focus();
		}
	});

	return {
		update(next: FocusTrapOptions = {}) {
			({ onEscape, initialFocus = true } = next);
		},
		destroy() {
			cancelAnimationFrame(focusFrame);
			document.removeEventListener('keydown', handleKeydown, true);
			previouslyFocused?.focus?.();
		}
	};
}
