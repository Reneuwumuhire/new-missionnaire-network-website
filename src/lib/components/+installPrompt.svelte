<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	let deferredPrompt: BeforeInstallPromptEvent | null = null;
	let showPrompt = false;
	let dismissed = false;
	let isIOS = false;
	let showIOSInstructions = false;

	interface BeforeInstallPromptEvent extends Event {
		prompt(): Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	onMount(() => {
		if (!browser) return;

		// Don't show if already installed or previously dismissed this session
		if (window.matchMedia('(display-mode: standalone)').matches) return;
		if ((navigator as unknown as { standalone: boolean }).standalone === true) return;
		if (sessionStorage.getItem('pwa-install-dismissed')) return;

		isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);

		if (isIOS) {
			showPrompt = true;
		} else {
			window.addEventListener('beforeinstallprompt', (e) => {
				e.preventDefault();
				deferredPrompt = e as BeforeInstallPromptEvent;
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
	<!-- Backdrop -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="install-backdrop fixed inset-0 z-[9998] bg-black/20 backdrop-blur-[2px]"
		on:click={handleDismiss}
	></div>

	<!-- Prompt card -->
	<div class="install-prompt fixed bottom-6 left-4 right-4 z-[9999] mx-auto max-w-sm">
		<div class="relative bg-[#FAF8F3] border border-stone-200/60 shadow-xl shadow-stone-900/8 p-6">
			<!-- Decorative top accent line -->
			<div class="absolute top-0 left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-missionnaire to-transparent"></div>

			<!-- Close button -->
			<button
				on:click={handleDismiss}
				class="absolute top-4 right-4 w-7 h-7 flex items-center justify-center text-stone-300 hover:text-stone-500 transition-colors duration-200"
				aria-label="Fermer"
			>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>

			<!-- Content -->
			<div class="flex items-start gap-4">
				<!-- App icon -->
				<div class="flex-shrink-0 w-14 h-14 border border-stone-200/60 shadow-sm overflow-hidden">
					<img
						src="/icons/pwa-192x192.png"
						alt="Missionnaire Network"
						class="w-full h-full object-cover"
					/>
				</div>

				<div class="flex-1 min-w-0 pr-4">
					<p class="text-[9px] font-bold uppercase tracking-[0.3em] text-missionnaire font-body mb-1">
						Application
					</p>
					<h3 class="font-display text-lg font-semibold text-stone-900 leading-tight">
						Missionnaire Network
					</h3>
				</div>
			</div>

			{#if showIOSInstructions}
				<div class="mt-5 pt-5 border-t border-stone-200/40">
					<p class="text-[11px] font-semibold uppercase tracking-[0.15em] text-stone-500 font-body mb-3">
						Installation sur iPhone
					</p>
					<ol class="space-y-3">
						<li class="flex items-start gap-3">
							<span class="flex-shrink-0 w-5 h-5 bg-missionnaire/10 text-missionnaire flex items-center justify-center text-[10px] font-bold font-body mt-0.5">1</span>
							<p class="text-sm text-stone-600 font-body leading-relaxed">
								Appuyez sur
								<span class="inline-flex items-center align-middle mx-0.5">
									<svg class="w-4 h-4 text-missionnaire" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
									</svg>
								</span>
								<span class="font-semibold text-stone-800">Partager</span>
							</p>
						</li>
						<li class="flex items-start gap-3">
							<span class="flex-shrink-0 w-5 h-5 bg-missionnaire/10 text-missionnaire flex items-center justify-center text-[10px] font-bold font-body mt-0.5">2</span>
							<p class="text-sm text-stone-600 font-body leading-relaxed">
								Choisissez <span class="font-semibold text-stone-800">"Sur l'ecran d'accueil"</span>
							</p>
						</li>
						<li class="flex items-start gap-3">
							<span class="flex-shrink-0 w-5 h-5 bg-missionnaire/10 text-missionnaire flex items-center justify-center text-[10px] font-bold font-body mt-0.5">3</span>
							<p class="text-sm text-stone-600 font-body leading-relaxed">
								Appuyez sur <span class="font-semibold text-stone-800">"Ajouter"</span>
							</p>
						</li>
					</ol>

					<button
						on:click={handleDismiss}
						class="mt-5 w-full h-11 bg-missionnaire hover:bg-missionnaire-600 text-white text-xs font-bold uppercase tracking-[0.2em] font-body transition-colors duration-200"
					>
						Compris
					</button>
				</div>
			{:else}
				<p class="mt-3 text-sm text-stone-500 font-body leading-relaxed">
					Accédez rapidement aux prédications et cantiques depuis votre écran d'accueil.
				</p>

				<div class="flex items-center gap-3 mt-5 pt-5 border-t border-stone-200/40">
					<button
						on:click={handleInstall}
						class="flex-1 h-11 bg-missionnaire hover:bg-missionnaire-600 text-white text-xs font-bold uppercase tracking-[0.2em] font-body transition-colors duration-200"
					>
						Installer
					</button>
					<button
						on:click={handleDismiss}
						class="flex-1 h-11 border border-stone-200/60 text-stone-500 hover:text-stone-700 hover:border-stone-300 text-xs font-medium uppercase tracking-[0.15em] font-body transition-colors duration-200"
					>
						Plus tard
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	@keyframes install-enter {
		from {
			opacity: 0;
			transform: translateY(16px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes backdrop-enter {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.install-prompt {
		animation: install-enter 0.4s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.install-backdrop {
		animation: backdrop-enter 0.3s ease-out;
	}
</style>
