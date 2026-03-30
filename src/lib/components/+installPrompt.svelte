<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	let deferredPrompt: any = null;
	let showPrompt = false;
	let dismissed = false;

	onMount(() => {
		if (!browser) return;

		// Don't show if already installed or previously dismissed this session
		if (window.matchMedia('(display-mode: standalone)').matches) return;
		if (sessionStorage.getItem('pwa-install-dismissed')) return;

		window.addEventListener('beforeinstallprompt', (e) => {
			e.preventDefault();
			deferredPrompt = e;
			showPrompt = true;
		});

		window.addEventListener('appinstalled', () => {
			showPrompt = false;
			deferredPrompt = null;
		});
	});

	async function handleInstall() {
		if (!deferredPrompt) return;
		deferredPrompt.prompt();
		const { outcome } = await deferredPrompt.userChoice;
		if (outcome === 'accepted') {
			showPrompt = false;
		}
		deferredPrompt = null;
	}

	function handleDismiss() {
		showPrompt = false;
		dismissed = true;
		sessionStorage.setItem('pwa-install-dismissed', 'true');
	}
</script>

{#if showPrompt && !dismissed}
	<div class="fixed bottom-4 left-4 right-4 z-[9999] mx-auto max-w-md animate-slide-up">
		<div class="bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 flex items-start gap-4">
			<img
				src="/icons/pwa-192x192.png"
				alt="Missionnaire Network"
				class="w-12 h-12 rounded-xl flex-shrink-0"
			/>
			<div class="flex-1 min-w-0">
				<h3 class="font-bold text-gray-900 text-sm">Installer Missionnaire Network</h3>
				<p class="text-xs text-gray-500 mt-0.5 leading-relaxed">
					Accedez rapidement aux predications et cantiques depuis votre ecran d'accueil.
				</p>
				<div class="flex gap-2 mt-3">
					<button
						on:click={handleInstall}
						class="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors"
					>
						Installer
					</button>
					<button
						on:click={handleDismiss}
						class="px-4 py-2 text-gray-500 hover:text-gray-700 text-xs font-medium rounded-lg transition-colors"
					>
						Plus tard
					</button>
				</div>
			</div>
			<button
				on:click={handleDismiss}
				class="text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0"
				aria-label="Fermer"
			>
				<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>
	</div>
{/if}

<style>
	@keyframes slide-up {
		from {
			opacity: 0;
			transform: translateY(1rem);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.animate-slide-up {
		animation: slide-up 0.3s ease-out;
	}
</style>
