<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '../../i18n';
	import HymnAppStoreLinks from './HymnAppStoreLinks.svelte';
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import IoClose from 'svelte-icons-pack/io/IoClose';

	let isVisible = $state(false);
	const STORAGE_KEY = 'hide_app_banner';

	onMount(() => {
		try {
			isVisible = !localStorage.getItem(STORAGE_KEY);
		} catch {
			isVisible = true;
		}
	});

	function dismiss() {
		isVisible = false;
		try {
			localStorage.setItem(STORAGE_KEY, 'true');
		} catch {
			// Keep dismissal working when browser storage is unavailable.
		}
	}
</script>

{#if isVisible}
	<aside
		aria-labelledby="hymn-app-name"
		class="relative mb-4 flex flex-col gap-3 border border-stone-200 border-l-[3px] border-l-missionnaire bg-missionnaire-50 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:py-2.5 sm:pl-4 sm:pr-14"
	>
		<div>
			<p
				id="hymn-app-name"
				class="pr-8 font-display text-[22px] font-semibold leading-none text-stone-900 sm:pr-0 sm:text-2xl"
			>
				Indirimbo Zikundwa
			</p>
			<p class="mt-1 font-body text-sm leading-snug text-stone-700">{$t('appBanner.tagline')}</p>
		</div>

		<HymnAppStoreLinks />

		<button
			type="button"
			onclick={dismiss}
			class="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded text-stone-600 hover:bg-stone-200/60 hover:text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stone-900 sm:top-1/2 sm:-translate-y-1/2"
			aria-label={$t('appBanner.close')}
		>
			<span aria-hidden="true"><Icon src={IoClose} size="18" /></span>
		</button>
	</aside>
{/if}
