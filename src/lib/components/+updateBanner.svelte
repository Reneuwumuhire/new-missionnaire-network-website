<script lang="ts">
	// Non-intrusive bottom-right banner shown when a new service worker
	// is waiting to take over. Clicking "Recharger" sends SKIP_WAITING
	// to the waiting SW; the controllerchange listener then reloads the
	// page to pick up the new bundle. No forced or surprise reloads —
	// the listener is always the one who triggers it.

	import { browser, dev } from '$app/environment';
	import { onMount } from 'svelte';

	const DISMISSED_VERSION_KEY = 'missionnaire:sw-dismissed-version';
	const APPLYING_VERSION_KEY = 'missionnaire:sw-applying-version';
	const APPLYING_TTL_MS = 60_000;
	const VERSION_TIMEOUT_MS = 1500;

	let updateAvailable = false;
	let waitingWorker: ServiceWorker | null = null;
	let waitingVersion: string | null = null;
	let reloading = false;
	let updateCheckToken = 0;

	function readStoredValue(key: string) {
		try {
			return localStorage.getItem(key) || sessionStorage.getItem(key) || '';
		} catch {
			return '';
		}
	}

	function writeStoredValue(key: string, value: string) {
		try {
			localStorage.setItem(key, value);
		} catch {
			try {
				sessionStorage.setItem(key, value);
			} catch {
				/* storage unavailable */
			}
		}
	}

	function readApplyingVersion() {
		const raw = readStoredValue(APPLYING_VERSION_KEY);
		if (!raw) return null;
		try {
			const parsed = JSON.parse(raw) as { version?: string; at?: number };
			if (!parsed.version || !parsed.at) return null;
			if (Date.now() - parsed.at > APPLYING_TTL_MS) return null;
			return parsed.version;
		} catch {
			return null;
		}
	}

	function clearApplyingVersion() {
		try {
			localStorage.removeItem(APPLYING_VERSION_KEY);
			sessionStorage.removeItem(APPLYING_VERSION_KEY);
		} catch {
			/* storage unavailable */
		}
	}

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

	async function promoteWaitingCandidate(worker: ServiceWorker | null) {
		if (!worker || !navigator.serviceWorker.controller) return;
		const token = ++updateCheckToken;

		const activeVersion = await requestWorkerVersion(navigator.serviceWorker.controller);
		const candidateVersion = await requestWorkerVersion(worker);

		if (token !== updateCheckToken) return;
		if (activeVersion && candidateVersion && activeVersion === candidateVersion) return;
		if (candidateVersion && readStoredValue(DISMISSED_VERSION_KEY) === candidateVersion) return;
		if (candidateVersion && readApplyingVersion() === candidateVersion) return;

		waitingWorker = worker;
		waitingVersion = candidateVersion;
		updateAvailable = true;
	}

	function promoteWaiting(reg: ServiceWorkerRegistration) {
		void promoteWaitingCandidate(reg.waiting);
	}

	function trackInstalling(reg: ServiceWorkerRegistration) {
		if (!reg.installing) return;
		const installing = reg.installing;
		installing.addEventListener('statechange', () => {
			// Only flag an update when there's already a controller —
			// otherwise this is a first install (no banner needed).
			if (installing.state === 'installed' && navigator.serviceWorker.controller) {
				void promoteWaitingCandidate(installing);
			}
		});
	}

	function applyUpdate() {
		if (!waitingWorker || reloading) return;
		reloading = true;
		if (waitingVersion) {
			writeStoredValue(
				APPLYING_VERSION_KEY,
				JSON.stringify({ version: waitingVersion, at: Date.now() })
			);
		}
		waitingWorker.postMessage({ type: 'SKIP_WAITING' });
	}

	function dismiss() {
		updateAvailable = false;
		if (waitingVersion) {
			writeStoredValue(DISMISSED_VERSION_KEY, waitingVersion);
		}
	}

	onMount(() => {
		if (!browser || dev || !('serviceWorker' in navigator)) return;

		let reloaded = false;
		let disposed = false;
		let registration: ServiceWorkerRegistration | null = null;
		let onUpdateFound: (() => void) | null = null;
		const onControllerChange = () => {
			if (!reloading) return;
			if (reloaded) return;
			reloaded = true;
			clearApplyingVersion();
			window.location.reload();
		};
		navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

		(async () => {
			try {
				const reg = await navigator.serviceWorker.getRegistration();
				if (disposed) return;
				if (!reg) return;
				registration = reg;

				promoteWaiting(reg);
				trackInstalling(reg);

				onUpdateFound = () => trackInstalling(reg);
				reg.addEventListener('updatefound', onUpdateFound);
			} catch {
				/* SW unsupported or registration unavailable — silently skip. */
			}
		})();

		return () => {
			disposed = true;
			navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
			if (registration && onUpdateFound) {
				registration.removeEventListener('updatefound', onUpdateFound);
			}
		};
	});
</script>

{#if updateAvailable}
	<div class="update-banner" role="status" aria-live="polite">
		<span class="update-banner__text">Mise à jour disponible</span>
		<button class="update-banner__btn" on:click={applyUpdate} disabled={reloading}>
			{reloading ? 'Rechargement…' : 'Recharger'}
		</button>
		<button class="update-banner__dismiss" on:click={dismiss} aria-label="Plus tard"> × </button>
	</div>
{/if}

<style>
	.update-banner {
		position: fixed;
		left: 50%;
		transform: translateX(-50%);
		bottom: calc(20px + var(--audio-player-height, 0px));
		z-index: 9999;
		display: inline-flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px 10px 18px;
		background: #1c1917;
		color: #f5f5f4;
		border-radius: 999px;
		box-shadow: 0 12px 32px -12px rgba(0, 0, 0, 0.45);
		font-size: 13px;
		font-weight: 500;
		animation: update-banner-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
		max-width: calc(100vw - 32px);
	}
	.update-banner__text {
		white-space: nowrap;
	}
	.update-banner__btn {
		appearance: none;
		border: none;
		background: #ff880c;
		color: #fff;
		font-weight: 600;
		font-size: 12px;
		letter-spacing: 0.05em;
		padding: 6px 14px;
		border-radius: 999px;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}
	.update-banner__btn:hover:not(:disabled) {
		background: #e5790b;
	}
	.update-banner__btn:disabled {
		opacity: 0.7;
		cursor: progress;
	}
	.update-banner__dismiss {
		appearance: none;
		border: none;
		background: transparent;
		color: rgba(245, 245, 244, 0.5);
		font-size: 18px;
		line-height: 1;
		padding: 4px 6px;
		cursor: pointer;
		transition: color 0.15s ease;
	}
	.update-banner__dismiss:hover {
		color: #f5f5f4;
	}
	@keyframes update-banner-in {
		from {
			opacity: 0;
			transform: translate(-50%, 12px);
		}
		to {
			opacity: 1;
			transform: translate(-50%, 0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.update-banner {
			animation: none;
		}
	}
</style>
