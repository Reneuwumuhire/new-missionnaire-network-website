<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { onDestroy, onMount, untrack } from 'svelte';
	import type { PageData } from './$types';
	import type { YouTubeCachedStatus } from '../../db/collections';
	import type { YoutubeVideo } from '$lib/models/youtube';
	import '../../app.css';
	import ThumbnailVideo from '$lib/components/+thumbnailVideo.svelte';
	import VideoView from '$lib/components/+videoView.svelte';
	import ListSkeleton from '$lib/components/ListSkeleton.svelte';
	import ErrorCard from '$lib/components/ErrorCard.svelte';
	import LoadingRing from '$lib/components/LoadingRing.svelte';
	import { availableTypesTag } from '../../utils/data';
	import { selectedVideo } from '$lib/stores/videoStore';
	import { currentViewingVideo } from '$lib/stores/global';
	import {
		getVideosPageCache,
		isVideosPageCacheFresh,
		setVideosPageCache,
		type VideosPageCacheEntry
	} from './listCache';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsSearch from 'svelte-icons-pack/bs/BsSearch';
	import BsX from 'svelte-icons-pack/bs/BsX';
	import { t } from '../../i18n';

	interface Props {
		data: PageData;
	}

	let { data }: Props = $props();

	const PAGE_SIZE = 20;

	let loadedVideos: YoutubeVideo[] = $state([]);
	let liveStatus: YouTubeCachedStatus | null = $state(null);
	let requestedVideo: YoutubeVideo | null = $state(null);
	let skipCount = $state(0);
	let hasMore = $state(true);
	let isInitialLoading = $state(false);
	let isLoadingMore = $state(false);
	let isSearchLoading = $state(false);
	let initialLoadError = $state('');
	let hasResolved = $state(false);
	let abortController: AbortController | null = null;
	let currentToken = 0;
	let lastHandledKey = $state('');
	let lastResetSelectionKey = $state('');
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;
	let searchInput = $state('');
	let lastSyncedSearch = $state('');
	let observerTarget: HTMLElement;
	let observer: IntersectionObserver | null = null;


	function buildLiveVideo(status: YouTubeCachedStatus | null): YoutubeVideo | null {
		if (!status?.isLive || !status.videoId) return null;
		return {
			id: status.videoId,
			display_id: status.videoId,
			_id: `live-${status.videoId}`,
			title: status.title || '',
			description: status.description || '',
			thumbnail: status.thumbnail || '',
			duration_string: 'EN DIRECT',
			duration: status.duration || 0,
			tags: ['retransmission', 'LIVE'],
			view_count: 0,
			webpage_url: status.url || '',
			live_status: 'live',
			release_timestamp: Date.now() / 1000,
			upload_date: status.updatedAt || new Date().toISOString(),
			timestamp: Date.now(),
			availability: 'public',
			original_url: status.url || '',
			fulltitle: status.title || '',
			release_year: new Date().getFullYear(),
			epoch: Date.now() / 1000,
			aspect_ratio: 1.777,
			pdfInfo: [],
			thumbnails: []
		} as YoutubeVideo;
	}

	function abortRequest() {
		abortController?.abort();
		abortController = null;
	}

	function applyData(payload: VideosPageCacheEntry) {
		loadedVideos = payload.videos;
		liveStatus = payload.liveStatus;
		requestedVideo = payload.requestedVideo;
		skipCount = payload.skipCount;
		hasMore = payload.hasMore;
		isSearchLoading = false;
		hasResolved = true;

		if (browser && payload.requestedVideo) {
			selectedVideo.set(payload.requestedVideo);
		}
	}

	async function loadInitial(options?: { showLoading?: boolean }) {
		const showLoading = options?.showLoading ?? true;
		const key = requestKey;
		const token = ++currentToken;
		const controller = new AbortController();
		abortRequest();
		abortController = controller;
		if (showLoading || !hasResolved) isInitialLoading = true;

		try {
			const params = new URLSearchParams({
				filter: currentFilter || 'All',
				search: currentSearch || ''
			});
			if (currentVideoId) params.set('v', currentVideoId);

			const response = await fetch(`/api/videos-page?${params.toString()}`, {
				signal: controller.signal
			});

			if (token !== currentToken || key !== requestKey) return;
			if (!response.ok) throw new Error($t('videos.loadFailed'));

			const result = await response.json();
			const videos = (result.data || []) as YoutubeVideo[];
			const cached = setVideosPageCache(key, {
				videos,
				liveStatus: (result.liveStatus || null) as YouTubeCachedStatus | null,
				requestedVideo: (result.requestedVideo || null) as YoutubeVideo | null,
				skipCount: videos.length,
				hasMore: videos.length >= PAGE_SIZE
			});

			applyData(cached);
			initialLoadError = '';
		} catch (error) {
			if ((error as Error).name === 'AbortError') return;
			if (token !== currentToken || key !== requestKey) return;
			initialLoadError = error instanceof Error ? error.message : $t('videos.loadFailed');
			isSearchLoading = false;
		} finally {
			if (token === currentToken) isInitialLoading = false;
			if (abortController === controller) abortController = null;
		}
	}


	async function loadMoreVideos() {
		if (isLoadingMore || !hasMore) return;
		isLoadingMore = true;

		try {
			const params = new URLSearchParams({
				skip: String(skipCount),
				filter: currentFilter || 'All',
				search: currentSearch || ''
			});

			const response = await fetch(`/pagination?${params.toString()}`);
			if (!response.ok) throw new Error($t('videos.loadMoreFailed'));

			const result = await response.json();
			const nextVideos = (result.data || []) as YoutubeVideo[];

			if (nextVideos.length > 0) {
				loadedVideos = [...loadedVideos, ...nextVideos];
				skipCount += nextVideos.length;
				hasMore = nextVideos.length >= PAGE_SIZE;
			} else {
				hasMore = false;
			}

			setVideosPageCache(requestKey, {
				videos: loadedVideos,
				liveStatus,
				requestedVideo,
				skipCount,
				hasMore
			});
		} catch (error) {
			console.error('[Videos] Error loading more videos:', error);
			hasMore = false;
		} finally {
			isLoadingMore = false;
		}
	}

	async function navigateToCurrentSearchAndFilter(searchValue: string, filterValue: string) {
		if (!browser) return;
		const url = new URL(window.location.href);
		const trimmedSearch = searchValue.trim();

		if (trimmedSearch) {
			url.searchParams.set('search', trimmedSearch);
		} else {
			url.searchParams.delete('search');
		}

		if (filterValue && filterValue !== 'All') {
			url.searchParams.set('filter', filterValue);
		} else {
			url.searchParams.delete('filter');
		}

		url.searchParams.delete('v');
		await goto(url.toString(), { keepFocus: true, noScroll: true });
	}

	function handleSearch(immediate = false) {
		if (searchTimeout) clearTimeout(searchTimeout);
		const trimmed = searchInput.trim();
		if (trimmed === currentSearch) {
			isSearchLoading = false;
			return;
		}

		const runSearch = () => {
			isSearchLoading = true;
			void navigateToCurrentSearchAndFilter(searchInput, currentFilter);
		};

		if (immediate) {
			runSearch();
		} else {
			isSearchLoading = true;
			searchTimeout = setTimeout(runSearch, 400);
		}
	}

	function handleFilterChange(filterLabel: string) {
		if (searchTimeout) clearTimeout(searchTimeout);
		if (filterLabel === currentFilter) return;
		isSearchLoading = false;
		void navigateToCurrentSearchAndFilter(searchInput, filterLabel);
	}

	function videoSelected(video: YoutubeVideo) {
		selectedVideo.set(video);
		if (browser) {
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}

	function intersectionObserver(node: HTMLElement) {
		if (!browser) return;
		observerTarget = node;

		observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
					void loadMoreVideos();
				}
			},
			{ threshold: 0.1, rootMargin: '100px' }
		);

		observer.observe(observerTarget);

		return {
			destroy() {
				observer?.disconnect();
				observer = null;
			}
		};
	}

	onMount(() => {
		const unsubscribe = currentViewingVideo.subscribe((value) => {
			if (value) {
				selectedVideo.set(value);
			}
		});

		if (requestedVideo) {
			selectedVideo.set(requestedVideo);
		}

		return () => {
			unsubscribe();
		};
	});

	onDestroy(() => {
		abortRequest();
		if (searchTimeout) clearTimeout(searchTimeout);
		observer?.disconnect();
	});
	let initialVideos = $derived(((data as any).videos || []) as YoutubeVideo[]);
	let initialLiveStatus = $derived(((data as any).liveStatus || null) as YouTubeCachedStatus | null);
	let initialRequestedVideo = $derived(((data as any).requestedVideo || null) as YoutubeVideo | null);
	let currentFilter = $derived(((data as any).filter || 'All') as string);
	let currentSearch = $derived(((data as any).search || '') as string);
	let currentVideoId = $derived(((data as any).videoId || '') as string);
	let isDeferredData = $derived(Boolean((data as any).deferred));
	let requestKey = $derived(JSON.stringify({
		filter: currentFilter || 'All',
		search: currentSearch || '',
		videoId: currentVideoId || ''
	}));
	$effect(() => {
		if (requestKey && requestKey !== lastHandledKey) {
			untrack(() => {
				lastHandledKey = requestKey;
			});
			initialLoadError = '';

			const cachedEntry = getVideosPageCache(requestKey);

			if (!isDeferredData) {
				const seeded = setVideosPageCache(requestKey, {
					videos: initialVideos,
					liveStatus: initialLiveStatus,
					requestedVideo: initialRequestedVideo,
					skipCount: initialVideos.length,
					hasMore: initialVideos.length >= PAGE_SIZE
				});
				abortRequest();
				applyData(seeded);
				isInitialLoading = false;
			} else if (cachedEntry) {
				applyData(cachedEntry);
				if (!isVideosPageCacheFresh(cachedEntry)) {
					void loadInitial({ showLoading: false });
				}
			} else {
				abortRequest();
				loadedVideos = [];
				liveStatus = null;
				requestedVideo = null;
				skipCount = 0;
				hasMore = true;
				hasResolved = false;
				void loadInitial({ showLoading: true });
			}
		}
	});
	let activeLiveVideo = $derived(buildLiveVideo(liveStatus));
	let displayVideos = $derived(activeLiveVideo
		? [activeLiveVideo, ...loadedVideos.filter((video) => video.id !== activeLiveVideo.id)]
		: loadedVideos);
	$effect(() => {
		if (currentSearch !== lastSyncedSearch) {
			searchInput = currentSearch;
			untrack(() => {
				lastSyncedSearch = currentSearch;
			});
		}
	});
	$effect(() => {
		if (requestKey && requestKey !== lastResetSelectionKey) {
			untrack(() => {
				lastResetSelectionKey = requestKey;
			});
			if (browser && !currentVideoId) {
				selectedVideo.set(undefined);
			}
		}
	});
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

