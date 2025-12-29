<script lang="ts">
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import FaBrandsAndroid from 'svelte-icons-pack/fa/FaBrandsAndroid';
	import IoCloudDownloadOutline from 'svelte-icons-pack/io/IoCloudDownloadOutline';

	export let downloadUrl = "https://mega.nz/folder/VdJDxAxK#_hnoT20MlxFsaR2jgQcRXA";
</script>

<div class="w-full max-w-2xl bg-white rounded-2xl shadow-[0_15px_50px_-12px_rgba(0,0,0,0.12)] border border-gray-100 overflow-hidden transform transition-all hover:scale-[1.01]">
	<div class="flex flex-col md:flex-row items-center px-6 py-4 md:py-5 gap-6 md:gap-8">
		<!-- Left side - Branding -->
		<div class="flex items-center gap-4 min-w-fit">
			<div class="bg-gray-50 p-2 rounded-xl">
				<Icon src={FaBrandsAndroid} size="28" color="#333" />
			</div>
			<div class="flex flex-col text-left">
				<span class="text-[8px] text-gray-400 font-bold uppercase tracking-[0.15em] leading-tight">Téléphone / Tablette</span>
				<h3 class="text-lg font-black text-gray-900 leading-none">Android</h3>
			</div>
		</div>

		<!-- Vertical Divider (Desktop) -->
		<div class="hidden md:block w-px h-6 bg-gray-100"></div>

		<!-- Right side - Content -->
		<div class="flex-1 flex flex-col items-center md:items-start gap-4 md:gap-4 text-center md:text-left">
			<p class="text-gray-500 text-[12px] md:text-[13px] font-medium leading-tight max-w-sm">
				Installez l'application <span class="text-gray-900 font-bold">"Indirimbo Zikundwa Apk"</span> pour retrouver tous les recueils avec plus de <span class="text-orange-500 font-bold">1500 cantiques</span>.
			</p>
			
			<a 
				href={downloadUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2.5 rounded-lg font-bold transition-all shadow-sm hover:shadow-md flex items-center gap-3 text-[11px] tracking-wide uppercase whitespace-nowrap w-fit"
			>
				<Icon src={IoCloudDownloadOutline} size="14" />
				Télécharger l'application
			</a>
		</div>
	</div>
</div>

<style>
	:global(.text-orange-500) { color: #f97316; }
	:global(.bg-orange-500) { background-color: #f97316; }
	:global(.hover\:bg-orange-600:hover) { background-color: #ea580c; }
</style>
