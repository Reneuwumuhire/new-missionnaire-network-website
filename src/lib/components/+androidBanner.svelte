<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import FaBrandsAndroid from 'svelte-icons-pack/fa/FaBrandsAndroid';
	import IoCloudDownloadOutline from 'svelte-icons-pack/io/IoCloudDownloadOutline';
	import IoClose from 'svelte-icons-pack/io/IoClose';

	export let downloadUrl = "https://mega.nz/folder/VdJDxAxK#_hnoT20MlxFsaR2jgQcRXA";
	
	let isVisible = false;
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

{#if isVisible}
	<div class="w-full max-w-3xl mx-auto px-4 pointer-events-none">
		<div class="pointer-events-auto relative isolate overflow-hidden border border-stone-200/70 bg-[#faf6ef] shadow-[0_20px_52px_-30px_rgba(41,37,36,0.3)] transition-all hover:-translate-y-0.5 hover:shadow-[0_26px_64px_-32px_rgba(41,37,36,0.36)]">
			<div class="absolute inset-0 bg-[linear-gradient(135deg,#ffffff,#faf6ef)]"></div>
			<div class="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-missionnaire/10 via-missionnaire/4 to-transparent"></div>
			<div class="absolute -left-10 top-1/2 h-24 w-24 -translate-y-1/2 rounded-full bg-missionnaire/10 blur-3xl"></div>
			<div class="absolute left-6 right-6 top-0 h-px bg-gradient-to-r from-transparent via-missionnaire/60 to-transparent"></div>

			<button
				on:click={dismiss}
				class="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center border border-stone-200/70 bg-white/70 text-stone-400 transition-colors hover:border-stone-300 hover:text-stone-700 sm:hidden"
				aria-label="Fermer la bannière Android"
			>
				<Icon src={IoClose} size="14" />
			</button>

			<div class="relative z-10 flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 md:px-6">
				<div class="flex min-w-0 items-center gap-3.5 pr-10 sm:pr-0">
					<div class="flex h-11 w-11 shrink-0 items-center justify-center border border-missionnaire/15 bg-white/80 shadow-sm shadow-missionnaire/5">
						<Icon src={FaBrandsAndroid} size="20" color="#FF880C" />
					</div>

					<div class="min-w-0 flex-1">
						<p class="mb-1 text-[9px] font-bold uppercase tracking-[0.35em] text-missionnaire font-body">
							Cantiques &amp; louange
						</p>
						<h3 class="font-display text-lg font-semibold leading-none text-stone-900 md:text-[1.55rem]">
							Application Android
						</h3>
						<p class="mt-1 text-[11px] leading-relaxed text-stone-500 font-body md:max-w-[26rem] md:text-[12px]">
							Retrouvez plus de <span class="font-semibold text-missionnaire">1 500 cantiques</span> sur votre téléphone.
						</p>
					</div>
				</div>

				<div class="flex shrink-0 items-center gap-2.5">
					<a
						href={downloadUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex h-10 flex-1 items-center justify-center gap-2 border border-missionnaire bg-missionnaire px-4 text-[10px] font-bold uppercase tracking-[0.16em] text-white font-body transition-colors hover:bg-missionnaire/90 sm:flex-none md:px-5"
					>
						<Icon src={IoCloudDownloadOutline} size="14" />
						<span>Télécharger</span>
					</a>

					<button
						on:click={dismiss}
						class="hidden h-10 w-10 items-center justify-center border border-stone-200/70 bg-white/70 text-stone-400 transition-colors hover:border-stone-300 hover:text-stone-700 sm:flex"
						aria-label="Fermer la bannière Android"
					>
						<Icon src={IoClose} size="16" />
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	@media (max-width: 640px) {
		a[href] {
			letter-spacing: 0.14em;
		}
	}
</style>
