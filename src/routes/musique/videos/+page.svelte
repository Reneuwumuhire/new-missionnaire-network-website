<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { YoutubeVideo } from '$lib/models/youtube';
	import SongVideoCard from '$lib/components/+songVideoCard.svelte';
	import LoadingRing from '$lib/components/LoadingRing.svelte';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsSearch from 'svelte-icons-pack/bs/BsSearch';
	import BsX from 'svelte-icons-pack/bs/BsX';
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';
	import {
		isVideoPlaylistActive,
		videoPlaylist,
		videoPlaylistIndex,
		isVideoShuffle,
		videoPlaylistSearch,
		videoPlaylistTotal
	} from '$lib/stores/global';
	import BsPlayCircleFill from 'svelte-icons-pack/bs/BsPlayCircleFill';
	import BsShuffle from 'svelte-icons-pack/bs/BsShuffle';
	import {
		getVideosCache,
		isVideosCacheFresh,
		setVideosCache,
		type VideosPageCacheEntry
	} from './listCache';

	export let data;

	let loadedVideos: YoutubeVideo[] = [];
	let total = 0;
	let skipCount = 0;
	let hasMore = true;
	let isLoading = false;
	let isInitialLoading = false;
	let initialLoadError = '';
	let hasResolved = false;
	let abortController: AbortController | null = null;
	let currentToken = 0;
	let lastHandledKey: string | null = null;

	let searchInput = '';
	let lastSearch = '';
	let isSearchLoading = false;

	$: initialVideos = ((data as any).videos || []) as YoutubeVideo[];
	$: initialTotal = ((data as any).total || 0) as number;
	$: currentSearch = ((data as any).search || '') as string;
	$: isDeferredData = Boolean((data as any).deferred);
	$: requestKey = currentSearch;

	function abortRequest() {
		abortController?.abort();
		abortController = null;
	}

	function applyData(payload: VideosPageCacheEntry) {
		loadedVideos = payload.videos;
		total = payload.total;
		skipCount = payload.skipCount;
		hasMore = payload.hasMore;
		lastSearch = currentSearch;
		searchInput = currentSearch;
		isSearchLoading = false;
		hasResolved = true;
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
			const queryParams = new URLSearchParams({
				type: 'song',
				search: currentSearch,
				maxResults: '20',
				skip: '0'
			});

			const response = await fetch(`/api/yt/videos?${queryParams.toString()}`, {
				signal: controller.signal
			});

			if (token !== currentToken || key !== requestKey) return;
			if (!response.ok) throw new Error('Impossible de charger les vidéos');

			const result = await response.json();
			const videos = (result.data || []) as YoutubeVideo[];
			const totalCount = (result.total || 0) as number;
			const cached = setVideosCache(key, {
				videos,
				total: totalCount,
				skipCount: videos.length,
				hasMore: videos.length < totalCount
			});
			applyData(cached);
			initialLoadError = '';
		} catch (error) {
			if ((error as Error).name === 'AbortError') return;
			if (token !== currentToken || key !== requestKey) return;
			initialLoadError =
				error instanceof Error ? error.message : 'Impossible de charger les vidéos';
		} finally {
			if (token === currentToken) isInitialLoading = false;
			if (abortController === controller) abortController = null;
		}
	}

	$: if (requestKey !== lastHandledKey) {
		lastHandledKey = requestKey;
		initialLoadError = '';

		const cachedEntry = getVideosCache(requestKey);

		if (!isDeferredData) {
			const seeded = setVideosCache(requestKey, {
				videos: initialVideos,
				total: initialTotal,
				skipCount: initialVideos.length,
				hasMore: initialVideos.length < initialTotal
			});
			abortRequest();
			applyData(seeded);
			isInitialLoading = false;
		} else if (cachedEntry) {
			applyData(cachedEntry);
			if (!isVideosCacheFresh(cachedEntry)) {
				void loadInitial({ showLoading: false });
			}
		} else {
			abortRequest();
			loadedVideos = [];
			total = 0;
			skipCount = 0;
			hasMore = true;
			hasResolved = false;
			searchInput = currentSearch;
			lastSearch = currentSearch;
			void loadInitial({ showLoading: true });
		}
	}

	onDestroy(() => {
		abortRequest();
		if (searchTimeout) clearTimeout(searchTimeout);
	});

	async function loadMoreVideos() {
		if (isLoading || !hasMore) return;
		isLoading = true;

		try {
			const queryParams = new URLSearchParams({
				type: 'song',
				search: lastSearch,
				maxResults: '20',
				skip: skipCount.toString()
			});

			const response = await fetch(`/api/yt/videos?${queryParams.toString()}`);
			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

			const result = await response.json();

			if (result.data && result.data.length > 0) {
				const newVideos = result.data.filter(
					(v: YoutubeVideo) => !loadedVideos.some((ev) => ev._id === v._id)
				);

				if (newVideos.length > 0) {
					loadedVideos = [...loadedVideos, ...newVideos];
					skipCount += result.data.length;
					hasMore = loadedVideos.length < result.total;
				} else {
					hasMore = false;
				}

				setVideosCache(lastSearch, {
					videos: loadedVideos,
					total: result.total ?? total,
					skipCount,
					hasMore
				});
			} else {
				hasMore = false;
				setVideosCache(lastSearch, {
					videos: loadedVideos,
					total,
					skipCount,
					hasMore: false
				});
			}
		} catch (error) {
			console.error('[Videos] Error loading more videos:', error);
			hasMore = false;
		} finally {
			isLoading = false;
		}
	}

	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	function handleSearch(immediate = false) {
		if (searchTimeout) clearTimeout(searchTimeout);

		const performSearch = () => {
			if (searchInput === lastSearch) {
				isSearchLoading = false;
				return;
			}
			isSearchLoading = true;
			goto(`?search=${encodeURIComponent(searchInput)}`, { keepFocus: true, noScroll: true });
		};

		if (immediate) {
			performSearch();
		} else {
			isSearchLoading = true;
			searchTimeout = setTimeout(performSearch, 400);
		}
	}

	function intersectionObserver(node: HTMLElement) {
		if (!browser) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) {
					if (hasMore && !isLoading) {
						loadMoreVideos();
					}
				}
			},
			{ threshold: 0.1, rootMargin: '400px' }
		);

		observer.observe(node);

		return {
			destroy() {
				observer.disconnect();
			}
		};
	}

	function playAll() {
		if (loadedVideos.length === 0) return;
		videoPlaylist.set([...loadedVideos]);
		videoPlaylistIndex.set(0);
		videoPlaylistSearch.set(lastSearch);
		videoPlaylistTotal.set(total);
		isVideoShuffle.set(false);
		isVideoPlaylistActive.set(true);
	}

	function playFromIndex(index: number) {
		videoPlaylist.set([...loadedVideos]);
		videoPlaylistIndex.set(index);
		videoPlaylistSearch.set(lastSearch);
		videoPlaylistTotal.set(total);
		isVideoShuffle.set(false);
		isVideoPlaylistActive.set(true);
	}

	function shuffleAll() {
		if (loadedVideos.length === 0) return;
		const list = [...loadedVideos];
		for (let i = list.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[list[i], list[j]] = [list[j], list[i]];
		}
		videoPlaylist.set(list);
		videoPlaylistIndex.set(0);
		videoPlaylistSearch.set(lastSearch);
		videoPlaylistTotal.set(total);
		isVideoShuffle.set(true);
		isVideoPlaylistActive.set(true);
	}
