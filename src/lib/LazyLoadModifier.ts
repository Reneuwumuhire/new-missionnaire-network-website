let observer: IntersectionObserver;

function getObserver() {
	if (observer) return;

	observer = new IntersectionObserver((entries: IntersectionObserverEntry[]) => {
		entries.forEach((entry) => {
			if (entry.isIntersecting) {
				entry.target.dispatchEvent(new CustomEvent('isVisible'));
			}
		});
	});
}

export default function lazyLoad(element: any) {
	getObserver();

	observer.observe(element);

	return {
		destroy() {
			observer.unobserve(element);
		}
	};
}
