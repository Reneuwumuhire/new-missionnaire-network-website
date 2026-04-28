<script lang="ts">
	// Non-intrusive bottom-right banner shown when a new service worker
	// is waiting to take over. Clicking "Recharger" sends SKIP_WAITING
	// to the waiting SW; the controllerchange listener then reloads the
	// page to pick up the new bundle. No forced or surprise reloads —
	// the listener is always the one who triggers it.

	import { browser, dev } from '$app/environment';
	import { onMount } from 'svelte';

	const DISMISSED_KEY = 'missionnaire:update-dismissed-this-session';

	let updateAvailable = false;
	let waitingWorker: ServiceWorker | null = null;
	let reloading = false;

	function isDismissed() {
		try {
			return sessionStorage.getItem(DISMISSED_KEY) === 'true';
		} catch {
			return false;
		}
	}

	function clearDismissal() {
		try {
			sessionStorage.removeItem(DISMISSED_KEY);
		} catch {
			/* sessionStorage unavailable */
		}
	}

	function promoteWaiting(reg: ServiceWorkerRegistration) {
		if (!reg.waiting) return;
		if (isDismissed()) return;
		waitingWorker = reg.waiting;
		updateAvailable = true;
	}

	function trackInstalling(reg: ServiceWorkerRegistration) {
		if (!reg.installing) return;
		const installing = reg.installing;
		installing.addEventListener('statechange', () => {
			// Only flag an update when there's already a controller —
			// otherwise this is a first install (no banner needed).
			if (installing.state === 'installed' && navigator.serviceWorker.controller) {
				if (isDismissed()) return;
				waitingWorker = installing;
				updateAvailable = true;
			}
		});
	}

	function applyUpdate() {
		if (!waitingWorker || reloading) return;
		reloading = true;
		waitingWorker.postMessage({ type: 'SKIP_WAITING' });
	}

	function dismiss() {
		updateAvailable = false;
		try {
			sessionStorage.setItem(DISMISSED_KEY, 'true');
		} catch {
			/* sessionStorage unavailable */
		}
	}

	onMount(() => {
		if (!browser || dev || !('serviceWorker' in navigator)) return;

		let reloaded = false;
		const onControllerChange = () => {
			if (!reloading) return;
			if (reloaded) return;
			reloaded = true;
			window.location.reload();
		};
		navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

		(async () => {
			try {
				const reg = await navigator.serviceWorker.getRegistration();
				if (!reg) return;

				promoteWaiting(reg);
				trackInstalling(reg);

				reg.addEventListener('updatefound', () => {
					clearDismissal();
					trackInstalling(reg);
				});
			} catch {
				/* SW unsupported or registration unavailable — silently skip. */
			}
		})();

		return () => {
			navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
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
