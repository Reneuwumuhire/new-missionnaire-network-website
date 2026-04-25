<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	let isOffline = false;
	let justReconnected = false;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	onMount(() => {
		if (!browser) return;
		isOffline = !navigator.onLine;

		const goOffline = () => {
			isOffline = true;
			justReconnected = false;
			if (reconnectTimer) clearTimeout(reconnectTimer);
		};
		const goOnline = () => {
			if (isOffline) {
				justReconnected = true;
				if (reconnectTimer) clearTimeout(reconnectTimer);
				reconnectTimer = setTimeout(() => { justReconnected = false; }, 2400);
			}
			isOffline = false;
		};

		window.addEventListener('offline', goOffline);
		window.addEventListener('online', goOnline);

		return () => {
			window.removeEventListener('offline', goOffline);
			window.removeEventListener('online', goOnline);
			if (reconnectTimer) clearTimeout(reconnectTimer);
		};
	});
</script>

{#if isOffline}
	<div class="offline-pill" role="status" aria-live="polite">
		<span class="offline-pill__dot" aria-hidden="true"></span>
		<span class="offline-pill__text">Hors ligne — contenu en cache disponible</span>
	</div>
{:else if justReconnected}
	<div class="offline-pill offline-pill--online" role="status" aria-live="polite">
		<span class="offline-pill__dot offline-pill__dot--online" aria-hidden="true"></span>
		<span class="offline-pill__text">Connexion rétablie</span>
	</div>
{/if}

<style>
	.offline-pill {
		position: fixed;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 9998;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 8px 16px;
		background: rgba(28, 25, 23, 0.92);
		color: #f5f5f4;
		border-radius: 999px;
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0.01em;
		box-shadow: 0 12px 32px -16px rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		max-width: calc(100vw - 24px);
		animation: offline-pill-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) both;
	}
	.offline-pill--online {
		background: rgba(22, 101, 52, 0.92);
	}
	.offline-pill__dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #f97316;
		animation: offline-pill-pulse 1.4s ease-in-out infinite;
	}
	.offline-pill__dot--online {
		background: #4ade80;
		animation: none;
	}
	.offline-pill__text {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	@keyframes offline-pill-in {
		from { opacity: 0; transform: translate(-50%, -8px); }
		to   { opacity: 1; transform: translate(-50%, 0); }
	}
	@keyframes offline-pill-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}
	@media (prefers-reduced-motion: reduce) {
		.offline-pill,
		.offline-pill__dot {
			animation: none;
		}
	}
</style>
