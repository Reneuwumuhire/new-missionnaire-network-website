<script lang="ts">
	import { portal } from '$lib/actions/portal';
	import { focusTrap } from '$lib/actions/focusTrap';
	import { locale, setLocale, t, type Locale } from '../../i18n';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsChatDots from 'svelte-icons-pack/bs/BsChatDots';
	import BsImages from 'svelte-icons-pack/bs/BsImages';
	import BsFileEarmarkText from 'svelte-icons-pack/bs/BsFileEarmarkText';
	import BsBook from 'svelte-icons-pack/bs/BsBook';
	import BsHouseDoor from 'svelte-icons-pack/bs/BsHouseDoor';
	import BsInfoCircle from 'svelte-icons-pack/bs/BsInfoCircle';
	import BsCameraVideo from 'svelte-icons-pack/bs/BsCameraVideo';
	import BsPeople from 'svelte-icons-pack/bs/BsPeople';

	interface Props {
		open: boolean;
		onclose: () => void;
	}

	let { open, onclose }: Props = $props();

	// Sections NOT covered by the four bottom-nav tabs — one tap from the
	// Menu tab instead of being buried in the hamburger menu.
	const sections = $derived([
		{ label: $t('nav.questions'), href: '/questions', icon: BsChatDots },
		{ label: $t('nav.videos'), href: '/videos', icon: BsCameraVideo },
		{ label: $t('nav.galerie'), href: '/galerie', icon: BsImages },
		{ label: $t('nav.documents'), href: '/documents', icon: BsFileEarmarkText },
		{ label: $t('nav.literature'), href: '/literature', icon: BsBook },
		{ label: $t('nav.eglise'), href: '/eglise', icon: BsHouseDoor },
		{ label: $t('nav.williamBranham'), href: '/william-branham/biographie', icon: BsPeople },
		{ label: $t('nav.aPropos'), href: '/a-propos', icon: BsInfoCircle }
	]);

	const switchLanguage = (next: Locale) => {
		if (next !== $locale) setLocale(next);
	};

	function onBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) onclose();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="more-sheet-backdrop" use:portal onclick={onBackdropClick}>
		<div
			class="more-sheet"
			role="dialog"
			aria-modal="true"
			aria-label={$t('nav.menu')}
			use:focusTrap={{ onEscape: onclose }}
		>
			<div class="flex items-center justify-between px-5 pt-4 pb-2">
				<p class="text-[10px] font-bold uppercase tracking-[0.3em] text-stone-400 font-body">
					{$t('nav.menu')}
				</p>
				<button
					type="button"
					class="flex h-11 w-11 items-center justify-center text-stone-400 hover:text-stone-700 transition-colors"
					aria-label={$t('nav.closeMenu')}
					onclick={onclose}
				>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					>
						<path d="M6 6l12 12M6 18L18 6" />
					</svg>
				</button>
			</div>

			<div class="grid grid-cols-2 gap-2 px-5 pb-4">
				{#each sections as section}
					<a
						href={section.href}
						class="flex items-center gap-3 border border-stone-200/60 bg-white/60 px-4 py-3.5 min-h-11 text-stone-700 hover:border-missionnaire/40 hover:text-missionnaire transition-colors"
						onclick={onclose}
					>
						<Icon src={section.icon} color="currentColor" className="w-4.5 h-4.5 shrink-0" />
						<span class="text-[13px] font-semibold font-body truncate">{section.label}</span>
					</a>
				{/each}
			</div>

			<div class="border-t border-stone-100 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
				<div class="flex items-center justify-between">
					<p class="text-[10px] uppercase tracking-[0.3em] text-stone-400 font-body">
						{$t('lang.label')}
					</p>
					<div
						class="flex items-center border border-stone-200/60 rounded-full p-0.5"
						role="group"
						aria-label={$t('lang.label')}
					>
						<button
							type="button"
							class="px-3.5 py-2 min-h-11 text-[11px] font-bold uppercase tracking-wider rounded-full font-body transition-colors {$locale ===
							'fr'
								? 'bg-stone-900 text-white'
								: 'text-stone-400'}"
							aria-pressed={$locale === 'fr'}
							onclick={() => switchLanguage('fr')}
						>
							FR
						</button>
						<button
							type="button"
							class="px-3.5 py-2 min-h-11 text-[11px] font-bold uppercase tracking-wider rounded-full font-body transition-colors {$locale ===
							'en'
								? 'bg-stone-900 text-white'
								: 'text-stone-400'}"
							aria-pressed={$locale === 'en'}
							onclick={() => switchLanguage('en')}
						>
							EN
						</button>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.more-sheet-backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: rgba(28, 25, 23, 0.45);
		backdrop-filter: blur(2px);
		-webkit-backdrop-filter: blur(2px);
		display: flex;
		align-items: flex-end;
		animation: more-sheet-fade 0.18s ease-out;
	}

	.more-sheet {
		width: 100%;
		background: #faf8f3;
		border-top: 1px solid #e7e5e4;
		border-radius: 16px 16px 0 0;
		box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.15);
		animation: more-sheet-slide 0.22s cubic-bezier(0.16, 1, 0.3, 1);
	}

	@keyframes more-sheet-fade {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes more-sheet-slide {
		from {
			transform: translateY(24px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.more-sheet-backdrop,
		.more-sheet {
			animation: none;
		}
	}
</style>
