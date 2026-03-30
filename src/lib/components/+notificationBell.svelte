<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { env } from '$env/dynamic/public';

	let permission: NotificationPermission = 'default';
	export let isSubscribed = false;
	export let isSupported = false;
	let loading = false;
	let justToggled = false;

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

	export async function toggle() {
		if (loading || !isSupported) return;
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
			justToggled = true;
			setTimeout(() => (justToggled = false), 1500);
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

			// Show a sample notification so the user sees what to expect
			reg.showNotification('Notifications activees', {
				body: 'Vous recevrez une alerte quand la radio sera en direct.',
				icon: '/favicon.png',
				badge: '/favicon.png',
				tag: 'welcome-notification'
			});
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
	<span class="relative inline-flex shrink-0" class:animate-wiggle={justToggled && isSubscribed}>
		{#if loading}
			<span class="w-5 h-5 border-2 border-orange-300 border-t-orange-600 rounded-full animate-spin"></span>
		{:else if justToggled}
			{#if isSubscribed}
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-green-500 animate-pop">
					<path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clip-rule="evenodd" />
				</svg>
			{:else}
				<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 text-gray-400 animate-pop">
					<path stroke-linecap="round" stroke-linejoin="round" d="M9.143 17.082a24.248 24.248 0 005.714 0m-5.714 0a3 3 0 115.714 0M3.124 15.07A8.965 8.965 0 016 9.75V9a6 6 0 1112 0v.75a8.965 8.965 0 012.876 5.32M3.124 15.07a23.814 23.814 0 005.876 1.93m5.876-1.93a23.814 23.814 0 01-5.876 1.93m0 0a3 3 0 01-5.714 0" />
				</svg>
			{/if}
		{:else if isSubscribed}
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-orange-500">
				<path fill-rule="evenodd" d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 11-7.48 0 24.585 24.585 0 01-4.831-1.244.75.75 0 01-.298-1.205A8.217 8.217 0 005.25 9.75V9zm4.502 8.9a2.25 2.25 0 004.496 0 25.057 25.057 0 01-4.496 0z" clip-rule="evenodd" />
			</svg>
		{:else}
			<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 text-gray-400">
				<path stroke-linecap="round" stroke-linejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
			</svg>
		{/if}
	</span>
{/if}

<style>
	@keyframes pop {
		0% { transform: scale(0.5); opacity: 0; }
		50% { transform: scale(1.2); }
		100% { transform: scale(1); opacity: 1; }
	}
	@keyframes wiggle {
		0%, 100% { transform: rotate(0deg); }
		15% { transform: rotate(14deg); }
		30% { transform: rotate(-12deg); }
		45% { transform: rotate(10deg); }
		60% { transform: rotate(-8deg); }
		75% { transform: rotate(4deg); }
	}
	:global(.animate-pop) {
		animation: pop 0.35s ease-out;
	}
	:global(.animate-wiggle) {
		animation: wiggle 0.6s ease-in-out;
	}
</style>
