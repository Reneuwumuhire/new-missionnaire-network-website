<script lang="ts">
	import { browser } from '$app/environment';
	import { derived, get } from 'svelte/store';
	import { currentViewingVideo } from '$lib/stores/global';
	import '../../app.css';
	import ThumbnailVideo from '$lib/components/+thumbnailVideo.svelte';
	import VideoView from '$lib/components/+videoView.svelte';
	import type { YoutubeVideo } from '$lib/models/youtube';
	import HomepageLoadingSkelton from '$lib/components/+homepageLoadingSkelton.svelte';
	import { availableTypesTag } from '../../utils/data';
	import { searchTerm, selectedVideo, skip } from '$lib/stores/videoStore';
	import { onMount } from 'svelte';
	import {
		activeFilter,
		isLoading,
		isInitialLoading,
		videos,
		liveVideo,
		hasMore
	} from '$lib/stores/videoStore';
	import { fetchInitialVideos, fetchMoreVideos, resetPagination, setFilter } from '../../utils/videoUtils';

	export let data: { data: YoutubeVideo[]; liveStatus?: any; requestedVideo?: YoutubeVideo | null };

	const limit = 20;

	function debounce(func: Function, wait: number) {
		let timeout: NodeJS.Timeout;
		return function executedFunction(...args: any[]) {
			const later = () => {
				clearTimeout(timeout);
				func(...args);
			};
			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
		};
	}

	let observer: IntersectionObserver;
	let observerTarget: HTMLElement;

	function setupIntersectionObserver() {
		if (browser) {
			observer = new IntersectionObserver(
				(entries) => {
					if (entries[0].isIntersecting && $hasMore && !$isLoading) {
						fetchMoreVideos();
					}
				},
				{
					threshold: 0.1,
					rootMargin: '100px'
				}
			);

			if (observerTarget) {
				observer.observe(observerTarget);
			}
		}
	}

	function intersectionObserver(node: HTMLElement) {
		observerTarget = node;
		setupIntersectionObserver();

		return {
			destroy() {
				if (observer) {
					observer.disconnect();
				}
			}
		};
	}

	$: videoSelected = (video: YoutubeVideo) => {
		selectedVideo.set(video);
		window.scrollTo({ top: 0, behavior: 'smooth' });
	};

	$: currentViewingVideo.subscribe((value) => {
		selectedVideo.set(value);
	});

	$: filteredVideos = derived(
		[videos, liveVideo, activeFilter, searchTerm],
		([$videos, $liveVideo, $activeFilter, $searchTerm]) => {
			const allVids = [...$videos];
			if ($liveVideo) {
				const exists = allVids.find((v) => v.id === $liveVideo.id);
				if (!exists) {
					allVids.unshift($liveVideo);
				} else {
					const index = allVids.findIndex((v) => v.id === $liveVideo.id);
					allVids.splice(index, 1);
					allVids.unshift($liveVideo);
				}
			}

			return allVids.filter((video) => {
				const matchesFilter =
					$activeFilter === '' ||
					video.tags.includes('LIVE') ||
					video.tags.some(
						(tag: string | undefined) => $activeFilter === tagLabelMap.get(tag as string) || 'All'
					) ||
					($activeFilter === 'All' &&
						availableTypesTag[0].value.some((tag) => video.tags.includes(tag)));

				const matchesSearch =
					$searchTerm.trim() === '' ||
					video.title.toLowerCase().includes($searchTerm.toLowerCase()) ||
					video.description.toLowerCase().includes($searchTerm.toLowerCase());

				return matchesFilter && matchesSearch;
			});
		}
	);

	const tagLabelMap = new Map<string, string>();
	$: availableTypesTag.forEach((type) => {
		type.value.forEach((value) => {
			tagLabelMap.set(value, type.label);
		});
	});

	const handleSearch = debounce(async (searchValue: string) => {
		searchTerm.set(searchValue);
		resetPagination();
		await fetchInitialVideos();
	}, 500);

	onMount(() => {
		if (browser) {
			const url = new URL(window.location.href);
			const filterParam = url.searchParams.get('filter');
			const searchParam = url.searchParams.get('search');

			if (data.liveStatus?.isLive) {
				const liveVid: YoutubeVideo = {
					id: data.liveStatus.videoId,
					display_id: data.liveStatus.videoId,
					_id: `live-${data.liveStatus.videoId}`,
					title: data.liveStatus.title,
					description: data.liveStatus.description || '',
					thumbnail: data.liveStatus.thumbnail || '',
					duration_string: 'EN DIRECT',
					duration: 0,
					tags: ['retransmission', 'LIVE'],
					view_count: 0,
					webpage_url: data.liveStatus.url,
					live_status: 'live',
					release_timestamp: Date.now() / 1000,
					upload_date: new Date().toISOString(),
					timestamp: Date.now(),
					availability: 'public',
					original_url: data.liveStatus.url,
					fulltitle: data.liveStatus.title,
					release_year: new Date().getFullYear(),
					epoch: Date.now() / 1000,
					aspect_ratio: 1.777,
					pdfInfo: [],
					thumbnails: []
				} as any;
				liveVideo.set(liveVid);
			} else {
				liveVideo.set(undefined);
			}

			if (data.data && data.data.length > 0) {
				videos.set(data.data);
				if (data.data.length < limit) {
					hasMore.set(false);
				} else {
					skip.set(limit);
					hasMore.set(true);
				}
			}

			if (data.requestedVideo) {
				selectedVideo.set(data.requestedVideo);
			}

			if (filterParam) {
				activeFilter.set(filterParam);
				fetchInitialVideos();
			} else if (searchParam) {
				searchTerm.set(searchParam);
				fetchInitialVideos();
			} else if (!data.data || data.data.length === 0) {
				fetchInitialVideos();
			}

			isLoading.set(false);
			isInitialLoading.set(false);
		}
	});

	$: if ($searchTerm !== undefined && browser) {
		const searchValue = $searchTerm;
		if (searchValue !== '') {
			selectedVideo.set(undefined);
			handleSearch(searchValue);
		}
	}
