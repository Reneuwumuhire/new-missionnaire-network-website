<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	let deferredPrompt: any = null;
	let showPrompt = false;
	let dismissed = false;
	let isIOS = false;
	let showIOSInstructions = false;

	onMount(() => {
		if (!browser) return;

		// Don't show if already installed or previously dismissed this session
		if (window.matchMedia('(display-mode: standalone)').matches) return;
		if ((navigator as any).standalone === true) return; // iOS standalone check
		if (sessionStorage.getItem('pwa-install-dismissed')) return;

		isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

		if (isIOS) {
			// iOS doesn't support beforeinstallprompt — show manual instructions
			showPrompt = true;
		} else {
			window.addEventListener('beforeinstallprompt', (e) => {
				e.preventDefault();
				deferredPrompt = e;
				showPrompt = true;
			});
		}

		window.addEventListener('appinstalled', () => {
			showPrompt = false;
			deferredPrompt = null;
		});
	});

	async function handleInstall() {
		if (isIOS) {
			showIOSInstructions = true;
			return;
		}
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
		showIOSInstructions = false;
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

				{#if showIOSInstructions}
					<div class="mt-2 space-y-2">
						<p class="text-xs text-gray-600 leading-relaxed">
							Pour installer l'application sur votre iPhone :
						</p>
						<ol class="text-xs text-gray-600 leading-relaxed space-y-1 list-decimal pl-4">
							<li>
								Appuyez sur le bouton
								<span class="inline-flex items-center align-middle">
									<svg class="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
									</svg>
								</span>
								<span class="font-semibold">Partager</span> en bas de Safari
							</li>
							<li>
								Faites defiler et appuyez sur
								<span class="font-semibold">"Sur l'ecran d'accueil"</span>
							</li>
							<li>
								Appuyez sur <span class="font-semibold">"Ajouter"</span>
							</li>
						</ol>
					</div>
					<div class="flex gap-2 mt-3">
						<button
							on:click={handleDismiss}
							class="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors"
						>
							Compris
						</button>
					</div>
				{:else}
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
				{/if}
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
