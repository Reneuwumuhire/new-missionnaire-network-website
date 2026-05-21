<script lang="ts">
	import { onMount } from 'svelte';
	import { mobileSearchOpen, mobileFiltersOpen } from '$lib/stores/mobileControls';

	// Optional extra classes — e.g. negative margins to break the bar out
	// of a padded container so `position: sticky` keeps a tall parent.
	let className = '';
	export { className as class };

	// Slim sticky toolbar shown above the list on /musique and
	// /predications (mobile only). It collapses the search field and the
	// secondary filters so the list is what the listener sees first.

	function toggleSearch() {
		mobileFiltersOpen.set(false);
		mobileSearchOpen.update((v) => !v);
	}

	function toggleFilters() {
		mobileSearchOpen.set(false);
		mobileFiltersOpen.update((v) => !v);
	}

	// Fresh state on every list page: the toolbar mounts once per section
	// layout, so resetting here collapses both panels whenever the
	// listener arrives on a new list page.
	onMount(() => {
		mobileSearchOpen.set(false);
		mobileFiltersOpen.set(false);
	});
</script>

<div class="mobile-toolbar {className}">
	<button
		type="button"
		class="mobile-toolbar__btn"
		class:is-active={$mobileSearchOpen}
		aria-expanded={$mobileSearchOpen}
		on:click={toggleSearch}
	>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<circle cx="11" cy="11" r="7" />
			<line x1="21" y1="21" x2="16.65" y2="16.65" />
		</svg>
		<span>Rechercher</span>
	</button>
	<button
		type="button"
		class="mobile-toolbar__btn"
		class:is-active={$mobileFiltersOpen}
		aria-expanded={$mobileFiltersOpen}
		on:click={toggleFilters}
	>
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<line x1="4" y1="6" x2="20" y2="6" />
			<line x1="7" y1="12" x2="17" y2="12" />
			<line x1="10" y1="18" x2="14" y2="18" />
		</svg>
		<span>Filtres</span>
	</button>
</div>

<style>
	.mobile-toolbar {
		position: sticky;
		/* Stick just below the fixed site header — its measured height is
		   published as `--header-height` by the root layout. */
		top: var(--header-height, 112px);
		z-index: 30;
		display: flex;
		align-items: stretch;
		background: rgba(250, 248, 243, 0.97); /* cream */
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border-top: 1px solid #e7e5e4; /* stone-200 */
		border-bottom: 1px solid #e7e5e4;
	}

	/* Mobile only — desktop keeps the full hero search + filter layout.
	   Done in scoped CSS (not Tailwind `md:hidden`) because the scoped
	   `.mobile-toolbar` rule would otherwise out-specify the utility. */
	@media (min-width: 768px) {
		.mobile-toolbar {
			display: none;
		}
	}

	.mobile-toolbar__btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 11px 12px;
		font-family: var(--font-body, system-ui, sans-serif);
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: #78716c; /* stone-500 */
		background: none;
		border: 0;
		cursor: pointer;
		transition: color 0.15s ease, background-color 0.15s ease;
		-webkit-tap-highlight-color: transparent;
	}

	.mobile-toolbar__btn:first-child {
		border-right: 1px solid #e7e5e4;
	}

	.mobile-toolbar__btn.is-active {
		color: #ff880c; /* missionnaire */
		background: rgba(255, 136, 12, 0.07);
	}

	.mobile-toolbar__btn svg {
		width: 15px;
		height: 15px;
		flex-shrink: 0;
	}
</style>
