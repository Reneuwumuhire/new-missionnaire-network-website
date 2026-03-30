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

export default function viewport(element: Element, callbacks?: { onEnter?: () => void; onExit?: () => void }) {
	ensureIntersectionObserver();

	intersectionObserver.observe(element);

	function handleEnter() {
		callbacks?.onEnter?.();
	}
	function handleExit() {
		callbacks?.onExit?.();
	}

	element.addEventListener('enterViewport', handleEnter);
	element.addEventListener('exitViewport', handleExit);

	return {
		destroy() {
			intersectionObserver.unobserve(element);
			element.removeEventListener('enterViewport', handleEnter);
			element.removeEventListener('exitViewport', handleExit);
		}
	};
}
