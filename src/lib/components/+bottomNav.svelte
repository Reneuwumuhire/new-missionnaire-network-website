<script lang="ts">
	import { page } from '$app/stores';
	import { radioIsLive } from '$lib/stores/global';
	import { t, type TranslationKey } from '../../i18n';
	import { portal } from '$lib/actions/portal';
	import MoreSheet from '$lib/components/MoreSheet.svelte';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsMic from 'svelte-icons-pack/bs/BsMic';
	import BsMicFill from 'svelte-icons-pack/bs/BsMicFill';
	import BsPlayCircle from 'svelte-icons-pack/bs/BsPlayCircle';
	import BsPlayCircleFill from 'svelte-icons-pack/bs/BsPlayCircleFill';
	import RiMediaLiveLine from 'svelte-icons-pack/ri/RiMediaLiveLine';
	import RiMediaLiveFill from 'svelte-icons-pack/ri/RiMediaLiveFill';
	import BsFileEarmarkPdf from 'svelte-icons-pack/bs/BsFileEarmarkPdf';
	import BsFileEarmarkPdfFill from 'svelte-icons-pack/bs/BsFileEarmarkPdfFill';
	import CgMoreVerticalAlt from 'svelte-icons-pack/cg/CgMoreVerticalAlt';

	// Bottom navigation — mobile/tablet only (desktop has the full header
	// nav). Surfaces the most-visited sections plus a "more" button that
	// opens the full hamburger menu, so listeners can jump anywhere in
	// one tap. Each tab swaps to its filled icon + turns orange when its
	// route is active.
	const items: {
		label: TranslationKey;
		href: string;
		match: string[];
		iconInactive: unknown;
		iconActive: unknown;
	}[] = [
		{
			label: 'nav.predications',
			href: '/predications',
			match: ['/predications'],
			iconInactive: BsMic,
			iconActive: BsMicFill
		},
		{
			label: 'nav.musique',
			href: '/musique',
			match: ['/musique'],
			iconInactive: BsPlayCircle,
			iconActive: BsPlayCircleFill
		},
		{
			label: 'nav.direct',
			href: '/live',
			match: ['/live'],
			iconInactive: RiMediaLiveLine,
			iconActive: RiMediaLiveFill
		},
		{
			label: 'nav.transcriptions',
			href: '/transcriptions',
			match: ['/transcriptions'],
			iconInactive: BsFileEarmarkPdf,
			iconActive: BsFileEarmarkPdfFill
		}
	];

	// Which tab matches the current route. `pathname` is referenced
	// directly inside this reactive statement so Svelte re-runs it on
	// every navigation (client-side included) — computing the match
	// inside a plain helper hides `pathname` from the dependency
	// tracker and leaves the highlight stuck on first paint.
	let pathname = $derived($page.url.pathname);
	let activeHref =
		$derived(items.find((item) =>
			item.match.some((base) => pathname === base || pathname.startsWith(`${base}/`))
		)?.href ?? null);

	// "Menu" opens a bottom sheet with the sections the four tabs don't
	// cover (Questions, Documents…) — one tap to reach anything,
	// instead of routing through the header hamburger menu.
	let moreSheetOpen = $state(false);
</script>

<!-- `use:portal` re-parents the bar to <body> so it can never land
     inside an ancestor with `transform`/`will-change`/`filter` — any of
     those would make that ancestor the containing block and the bar
     would scroll with the page instead of staying pinned to the
     viewport. -->
