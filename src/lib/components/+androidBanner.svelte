<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { t } from '../../i18n';
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import FaBrandsAndroid from 'svelte-icons-pack/fa/FaBrandsAndroid';
	import IoClose from 'svelte-icons-pack/io/IoClose';

	interface Props {
		downloadUrl?: string;
	}

	let { downloadUrl = 'https://mega.nz/folder/VdJDxAxK#_hnoT20MlxFsaR2jgQcRXA' }: Props = $props();

	let isVisible = $state(false);
	const STORAGE_KEY = 'hide_android_banner';

	onMount(() => {
		if (browser) {
			const isHidden = localStorage.getItem(STORAGE_KEY);
			if (!isHidden) {
				isVisible = true;
			}
		}
	});

	function dismiss() {
		isVisible = false;
		if (browser) {
			localStorage.setItem(STORAGE_KEY, 'true');
		}
	}
</script>

<!-- Slim, quiet, dismissible single-row strip — reads as a helpful note,
     not an ad. Icon + one sentence + small text-link + close. -->
{#if isVisible}
	<div
		class="mx-auto flex w-full max-w-3xl items-center gap-3 border border-stone-200 bg-white/60 px-3 py-2.5 transition-colors duration-150 hover:border-stone-300 md:px-4"
	>
		<span class="flex h-7 w-7 shrink-0 items-center justify-center text-missionnaire" aria-hidden="true">
			<Icon src={FaBrandsAndroid} size="17" />
		</span>

		<p class="min-w-0 flex-1 truncate font-body text-xs text-stone-600 md:text-[13px]">
			<span class="font-semibold text-stone-800">{$t('androidBanner.title')}</span>
			<span class="text-stone-300" aria-hidden="true">—</span>
			<span class="hidden sm:inline">{$t('androidBanner.tagline')}</span>
			<span class="sm:hidden">{$t('androidBanner.taglineShort')}</span>
		</p>

		<a
			href={downloadUrl}
			target="_blank"
			rel="noopener noreferrer"
			class="shrink-0 font-body text-[10px] font-bold uppercase tracking-[0.16em] text-missionnaire underline-offset-4 transition-colors duration-150 hover:text-missionnaire/80 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40"
		>
			{$t('androidBanner.download')}
		</a>

		<button
			onclick={dismiss}
			class="flex h-7 w-7 shrink-0 items-center justify-center text-stone-400 transition-colors duration-150 hover:text-stone-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-missionnaire/40"
			aria-label={$t('androidBanner.close')}
		>
			<Icon src={IoClose} size="15" />
		</button>
	</div>
{/if}
