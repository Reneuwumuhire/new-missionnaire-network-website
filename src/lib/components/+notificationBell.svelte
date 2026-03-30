<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';

	let permission: NotificationPermission = 'default';
	let isSubscribed = false;
	let isSupported = false;
	let loading = false;

	onMount(async () => {
		isSupported =
			browser && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

		if (!isSupported) return;

		permission = Notification.permission;

		if (permission === 'granted') {
			const reg = await navigator.serviceWorker.ready;
			const sub = await reg.pushManager.getSubscription();
			isSubscribed = !!sub;
		}
	});

	async function toggleSubscription() {
		if (loading) return;
		loading = true;

		try {
			if (isSubscribed) {
				await unsubscribe();
			} else {
				await subscribe();
			}
		} catch (e) {
			console.error('[NotificationBell] Error:', e);
		} finally {
			loading = false;
		}
	}

	async function subscribe() {
		const perm = await Notification.requestPermission();
		permission = perm;

		if (perm !== 'granted') return;

		const reg = await navigator.serviceWorker.ready;
		const vapidKey = env.PUBLIC_VAPID_KEY;

		if (!vapidKey) {
			console.error('[NotificationBell] PUBLIC_VAPID_KEY not set');
			return;
		}

		const sub = await reg.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: urlBase64ToUint8Array(vapidKey)
		});

		const response = await fetch('/api/notifications/subscribe', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(sub.toJSON())
		});

		if (response.ok) {
			isSubscribed = true;
		}
	}

	async function unsubscribe() {
		const reg = await navigator.serviceWorker.ready;
		const sub = await reg.pushManager.getSubscription();

		if (sub) {
			await fetch('/api/notifications/subscribe', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ endpoint: sub.endpoint })
			});

			await sub.unsubscribe();
		}

		isSubscribed = false;
	}

	function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
		const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
		const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
		const rawData = atob(base64);
		const outputArray = new Uint8Array(rawData.length);
		for (let i = 0; i < rawData.length; ++i) {
			outputArray[i] = rawData.charCodeAt(i);
		}
		return outputArray.buffer as ArrayBuffer;
	}
</script>

{#if isSupported && permission !== 'denied'}
	<button
		on:click={toggleSubscription}
		class="relative w-8 h-8 rounded-full border border-[#ccc] bg-white flex items-center justify-center hover:border-orange-300 transition-colors shrink-0"
		class:opacity-50={loading}
		disabled={loading}
		aria-label={isSubscribed ? 'Desactiver les notifications' : 'Activer les notifications'}
		title={isSubscribed ? 'Notifications activees' : 'Activer les notifications'}
	>
		{#if isSubscribed}
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4 text-orange-500">
				<path fill-rule="evenodd" d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 11-7.48 0 24.585 24.585 0 01-4.831-1.244.75.75 0 01-.298-1.205A8.217 8.217 0 005.25 9.75V9zm4.502 8.9a2.25 2.25 0 004.496 0 25.057 25.057 0 01-4.496 0z" clip-rule="evenodd" />
			</svg>
			<span class="absolute -top-0.5 -right-0.5 w-2 h-2 bg-orange-500 rounded-full border border-white"></span>
		{:else}
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 text-[#ccc]">
				<path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
			</svg>
		{/if}
	</button>
{/if}
