import type { Action } from 'svelte/action';

let intersectionObserver: IntersectionObserver;

function ensureIntersectionObserver() {
	if (intersectionObserver) return;

	intersectionObserver = new IntersectionObserver((entries) => {
		entries.forEach((entry) => {
			const eventName = entry.isIntersecting ? 'enterViewport' : 'exitViewport';
			entry.target.dispatchEvent(new CustomEvent(eventName));
		});
	});
}

interface ViewportCallbacks {
	onEnter?: () => void;
	onExit?: () => void;
}

const viewport: Action<Element, ViewportCallbacks | undefined> = (element, callbacks?) => {
	ensureIntersectionObserver();

	intersectionObserver.observe(element);

	let cbs = callbacks;

	function handleEnter() {
		cbs?.onEnter?.();
	}
	function handleExit() {
		cbs?.onExit?.();
	}

	element.addEventListener('enterViewport', handleEnter);
	element.addEventListener('exitViewport', handleExit);

	return {
		update(newCallbacks?: ViewportCallbacks) {
			cbs = newCallbacks;
		},
		destroy() {
			intersectionObserver.unobserve(element);
			element.removeEventListener('enterViewport', handleEnter);
			element.removeEventListener('exitViewport', handleExit);
		}
	};
};

export default viewport;