</script>

<svelte:head>
	<title>Vidéos | Missionnaire Network</title>
	<meta
		name="description"
		content="Regardez les vidéos de prédications, retransmissions et enseignements du Message sur Missionnaire Network."
	/>
	<meta property="og:title" content="Vidéos | Missionnaire Network" />
	<meta
		property="og:description"
		content="Regardez les vidéos de prédications, retransmissions et enseignements du Message."
	/>
	<meta property="og:url" content="https://missionnaire.net/videos" />
</svelte:head>

<main class="relative max-w-7xl mx-auto px-4 md:px-8">
	<div class="mt-5 mb-16">
		<!-- Page Header -->
		<section class="mb-8">
			<p class="text-[10px] font-semibold uppercase tracking-[0.25em] text-missionnaire mb-2">
				Missionnaire Network
			</p>
			<h1 class="font-display text-2xl md:text-3xl font-bold text-stone-900">
				Vidéos
			</h1>
			<p class="mt-2 text-sm text-stone-600 max-w-2xl">
				Retrouvez les retransmissions, prédications et enseignements en vidéo.
			</p>
		</section>

		<!-- Filter Bar -->
		<div class="mb-8">
			<div class="flex flex-wrap gap-2 items-center">
				{#each availableTypesTag as tagType}
					<button
						class="px-3 py-1.5 text-sm font-medium transition-colors {$activeFilter === tagType.label
							? 'bg-stone-900 text-white'
							: 'bg-stone-100 text-stone-600 hover:bg-stone-200'}"
						on:click={() => setFilter(tagType.label)}
					>
						{tagType.label}
					</button>
				{/each}
				{#if $isLoading}
					<div class="inline-block">
						<div class="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-missionnaire"></div>
					</div>
				{/if}
			</div>
		</div>

		{#if browser && $isInitialLoading}
			<HomepageLoadingSkelton />
		{:else}
			{#if $selectedVideo !== undefined}
				<div class="mb-12">
					<VideoView />
				</div>
			{/if}

			{#if browser}
				{#if !$selectedVideo && $filteredVideos[0]}
					<!-- Featured Video -->
					<button
						class="relative w-full h-[50vh] min-h-[400px] max-h-[600px] overflow-hidden mb-16 group text-left transition-all block"
						on:click={() => videoSelected($filteredVideos[0])}
					>
						<img
							src={$filteredVideos[0].thumbnail_max2 || $filteredVideos[0].thumbnail}
							alt={$filteredVideos[0].title}
							class="absolute inset-0 w-full h-full object-cover transform transition-transform duration-700 group-hover:scale-105"
						/>
						<div
							class="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-90 group-hover:opacity-80 transition-opacity"
						></div>
						<div class="absolute bottom-0 left-0 w-full p-6 md:p-12 text-white">
							<div class="max-w-4xl space-y-4">
								<div
									class="inline-block px-3 py-1 {$filteredVideos[0].tags.includes('LIVE')
										? 'bg-red-600'
										: 'bg-missionnaire'} rounded-full text-xs font-bold uppercase tracking-widest mb-2"
								>
									{$filteredVideos[0].tags.includes('LIVE') ? 'EN DIRECT' : 'À la une'}
								</div>
								<h2
									class="text-3xl md:text-5xl lg:text-6xl font-black leading-tight tracking-tight line-clamp-2 group-hover:text-stone-200 transition-colors"
								>
									{$filteredVideos[0].title}
								</h2>
								<p class="text-white/80 text-sm md:text-lg line-clamp-2 max-w-2xl font-medium">
									{$filteredVideos[0].description}
								</p>
								<div class="pt-6 flex items-center gap-4">
									<div
										class="px-8 py-4 bg-white text-black rounded-full font-bold text-sm uppercase tracking-wider transition-transform group-hover:scale-105 hidden sm:block"
									>
										Regarder maintenant
									</div>
									<div
										class="px-8 py-4 bg-white/10 backdrop-blur-md text-white border border-white/20 rounded-full font-bold text-sm uppercase tracking-wider flex items-center gap-2"
									>
										<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
										{$filteredVideos[0].duration_string || 'Video'}
									</div>
								</div>
							</div>
						</div>
					</button>
				{/if}

				{#if $filteredVideos.length > 0}
					<section class="mb-12">
						<div class="flex items-end justify-between mb-8 px-2">
							<div>
								<h2 class="text-[10px] font-semibold text-missionnaire uppercase tracking-[0.25em] mb-2">
									Découvrir
								</h2>
								<h3 class="font-display text-2xl md:text-3xl font-bold text-stone-900">Vidéos récentes</h3>
							</div>
						</div>

						<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
							{#each $filteredVideos.slice($selectedVideo ? 0 : 1) as video, index (video._id)}
								<button on:click={() => videoSelected(video)} class="text-left group video-card">
									<ThumbnailVideo {video} index={index + ($selectedVideo ? 0 : 1)} />
								</button>
							{/each}
						</div>

						{#if $hasMore}
							<div use:intersectionObserver class="h-20 w-full flex items-center justify-center mt-12">
								{#if $isLoading}
									<div
										class="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-missionnaire"
									></div>
								{/if}
							</div>
						{/if}

						{#if !$hasMore && !$isLoading}
							<div class="text-center w-full py-20 opacity-50">
								<div class="w-16 h-1 bg-stone-200 mx-auto rounded-full mb-4"></div>
								<p class="text-xs font-bold uppercase tracking-widest text-stone-400">Fin de la liste</p>
							</div>
						{/if}
					</section>
				{:else}
					<div class="flex flex-col items-center justify-center py-32 text-center text-stone-400">
						<div class="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mb-4 text-2xl">
							🔍
						</div>
						<p>Aucune vidéo trouvée</p>
					</div>
				{/if}
			{/if}
		{/if}
	</div>
</main>
