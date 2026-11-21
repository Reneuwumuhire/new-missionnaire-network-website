<script lang="ts">
	import { t } from '../../i18n';
	import { selectAudio } from '$lib/stores/global';
	import { onMount } from 'svelte';

	const dismissalKey = 'pwa-install-dismissed';
	let deferredPrompt = $state<BeforeInstallPromptEvent | null>(null);
	let dismissed = false;

	interface BeforeInstallPromptEvent extends Event {
		prompt(): Promise<unknown>;
	}

	onMount(() => {
		if (window.matchMedia('(display-mode: standalone)').matches) return;
		if ((navigator as Navigator & { standalone?: boolean }).standalone) return;
		if (sessionStorage.getItem(dismissalKey)) return;

		const desktop = window.matchMedia('(min-width: 768px)');
		const controller = new AbortController();
		const { signal } = controller;
		window.addEventListener(
			'beforeinstallprompt',
			(event) => {
				if (!desktop.matches || dismissed) return;
				event.preventDefault();
				deferredPrompt = event as BeforeInstallPromptEvent;
			},
			{ signal }
		);
		window.addEventListener('appinstalled', () => (deferredPrompt = null), { signal });
		return () => controller.abort();
	});

	async function handleInstall() {
		const event = deferredPrompt;
		if (!event) return;

		try {
			const result = event.prompt();
			handleDismiss();
			await result;
		} catch {
			// The browser can invalidate a saved install event.
			deferredPrompt = null;
		}
	}

	function handleDismiss() {
		deferredPrompt = null;
		dismissed = true;
		sessionStorage.setItem(dismissalKey, 'true');
	}
</script>

{#if deferredPrompt && !$selectAudio}
	<div
		class="fixed bottom-4 left-4 z-40 hidden items-center gap-3 rounded-lg border border-stone-200 bg-cream p-2 pl-3 shadow-lg md:flex"
	>
		<img src="/icons/pwa-192x192.png" alt="" class="h-10 w-10 rounded-md" />
		<div>
			<p class="font-display text-base font-semibold leading-tight text-stone-900">
				Missionnaire Network
			</p>
			<p class="text-sm text-stone-600">{$t('install.subtitle')}</p>
		</div>
		<button
			type="button"
			onclick={handleInstall}
			class="min-h-11 rounded-md bg-missionnaire-100 px-3 text-sm font-semibold text-stone-900 hover:bg-missionnaire/30"
		>
			{$t('install.action')}
		</button>
		<button
			type="button"
			onclick={handleDismiss}
			class="flex h-11 w-11 items-center justify-center rounded-md text-stone-600 hover:bg-stone-200/60 hover:text-stone-900"
			aria-label={$t('install.close')}
		>
			<svg
				class="h-4 w-4"
				aria-hidden="true"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
	</div>
{/if}
