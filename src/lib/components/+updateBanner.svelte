<script lang="ts">
	// Silent service-worker updater. When a new SW finishes installing
	// and is waiting to take over, we send SKIP_WAITING in the background
	// so the next refresh (or the next time the listener opens the app)
	// is already controlled by the new worker. No banner, no forced
	// reload — a normal Cmd+R already fetches fresh HTML + new content-
	// hashed chunks, so the page the listener just refreshed to is the
	// new version. The SW catches up silently behind it.

	import { browser, dev } from '$app/environment';
	import { onMount } from 'svelte';

	const VERSION_TIMEOUT_MS = 1500;

	const applied = new WeakSet<ServiceWorker>();

	function requestWorkerVersion(worker: ServiceWorker | null): Promise<string | null> {
		if (!worker) return Promise.resolve(null);
		const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

		return new Promise((resolve) => {
			let settled = false;
			const finish = (value: string | null) => {
				if (settled) return;
				settled = true;
				window.clearTimeout(timer);
				navigator.serviceWorker.removeEventListener('message', onMessage);
				resolve(value);
			};
			const onMessage = (event: MessageEvent) => {
				const data = event.data as { type?: string; version?: string; requestId?: string };
				if (!data || data.type !== 'VERSION') return;
				// Older deployed workers reply without requestId. We query workers
				// sequentially, so accepting that shape keeps upgrades smooth.
				if (data.requestId && data.requestId !== requestId) return;
				finish(typeof data.version === 'string' ? data.version : null);
			};
			const timer = window.setTimeout(() => finish(null), VERSION_TIMEOUT_MS);

			navigator.serviceWorker.addEventListener('message', onMessage);
			try {
				worker.postMessage({ type: 'GET_VERSION', requestId });
			} catch {
				finish(null);
			}
		});
	}

	async function applyWaitingSilently(worker: ServiceWorker | null) {
		if (!worker || applied.has(worker)) return;
		// First install (no controller yet) is handled by the SW itself —
		// nothing waiting to swap in.
		if (!navigator.serviceWorker.controller) return;

		const activeVersion = await requestWorkerVersion(navigator.serviceWorker.controller);
		const candidateVersion = await requestWorkerVersion(worker);
		// Same version on both sides → nothing to do.
		if (activeVersion && candidateVersion && activeVersion === candidateVersion) return;

		applied.add(worker);
		try {
			worker.postMessage({ type: 'SKIP_WAITING' });
		} catch {
			applied.delete(worker);
		}
	}

	function trackInstalling(reg: ServiceWorkerRegistration) {
		if (!reg.installing) return;
		const installing = reg.installing;
		installing.addEventListener('statechange', () => {
			if (installing.state === 'installed' && navigator.serviceWorker.controller) {
				void applyWaitingSilently(installing);
			}
		});
	}

	onMount(() => {
		if (!browser || dev || !('serviceWorker' in navigator)) return;

		let disposed = false;
		let registration: ServiceWorkerRegistration | null = null;
		let onUpdateFound: (() => void) | null = null;

		(async () => {
			try {
				const reg = await navigator.serviceWorker.getRegistration();
				if (disposed) return;
				if (!reg) return;
				registration = reg;

				void applyWaitingSilently(reg.waiting);
				trackInstalling(reg);

				onUpdateFound = () => trackInstalling(reg);
				reg.addEventListener('updatefound', onUpdateFound);
			} catch {
				/* SW unsupported or registration unavailable — silently skip. */
			}
		})();

		return () => {
			disposed = true;
			if (registration && onUpdateFound) {
				registration.removeEventListener('updatefound', onUpdateFound);
			}
		};
	});
</script>
