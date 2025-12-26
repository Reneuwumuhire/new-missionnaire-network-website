<script lang="ts">
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsPlayCircleFill from 'svelte-icons-pack/bs/BsPlayCircleFill';
	import { formatDate, formatTime, formatFileSize } from '../../utils/FormatTime';
	import type { YoutubeVideo } from '@mnlib/lib/models/youtube';
	import { page } from '$app/stores';
	import { selectedVideo } from '$lib/stores/videoStore';
	import AiOutlineFilePdf from 'svelte-icons-pack/ai/AiOutlineFilePdf';
	import HiOutlineEye from 'svelte-icons-pack/hi/HiOutlineEye';
	import HiOutlineCalendar from 'svelte-icons-pack/hi/HiOutlineCalendar';

	let playNow = false;
	const handleClick = () => {
		playNow = !playNow;
	};
</script>

<div class="w-full flex flex-col items-center justify-center mb-6">
	<div class="flex w-full flex-col space-y-10">
		<!-- video player container -->
		<div class="w-full">
			<div class="relative w-full aspect-[4/5] md:aspect-video bg-hardBlack rounded-2xl md:rounded-[2.5rem] overflow-hidden shadow-2xl group">
				{#if playNow}
					<div class="flex flex-row items-center justify-center w-full h-full" id="player">
						<iframe
							class="w-full h-full"
							src={`https://www.youtube.com/embed/${$selectedVideo?.id}?autoplay=1`}
							allowfullscreen
							allow="autoplay; encrypted-media"
							title={$selectedVideo?.title}
							allowtransparency
						/>
					</div>
				{:else}
					<img
						class="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
						src={$selectedVideo?.thumbnail}
						alt="thumbnail"
					/>
					
					<!-- Overlay Gradient -->
					<div class="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent transition-opacity duration-500 opacity-95 group-hover:opacity-90" />

					<!-- Overlay Content -->
					<div class="absolute inset-0 p-6 md:p-12 flex flex-col justify-between pointer-events-none">
						<!-- Top badge area -->
						<div class="flex justify-between items-start">
							<div class="px-4 py-2 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
								<span class="text-missionnaire font-bold text-xs tracking-wider uppercase">{$selectedVideo?.duration_string}</span>
							</div>

							{#if $selectedVideo?.pdfInfo && $selectedVideo.pdfInfo.length > 0}
								<div class="flex flex-col items-end gap-2 pointer-events-auto">
									{#each $selectedVideo.pdfInfo as pdf}
										<a
											href={pdf.url}
											target="_blank"
											rel="noopener noreferrer"
											class="flex items-center gap-2 px-4 py-2 bg-missionnaire/90 hover:bg-missionnaire text-white rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 group/pdf"
											title={pdf.filename}
										>
											<Icon src={AiOutlineFilePdf} size="1.2rem" />
											<span class="text-xs font-bold uppercase tracking-tight">PDF</span>
										</a>
									{/each}
								</div>
							{/if}
						</div>

						<!-- Center Play Button -->
						<div class="absolute inset-0 flex items-center justify-center pointer-events-none">
							<button
								on:click={() => (playNow = true)}
								class="w-20 h-20 md:w-32 md:h-32 text-missionnaire transition-all duration-300 hover:scale-110 active:scale-95 drop-shadow-[0_0_30px_rgba(242,143,62,0.3)] group/play pointer-events-auto"
							>
								<Icon size="100%" src={BsPlayCircleFill} />
							</button>
						</div>

						<!-- Bottom Info -->
						<div class="space-y-4 max-w-4xl">
							<div class="space-y-3">
								<h1 class="text-white font-bold text-md md:text-3xl leading-tight drop-shadow-lg line-clamp-2">
									{$selectedVideo?.title}
								</h1>
								
								<p class="text-white/70 text-sm md:text-lg line-clamp-2 leading-relaxed drop-shadow-md">
									{$selectedVideo?.description}
								</p>
							</div>
							
							<div class="flex flex-wrap items-center gap-6 text-white/50 text-xs md:text-base">
								<div class="flex items-center gap-2">
									<Icon src={HiOutlineCalendar} size="1.1rem" />
									<span>{formatDate($selectedVideo?.release_timestamp ? new Date($selectedVideo.release_timestamp * 1000) : $selectedVideo?.upload_date || '')}</span>
								</div>
								<div class="flex items-center gap-2">
									<Icon src={HiOutlineEye} size="1.1rem" />
									<span>{$selectedVideo?.view_count?.toLocaleString() || 0} views</span>
								</div>
							</div>
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>