<nav class="bottom-nav" aria-label={$t('nav.quickNav')} use:portal>
	{#each items as item}
		<a
			href={item.href}
			class="bottom-nav__item"
			class:is-active={item.href === activeHref}
			aria-current={item.href === activeHref ? 'page' : undefined}
		>
			<span class="bottom-nav__icon">
				<!-- `color="currentColor"` is required: these Bootstrap/Remix
				     glyphs need an explicit fill to inherit the tab colour. -->
				<Icon
					src={item.href === activeHref ? item.iconActive : item.iconInactive}
					color="currentColor"
					className="bottom-nav__glyph"
				/>
				{#if item.href === '/live' && $radioIsLive}
					<span class="bottom-nav__live" aria-hidden="true"></span>
				{/if}
			</span>
			<span class="bottom-nav__label">{$t(item.label)}</span>
		</a>
	{/each}

	<!-- "More" — opens the sections sheet. -->
	<button
		type="button"
		class="bottom-nav__item"
		aria-label={$t('nav.openMenu')}
		aria-expanded={moreSheetOpen}
		onclick={() => (moreSheetOpen = !moreSheetOpen)}
	>
		<span class="bottom-nav__icon">
			<Icon src={CgMoreVerticalAlt} color="currentColor" className="bottom-nav__glyph" />
		</span>
		<span class="bottom-nav__label">{$t('nav.menu')}</span>
	</button>
</nav>

<MoreSheet open={moreSheetOpen} onclose={() => (moreSheetOpen = false)} />

<style>
	.bottom-nav {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 40;
		display: flex;
		align-items: stretch;
		justify-content: space-around;
		/* Single source of truth: the same var the layout uses to reserve
		   space below page content + the audio player, so the bar height
		   and the reserved gap can never drift apart. Fallback mirrors it
		   in case the var isn't defined. */
		height: var(--bottom-nav-height, calc(5rem + env(safe-area-inset-bottom, 0px)));
		padding-bottom: env(safe-area-inset-bottom, 0px);
		/* Breathing room from the screen edges so the first/last labels
		   ("Prédications", "Menu") stay clear of rounded phone corners. */
		padding-left: max(8px, env(safe-area-inset-left, 0px));
		padding-right: max(8px, env(safe-area-inset-right, 0px));
		background: rgba(255, 255, 255, 0.97);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-top: 1px solid #e7e5e4; /* stone-200 */
		box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.05);
	}

	/* Desktop uses the full header nav — hide the bottom bar there.
	   Handled in scoped CSS (not Tailwind `lg:hidden`) because the
	   scoped `.bottom-nav` rule would otherwise out-specify the
	   utility's `display:none`. */
	@media (min-width: 1024px) {
		.bottom-nav {
			display: none;
		}
	}

	.bottom-nav__item {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		min-width: 0;
		padding: 0 1px;
		color: #a8a29e; /* stone-400 — inactive */
		text-decoration: none;
		transition: color 0.18s ease;
		-webkit-tap-highlight-color: transparent;
		/* reset so the <button> matches the <a> tabs */
		appearance: none;
		background: none;
		border: 0;
		font: inherit;
		cursor: pointer;
	}

	/* Active tab: just a colour change — icon (filled variant) and label
	   both turn missionnaire orange. No background pill. */
	.bottom-nav__item.is-active {
		color: #ff880c; /* missionnaire */
	}

	.bottom-nav__icon {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	:global(.bottom-nav__glyph) {
		width: 22px;
		height: 22px;
	}

	.bottom-nav__label {
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0;
		line-height: 1;
		white-space: nowrap;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Pulsing live dot on the Direct tab — driven by the shared
	   `radioIsLive` store, so it lights up the instant a broadcast
	   starts, mirroring the live banner. */
	.bottom-nav__live {
		position: absolute;
		top: -3px;
		right: -4px;
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: #ef4444; /* red-500 */
		box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.97);
	}

	.bottom-nav__live::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 999px;
		background: #ef4444;
		animation: bottom-nav-live-pulse 1.8s ease-out infinite;
	}

	@keyframes bottom-nav-live-pulse {
		0% {
			transform: scale(1);
			opacity: 0.65;
		}
		100% {
			transform: scale(2.6);
			opacity: 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bottom-nav__live::after {
			animation: none;
		}
		.bottom-nav__item {
			transition: none;
		}
	}
</style>
