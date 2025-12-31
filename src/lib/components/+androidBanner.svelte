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
	<div class="pointer-events-auto relative overflow-hidden rounded-2xl border border-white/20 bg-white/70 backdrop-blur-xl shadow-[0_8px_32px_0_rgba(31,38,135,0.07)] transition-all hover:shadow-[0_8px_32px_0_rgba(31,38,135,0.15)] flex items-center justify-between px-4 py-3 md:px-6 md:py-4 gap-4">
		<!-- Left side - Branding & Content -->
		<div class="flex items-center gap-3 md:gap-5 flex-1 min-w-0">
			<div class="hidden sm:flex bg-orange-500/10 p-2 rounded-xl shrink-0">
				<Icon src={FaBrandsAndroid} size="22" color="#f97316" />
			</div>
			
			<div class="flex flex-col min-w-0">
				<div class="flex items-center gap-2">
					<span class="sm:hidden flex bg-orange-500/10 p-1 rounded-md">
						<Icon src={FaBrandsAndroid} size="14" color="#f97316" />
					</span>
					<h3 class="text-sm md:text-base font-black text-gray-900 leading-tight truncate">
						Application Android
					</h3>
				</div>
				<p class="text-gray-500 text-[11px] md:text-[12px] font-medium leading-tight mt-0.5 max-w-md truncate md:whitespace-normal">
					Retrouvez plus de <span class="text-orange-600 font-bold">1500 cantiques</span> sur votre téléphone.
				</p>
			</div>
		</div>

		<!-- Action & Close -->
		<div class="flex items-center gap-2 md:gap-4 shrink-0">
			<a 
				href={downloadUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 md:px-5 md:py-2.5 rounded-xl font-bold transition-all shadow-sm hover:shadow-md flex items-center gap-2 text-[10px] md:text-[11px] tracking-wide uppercase whitespace-nowrap"
			>
				<Icon src={IoCloudDownloadOutline} size="14" />
				<span class="hidden xs:inline">Télécharger</span>
				<span class="xs:hidden">Installer</span>
			</a>

			<button 
				on:click={dismiss}
				class="p-1 md:p-1.5 rounded-lg hover:bg-gray-200/50 text-gray-500 hover:text-gray-900 transition-colors"
				aria-label="Dismiss banner"
			>
				<Icon src={IoClose} size="20" />
			</button>
		</div>

		<!-- Glassy Shine Effect -->
		<div class="absolute -inset-full h-full w-1/2 z-[-1] block transform -skew-x-12 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-40 animate-[shine_5s_infinite]"></div>
	</div>
</div>
{/if}

<style>
	@keyframes shine {
		0% { transform: translateX(-100%) skewX(-12deg); }
		100% { transform: translateX(300%) skewX(-12deg); }
	}

	/* Custom breakpoints for the banner */
	@media (max-width: 400px) {
		.xs\:hidden { display: inline; }
		.xs\:inline { display: none; }
	}
	@media (min-width: 401px) {
		.xs\:hidden { display: none; }
		.xs\:inline { display: inline; }
	}
</style>
