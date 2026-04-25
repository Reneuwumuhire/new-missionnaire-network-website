// ── BEGIN: online status store (new file) ─────────────────────────
// Reactive readable store mirroring `navigator.onLine`. Subscribers
// receive `false` when the browser reports the device is offline and
// `true` when it comes back online. SSR-safe: returns `true` on the
// server, where `navigator` is unavailable.

import { readable, type Readable } from 'svelte/store';
import { browser } from '$app/environment';

export const isOnline: Readable<boolean> = readable<boolean>(
	browser ? navigator.onLine : true,
	(set) => {
		if (!browser) return;

		const goOnline = () => set(true);
		const goOffline = () => set(false);

		window.addEventListener('online', goOnline);
		window.addEventListener('offline', goOffline);

		// Re-read once on subscribe in case state changed before listeners attached.
		set(navigator.onLine);

		return () => {
			window.removeEventListener('online', goOnline);
			window.removeEventListener('offline', goOffline);
		};
	}
);
// ── END: online status store ──────────────────────────────────────
