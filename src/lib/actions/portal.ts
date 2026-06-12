/** Move a node out of its DOM parent and append it to a target element
 *  (defaults to `document.body`). Use on overlays/modals when an ancestor
 *  has `transform`/`will-change`/`filter`/`perspective` — any of those
 *  makes the ancestor a containing block for `position: fixed` children,
 *  which breaks viewport-anchored centering.
 *
 *  Example:
 *    <div use:portal class="fixed inset-0 flex items-center justify-center">…</div>
 */
export function portal(node: HTMLElement, target: HTMLElement | string = document.body) {
	const resolveTarget = (value: HTMLElement | string): HTMLElement => {
		if (typeof value === 'string') {
			const el = document.querySelector<HTMLElement>(value);
			if (!el) throw new Error(`portal: target "${value}" not found`);
			return el;
		}
		return value;
	};

	let mountTarget = resolveTarget(target);
	mountTarget.appendChild(node);

	return {
		update(next: HTMLElement | string) {
			const nextTarget = resolveTarget(next);
			if (nextTarget !== mountTarget) {
				mountTarget = nextTarget;
				mountTarget.appendChild(node);
			}
		},
		destroy() {
			if (node.parentNode) node.parentNode.removeChild(node);
		}
	};
}
