import { browser } from '$app/environment';

const durationCache = new Map<string, number>();
const pendingLoads = new Map<string, Promise<number | null>>();

export async function getAudioDuration(url: string): Promise<number | null> {
	if (!browser || !url) return null;

	const cached = durationCache.get(url);
	if (cached !== undefined) {
		return cached;
	}

	const pending = pendingLoads.get(url);
	if (pending) {
		return pending;
	}

	const promise = new Promise<number | null>((resolve) => {
		const audio = new Audio();
		audio.preload = 'metadata';
		audio.crossOrigin = 'anonymous';

		const cleanup = () => {
			audio.onloadedmetadata = null;
			audio.onerror = null;
			audio.src = '';
		};

		audio.onloadedmetadata = () => {
			const duration = Number.isFinite(audio.duration) ? Math.round(audio.duration) : null;
			if (duration !== null) {
				durationCache.set(url, duration);
			}
			pendingLoads.delete(url);
			cleanup();
			resolve(duration);
		};

		audio.onerror = () => {
			pendingLoads.delete(url);
			cleanup();
			resolve(null);
		};

		audio.src = url;
	});

	pendingLoads.set(url, promise);
	return promise;
}