<main class="relative max-w-6xl mx-auto px-6">
	<div class="mt-5 mb-16">
		<section class="mb-8">
			<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-3 font-body">
				Missionnaire Network
			</p>
			<div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
				<h1 class="font-display text-3xl md:text-4xl font-semibold text-stone-900">
					{$t('nav.videos')}
				</h1>
				<a
					href="/predications"
					class="inline-flex items-center gap-2 text-[12px] font-semibold text-stone-400 hover:text-missionnaire uppercase tracking-[0.15em] font-body transition-colors"
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M9 18V5l12-2v13"></path>
						<circle cx="6" cy="18" r="3"></circle>
						<circle cx="18" cy="16" r="3"></circle>
					</svg>
					{$t('videos.listenAudio')} →
				</a>
			</div>
			<p class="mt-2 text-sm text-stone-500 font-body max-w-2xl">
				{$t('videos.intro')}
			</p>
		</section>

		<div class="mb-8 flex flex-col gap-4">
			<form
				class="relative w-full max-w-xl"
				onsubmit={(e) => {
					e.preventDefault();
					handleSearch(true);
				}}
			>
				<div class="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
					<Icon src={BsSearch} size="14" />
				</div>
				<input
					type="text"
					placeholder={$t('videos.searchPlaceholder')}
					class="w-full border border-stone-200/80 bg-white pl-9 pr-24 py-3 text-sm font-body text-stone-800 placeholder:text-stone-400 focus:border-missionnaire/40 focus:outline-none focus:ring-1 focus:ring-missionnaire/30 transition-colors"
					bind:value={searchInput}
					oninput={() => handleSearch()}
				/>
				{#if isSearchLoading}
					<LoadingRing
						size={16}
						className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center text-missionnaire/90"
					/>
				{:else if searchInput}
					<button
						type="button"
						class="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-missionnaire transition-colors p-1"
						onclick={() => {
							searchInput = '';
							handleSearch(true);
						}}
						aria-label={$t('search.clear')}
					>
						<Icon src={BsX} size="16" />
					</button>
				{/if}
			</form>

			<div class="flex flex-wrap gap-2 items-center">
				{#each availableTypesTag as tagType}
					<button
						class="px-3 py-1.5 text-sm font-medium transition-colors border {currentFilter === tagType.label
							? 'border-missionnaire text-missionnaire bg-missionnaire/5'
							: 'border-stone-200/60 text-stone-500 hover:border-missionnaire hover:text-missionnaire'}"
						onclick={() => handleFilterChange(tagType.label)}
					>
						{tagType.label}
					</button>
				{/each}
				{#if isInitialLoading && !hasResolved}
					<div class="inline-block ml-1">
						<LoadingRing size={16} />
					</div>
				{/if}
			</div>
		</div>

		{#if isInitialLoading && !hasResolved}
			<ListSkeleton variant="cards" rows={8} />
		{:else if initialLoadError && !hasResolved}
			<ErrorCard
				message={initialLoadError}
				onRetry={() => void loadInitial({ showLoading: true })}
			/>
		{:else}
			{#if $selectedVideo !== undefined}
				<div class="mb-12">
					<VideoView />
				</div>
			{/if}

			{#if !$selectedVideo && displayVideos[0]}
				<button
					class="relative w-full h-[50vh] min-h-[400px] max-h-[600px] overflow-hidden mb-16 group text-left transition-all block"
					onclick={() => videoSelected(displayVideos[0])}
				>
					<img
						src={displayVideos[0].thumbnail}
						alt={displayVideos[0].title}
						class="absolute inset-0 w-full h-full object-cover transform transition-transform duration-700 group-hover:scale-105"
					/>
					<div
						class="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-90 group-hover:opacity-80 transition-opacity"
					></div>
					<div class="absolute bottom-0 left-0 w-full p-6 md:p-12 text-white">
						<div class="max-w-4xl space-y-4">
							<div
								class="inline-block px-3 py-1 {displayVideos[0].tags.includes('LIVE')
									? 'bg-red-600'
									: 'bg-missionnaire'} rounded-full text-xs font-bold uppercase tracking-widest mb-2"
							>
								{displayVideos[0].tags.includes('LIVE') ? $t('videos.liveBadge') : $t('videos.featured')}
							</div>
							<h2
								class="text-3xl md:text-5xl lg:text-6xl font-black leading-tight tracking-tight line-clamp-2 group-hover:text-stone-200 transition-colors"
							>
								{displayVideos[0].title}
							</h2>
							<p class="text-white/80 text-sm md:text-lg line-clamp-2 max-w-2xl font-medium">
								{displayVideos[0].description}
							</p>
							<div class="pt-6 flex items-center gap-4">
								<div
									class="px-8 py-4 bg-white text-black rounded-full font-bold text-sm uppercase tracking-wider transition-transform group-hover:scale-105 hidden sm:block"
								>
									{$t('videos.watchNow')}
								</div>
								<div
									class="px-8 py-4 bg-white/10 backdrop-blur-md text-white border border-white/20 rounded-full font-bold text-sm uppercase tracking-wider flex items-center gap-2"
								>
									<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
									{displayVideos[0].duration_string || $t('misc.video')}
								</div>
							</div>
						</div>
					</div>
				</button>
			{/if}

			{#if displayVideos.length > 0}
				<section class="mb-12">
					<div class="flex items-end justify-between mb-8 px-2">
						<div>
							<h2
								class="text-[10px] font-bold text-missionnaire uppercase tracking-[0.35em] mb-2 font-body"
							>
								{$t('footer.discover')}
							</h2>
							<h3 class="font-display text-2xl md:text-3xl font-semibold text-stone-900">
								{$t('videos.recentVideos')}
							</h3>
						</div>
					</div>

					<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
						{#each displayVideos.slice($selectedVideo ? 0 : 1) as video, index (video._id)}
							<button onclick={() => videoSelected(video)} class="text-left w-full">
								<ThumbnailVideo {video} index={index + ($selectedVideo ? 0 : 1)} />
							</button>
						{/each}
					</div>

					{#if hasMore}
						<div
							use:intersectionObserver
							class="flex flex-col items-center justify-center py-12 gap-3 mt-12"
						>
							{#if isLoadingMore}
								<div class="text-missionnaire animate-spin">
									<svg class="h-6 w-6" viewBox="0 0 24 24" fill="none">
										<circle
											cx="12"
											cy="12"
											r="10"
											stroke="currentColor"
											stroke-width="2"
											stroke-dasharray="40 60"
											stroke-linecap="round"
										/>
									</svg>
								</div>
								<p
									class="text-[10px] font-semibold uppercase tracking-[0.25em] text-missionnaire font-body"
								>
									{$t('list.loading')}
								</p>
							{/if}
						</div>
					{/if}

					{#if !hasMore && !isLoadingMore}
						<div class="text-center w-full py-20 opacity-50">
							<div class="w-16 h-1 bg-stone-200/60 mx-auto rounded-full mb-4"></div>
							<p class="text-xs font-bold uppercase tracking-widest text-stone-400 font-body">
								{$t('videos.endOfList')}
							</p>
						</div>
					{/if}
				</section>
			{:else}
				<div class="flex flex-col items-center justify-center py-32 text-center text-stone-400">
					<div
						class="w-16 h-16 bg-white/40 border border-stone-200/60 rounded-full flex items-center justify-center mb-4 text-2xl"
					>
						🔍
					</div>
					<p>{$t('videos.noVideos')}</p>
				</div>
			{/if}
		{/if}
	</div>
</main>
