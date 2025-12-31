<script lang="ts">
	import type { YoutubeVideo } from '$lib/models/youtube';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import IoPlayCircle from 'svelte-icons-pack/io/IoPlayCircle';
	import IoTimeOutline from 'svelte-icons-pack/io/IoTimeOutline';
	import IoCalendarOutline from 'svelte-icons-pack/io/IoCalendarOutline';
	import { formatTime } from '../../utils/FormatTime';

	import { createEventDispatcher } from 'svelte';
	import BsShuffle from 'svelte-icons-pack/bs/BsShuffle';

	const dispatch = createEventDispatcher();

	export let videoData: YoutubeVideo;

	let showFullDescription = false;
	const maxDescriptionLength = 80;
	let isPlaying = false;

	$: truncatedDescription =
		videoData.description.length > maxDescriptionLength
			? `${videoData.description.slice(0, maxDescriptionLength)}...`
			: videoData.description;

	function formatDate(dateStr: string) {
		if (!dateStr) return '';
		// Format YYYYMMDD to DD/MM/YYYY
		return dateStr.replace(/^(\d{4})(\d{2})(\d{2})$/, '$3/$2/$1');
	}
</script>

<div class="group relative bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-500 border border-gray-100/50 hover:border-orange-200/50 flex flex-col h-full transform hover:-translate-y-1">
	<!-- Video/Thumbnail Container -->
	<div class="relative aspect-video overflow-hidden bg-gray-900 group-hover:bg-black transition-colors duration-500">
		{#if isPlaying}
			<iframe
				class="w-full h-full"
				src={`https://www.youtube.com/embed/${videoData.id}?autoplay=1`}
				allowfullscreen
				allow="autoplay; encrypted-media"
				title={videoData.title}
				frameborder="0"
			/>
		{:else}
			<!-- Custom Thumbnail -->
			<button 
				class="w-full h-full relative cursor-pointer"
				on:click={() => isPlaying = true}
			>
				<img 
					src={videoData.thumbnail} 
					alt={videoData.title}
					class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-90 group-hover:opacity-100"
				/>
				<!-- Gradient Overlay -->
				<div class="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity"></div>
				
				<!-- Play Button Overlays -->
				<div class="absolute inset-0 flex items-center justify-center gap-4">
					<button 
						class="bg-white/90 text-orange-500 p-4 rounded-full shadow-2xl transform translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm hover:scale-110 active:scale-95"
						on:click|stopPropagation={() => isPlaying = true}
						title="Lire cette vidéo"
					>
						<Icon src={IoPlayCircle} size="32" />
					</button>
					<button 
						class="bg-orange-500 text-white p-4 rounded-full shadow-2xl transform translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300 delay-75 hover:scale-110 active:scale-95"
						on:click|stopPropagation={() => dispatch('playPlaylist')}
						title="Lire en playlist à partir d'ici"
					>
						<Icon src={BsShuffle} size="24" />
					</button>
				</div>

				<!-- Duration Badge -->
				{#if videoData.duration}
					<div class="absolute bottom-3 right-3 bg-black/70 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded-md border border-white/10">
						{formatTime(videoData.duration)}
					</div>
				{/if}
			</button>
		{/if}
	</div>

	<!-- Content -->
	<div class="p-5 flex flex-col flex-grow">
		<h3 class="text-lg font-black text-gray-800 line-clamp-2 leading-tight mb-3 group-hover:text-orange-500 transition-colors">
			{videoData.title}
		</h3>

		<div class="flex-grow">
			<p class="text-sm text-gray-500 font-medium leading-relaxed mb-4">
				{showFullDescription ? videoData.description : truncatedDescription}
				{#if videoData.description.length > maxDescriptionLength}
					<button
						class="text-orange-500 hover:text-orange-600 font-bold ml-1 text-xs uppercase tracking-wider"
						on:click|stopPropagation={() => (showFullDescription = !showFullDescription)}
					>
						{showFullDescription ? 'Moins' : 'Plus...'}
					</button>
				{/if}
			</p>
		</div>

		<!-- Footer Info -->
		<div class="pt-4 mt-auto border-t border-gray-50 flex items-center justify-between">
			<div class="flex items-center gap-3">
				<div class="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
					<Icon src={IoTimeOutline} size="14" />
					<span>{formatTime(videoData.duration)}</span>
				</div>
				<span class="w-1 h-1 bg-gray-200 rounded-full"></span>
				<div class="flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
					<Icon src={IoCalendarOutline} size="14" />
					<span>{formatDate(videoData.upload_date)}</span>
				</div>
			</div>
			
			<div class="opacity-0 group-hover:opacity-100 transition-opacity">
				<span class="text-[10px] font-black text-orange-500 uppercase tracking-[0.2em]">Lire</span>
			</div>
		</div>
	</div>
</div>

<style>
	/* Custom line clamp if needed for older browsers, though Tailwind handles it */
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
