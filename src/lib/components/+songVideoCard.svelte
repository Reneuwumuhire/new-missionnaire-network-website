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
	const maxDescriptionLength = 90;
	let isPlaying = false;

	$: truncatedDescription =
		videoData.description.length > maxDescriptionLength
			? `${videoData.description.slice(0, maxDescriptionLength)}...`
			: videoData.description;

	function formatDate(dateStr: string) {
		if (!dateStr) return '';
		// YYYYMMDD → DD/MM/YYYY
		return dateStr.replace(/^(\d{4})(\d{2})(\d{2})$/, '$3/$2/$1');
	}
</script>

<div
	class="group relative bg-white/40 border border-stone-200/60 hover:border-missionnaire/40 transition-colors duration-300 flex flex-col h-full"
>
	<!-- Video / Thumbnail -->
	<div class="relative aspect-video overflow-hidden bg-stone-900">
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
			<button
				class="w-full h-full relative cursor-pointer"
				on:click={() => (isPlaying = true)}
			>
				<img
					src={videoData.thumbnail}
					alt={videoData.title}
					loading="lazy"
					class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
				/>
				<!-- Subtle bottom gradient for caption legibility -->
				<div
					class="absolute inset-0 bg-gradient-to-t from-stone-900/70 via-stone-900/10 to-transparent"
				></div>

				<!-- Play overlays (revealed on hover) -->
				<div class="absolute inset-0 flex items-center justify-center gap-3">
					<div
						role="button"
						tabindex="0"
						class="bg-white/95 text-missionnaire p-3 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:scale-105 active:scale-95"
						on:click|stopPropagation={() => (isPlaying = true)}
						on:keydown|stopPropagation={(e) => e.key === 'Enter' && (isPlaying = true)}
						title="Lire cette vidéo"
					>
						<Icon src={IoPlayCircle} size="28" />
					</div>
					<div
						role="button"
						tabindex="0"
						class="bg-missionnaire text-white p-3 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-75 hover:scale-105 active:scale-95"
						on:click|stopPropagation={() => dispatch('playPlaylist')}
						on:keydown|stopPropagation={(e) => e.key === 'Enter' && dispatch('playPlaylist')}
						title="Lire en playlist à partir d'ici"
					>
						<Icon src={BsShuffle} size="20" />
					</div>
				</div>

				<!-- Duration Badge -->
				{#if videoData.duration}
					<div
						class="absolute bottom-2.5 right-2.5 bg-stone-900/75 backdrop-blur-sm text-white text-[10px] font-bold tracking-wider px-2 py-0.5 font-body"
					>
						{formatTime(videoData.duration)}
					</div>
				{/if}
			</button>
		{/if}
	</div>

	<!-- Content -->
	<div class="p-5 flex flex-col flex-grow">
		<h3
			class="font-display text-lg md:text-xl font-semibold text-stone-900 leading-snug mb-3 line-clamp-2 group-hover:text-missionnaire transition-colors"
		>
			{videoData.title}
		</h3>

		<div class="flex-grow">
			<p class="text-sm text-stone-500 font-body leading-relaxed mb-4">
				{showFullDescription ? videoData.description : truncatedDescription}
				{#if videoData.description.length > maxDescriptionLength}
					<button
						class="text-missionnaire hover:text-missionnaire/80 font-bold ml-1 text-[10px] uppercase tracking-[0.18em] font-body transition-colors"
						on:click|stopPropagation={() => (showFullDescription = !showFullDescription)}
					>
						{showFullDescription ? 'Moins' : 'Plus'}
					</button>
				{/if}
			</p>
		</div>

		<!-- Footer Info -->
		<div class="pt-4 mt-auto border-t border-stone-200/60 flex items-center justify-between">
			<div class="flex items-center gap-3">
				<div
					class="flex items-center gap-1.5 text-[10px] font-bold text-stone-400 uppercase tracking-[0.18em] font-body"
				>
					<Icon src={IoTimeOutline} size="13" />
					<span>{formatTime(videoData.duration)}</span>
				</div>
				<span class="w-0.5 h-0.5 bg-stone-300 rounded-full"></span>
				<div
					class="flex items-center gap-1.5 text-[10px] font-bold text-stone-400 uppercase tracking-[0.18em] font-body"
				>
					<Icon src={IoCalendarOutline} size="13" />
					<span>{formatDate(videoData.upload_date)}</span>
				</div>
			</div>

			<button
				type="button"
				class="flex items-center gap-1.5 text-[10px] font-bold text-stone-400 group-hover:text-missionnaire hover:text-missionnaire uppercase tracking-[0.2em] transition-colors font-body active:scale-95"
				on:click|stopPropagation={() => (isPlaying = true)}
				title="Lire cette vidéo"
			>
				<Icon src={IoPlayCircle} size="14" />
				Lire
			</button>
		</div>
	</div>
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
</style>