</script>

<svelte:head>
	<title>Chants en Vidéo - Missionnaire Network</title>
	<meta
		name="description"
		content="Regardez les chants en vidéo du Message, avec recherche et lecture continue sur Missionnaire Network."
	/>
	<meta property="og:title" content="Chants en Vidéo - Missionnaire Network" />
	<meta
		property="og:description"
		content="Catalogue de chants en vidéo pour votre adoration quotidienne."
	/>
</svelte:head>

<div class="w-full min-w-0 max-w-6xl mx-auto px-4 md:px-6 py-8">
	<!-- Page Header -->
	<div class="mb-10">
		<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-3 font-body">
			Cantiques & Vidéo
		</p>
		<h1 class="font-display text-3xl md:text-4xl font-semibold text-stone-900">
			Chants en Vidéo
		</h1>
		{#if hasResolved && total}
			<p class="mt-2 text-[12px] text-stone-400 font-body">
				<span
					class="font-display text-missionnaire text-base font-semibold align-middle tabular-nums"
					>{total}</span
				>
				vidéo{total > 1 ? 's' : ''} disponible{total > 1 ? 's' : ''}
			</p>
		{:else if !hasResolved}
			<p class="mt-2">
				<span class="inline-block h-3 w-32 rounded-full bg-stone-200 animate-pulse"></span>
			</p>
		{/if}
	</div>

	<!-- Controls Row -->
	<div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
		<div class="flex items-center gap-6">
			<button
				on:click={playAll}
				class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-missionnaire hover:text-missionnaire/80 transition-colors active:scale-95 font-body disabled:opacity-50 disabled:cursor-not-allowed"
				disabled={loadedVideos.length === 0}
			>
				<Icon src={BsPlayCircleFill} size="14" />
				Tout Lire
			</button>
			<button
				on:click={shuffleAll}
				class="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400 hover:text-missionnaire transition-colors active:scale-95 font-body disabled:opacity-50 disabled:cursor-not-allowed"
				disabled={loadedVideos.length === 0}
			>
				<Icon src={BsShuffle} size="13" />
				Aléatoire
			</button>
		</div>

		<div class="relative w-full md:w-96">
			<div class="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400">
				<Icon src={BsSearch} size="14" />
			</div>
			<input
				type="text"
				placeholder="Rechercher une vidéo..."
				class="w-full border border-stone-200/80 bg-white pl-9 pr-24 py-2.5 text-sm font-body text-stone-800 placeholder:text-stone-400 focus:border-missionnaire/40 focus:outline-none focus:ring-1 focus:ring-missionnaire/30 transition-colors"
				bind:value={searchInput}
				on:input={() => handleSearch()}
			/>
			{#if isSearchLoading}
				<LoadingRing
					size={16}
					className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center text-missionnaire/90"
				/>
			{:else if searchInput}
				<button
					class="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-missionnaire transition-colors p-1"
					on:click={() => {
						searchInput = '';
						handleSearch(true);
					}}
					aria-label="Effacer la recherche"
				>
					<Icon src={BsX} size="16" />
				</button>
			{/if}
		</div>
	</div>

	{#if isInitialLoading && !hasResolved}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			{#each Array.from({ length: 9 }) as _}
				<div class="animate-pulse">
					<div class="aspect-video bg-stone-200 rounded"></div>
					<div class="mt-3 space-y-2">
						<div class="h-4 w-3/4 rounded-full bg-stone-200"></div>
						<div class="h-3 w-1/2 rounded-full bg-stone-100"></div>
					</div>
				</div>
			{/each}
		</div>
	{:else if initialLoadError && !hasResolved}
		<div class="py-20 text-center bg-white/40 border border-stone-200/60">
			<div class="text-stone-200 mb-4 flex justify-center">
				<Icon src={BsSearch} size="56" />
			</div>
			<p class="text-stone-500 font-bold uppercase tracking-widest text-sm">
				La liste n'a pas pu charger
			</p>
			<p class="mt-2 text-xs text-stone-400">{initialLoadError}</p>
			<button
				class="mt-5 inline-flex items-center rounded-full border border-missionnaire px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-missionnaire transition-colors hover:bg-missionnaire/5"
				on:click={() => void loadInitial({ showLoading: true })}
			>
				Réessayer
			</button>
		</div>
	{:else if loadedVideos.length > 0}
		<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
			{#each loadedVideos as video, i (video._id)}
				<SongVideoCard videoData={video} on:playPlaylist={() => playFromIndex(i)} />
			{/each}
		</div>

		{#if hasMore}
			<div use:intersectionObserver class="flex flex-col items-center justify-center py-12 gap-3">
				{#if isLoading}
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
						Chargement...
					</p>
				{:else}
					<button
						on:click={loadMoreVideos}
						class="text-[10px] font-bold text-stone-400 hover:text-missionnaire uppercase tracking-[0.18em] transition-colors font-body"
					>
						Charger plus de vidéos
					</button>
				{/if}
			</div>
		{:else}
			<div class="text-center py-16 mt-10 border-t border-stone-200/60">
				<p class="text-[10px] font-bold text-stone-300 uppercase tracking-[0.4em] font-body">
					Fin de la collection
				</p>
			</div>
		{/if}
	{:else}
		<div class="py-32 text-center bg-white/40 border border-stone-200/60">
			<div class="text-stone-200 mb-5 flex justify-center">
				<Icon src={BsSearch} size="56" />
			</div>
			<p class="text-stone-500 font-bold uppercase tracking-[0.2em] text-sm font-body">
				{lastSearch ? `Aucune vidéo trouvée pour "${lastSearch}"` : 'Aucune vidéo trouvée'}
			</p>
			{#if lastSearch}
				<button
					on:click={() => {
						searchInput = '';
						handleSearch(true);
					}}
					class="mt-5 inline-flex items-center rounded-full border border-missionnaire px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-missionnaire transition-colors hover:bg-missionnaire/5 font-body"
				>
					Voir tout
				</button>
			{/if}
		</div>
	{/if}
</div>
