<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { MusicAudio } from '$lib/models/music-audio';
	import type { AudioAsset } from '$lib/models/media-assets';
	import type { Sermon } from '$lib/models/sermon';
	import {
		selectAudio,
		basePlaylist,
		playlist,
		currentIndex,
		autoNext,
		isShuffle,
		isPlaying
	} from '$lib/stores/global';
	import Pagination from '$lib/components/Pagination.svelte';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsSearch from 'svelte-icons-pack/bs/BsSearch';
	import BsPlayFill from 'svelte-icons-pack/bs/BsPlayFill';
	import BsArrowUp from 'svelte-icons-pack/bs/BsArrowUp';
	import BsArrowDown from 'svelte-icons-pack/bs/BsArrowDown';
	import BsX from 'svelte-icons-pack/bs/BsX';
	import BsShuffle from 'svelte-icons-pack/bs/BsShuffle';

	import IoCloudDownloadOutline from 'svelte-icons-pack/io/IoCloudDownloadOutline';
	import IoPlayCircle from 'svelte-icons-pack/io/IoPlayCircle';
	import IoPauseCircle from 'svelte-icons-pack/io/IoPauseCircle';
	import BsHeartFill from 'svelte-icons-pack/bs/BsHeartFill';
	import BsHeart from 'svelte-icons-pack/bs/BsHeart';
	import BsClockHistory from 'svelte-icons-pack/bs/BsClockHistory';
	import { formatTime } from '../../utils/FormatTime';
	import { dispatchAudioPlayerAction } from '$lib/utils/audioPlayerControls';
	import {
		addToRecentlyPlayed,
		toggleFavorite,
		isFavorite,
		recentlyPlayed,
		favorites
	} from '$lib/stores/musicHistory';
	// ── BEGIN: cached filter imports (added) ──────────────────────
	import { onDestroy, onMount } from 'svelte';
	import { cachedUrls, refreshCachedUrls, isUrlCached } from '$lib/audioCache';
	import IoCloudDoneOutline from 'svelte-icons-pack/io/IoCloudDoneOutline';
	import {
		areMusicArtistsCached,
		getMusicArtistsCache,
		getMusicPageCache,
		isMusicPageCacheFresh,
		setMusicArtistsCache,
		setMusicPageCache
	} from './listCache';
	// ── END: cached filter imports ────────────────────────────────

	type MusicAudioApiResponse = {
		data: MusicAudio[];
		total: number;
		error?: string | null;
	};

	type MusicArtistsApiResponse = {
		data: string[];
		error?: string | null;
	};

	export let data;

	let musicList: MusicAudio[] = [];
	let musicPlaylist: MusicAudio[] = [];
	let artists: string[] = [];
	let totalSongs = 0;
	let isListLoading = false;
	let listLoadError = '';
	let hasResolvedMusicList = false;
	let musicListAbortController: AbortController | null = null;
	let currentListRequestToken = 0;
	let lastHandledMusicRequestKey = '';

	$: initialMusicList = ((data as any).musicAudio || []) as MusicAudio[];
	$: initialPlaylist = ((data as any).playlistAudio || initialMusicList || []) as MusicAudio[];
	$: initialArtists = ((data as any).artists || []) as string[];
	$: initialTotalSongs = ((data as any).total || 0) as number;
	$: currentCategory = (data as any).category;
	$: currentSearch = (data as any).search;
	$: currentAlpha = (data as any).alpha;
	$: currentSort = (data as any).sort || 'uploaded_at:desc';
	$: currentSeed = (data as any).seed || '';
	$: currentArtist = (data as any).artist;
	$: currentPage = (data as any).page;
	$: limit = (data as any).limit;
	$: isDeferredData = Boolean((data as any).deferred);
	$: musicRequestKey = JSON.stringify({
		category: currentCategory || 'All',
		search: currentSearch || '',
		alpha: currentAlpha || '',
		artist: currentArtist || '',
		pageNumber: currentPage || 1,
		limit: limit || 100,
		sort: currentSort || 'uploaded_at:desc',
		seed: currentSeed || ''
	});
	$: totalPages = Math.ceil(totalSongs / limit);

	let isArtistMenuOpen = false;
	let artistSearch = '';
	let showFavorites = false;
	let showRecent = false;
	// ── BEGIN: cached filter state (added) ────────────────────────
	let showCached = false;

	function buildMusicRequestParams() {
		const params = new URLSearchParams({
			category: currentCategory || 'All',
			search: currentSearch || '',
			alpha: currentAlpha || '',
			artist: currentArtist || '',
			pageNumber: String(currentPage || 1),
			limit: String(limit || 100),
			sort: currentSort || 'uploaded_at:desc'
		});

		if (currentSeed) {
			params.set('seed', currentSeed);
		}

		return params;
	}

	function abortMusicListRequest() {
		musicListAbortController?.abort();
		musicListAbortController = null;
	}

	function applyMusicData(payload: {
		musicAudio: MusicAudio[];
		playlistAudio?: MusicAudio[];
		artists?: string[];
		total: number;
	}) {
		musicList = payload.musicAudio;
		musicPlaylist = payload.playlistAudio || payload.musicAudio;
		artists = payload.artists || [];
		totalSongs = payload.total;
		hasResolvedMusicList = true;
	}

	async function loadMusicListInBackground(options?: { showLoading?: boolean }) {
		const showLoading = options?.showLoading ?? true;
		const requestKey = musicRequestKey;
		const requestToken = ++currentListRequestToken;
		const requestParams = buildMusicRequestParams();
		const shouldFetchArtists = !areMusicArtistsCached() || artists.length === 0;
		const controller = new AbortController();

		abortMusicListRequest();
		musicListAbortController = controller;
		if (showLoading || !hasResolvedMusicList) {
			isListLoading = true;
		}

		try {
			const musicResponsePromise = fetch(`/api/music-audio?${requestParams.toString()}`, {
				signal: controller.signal
			});
			const artistsResponsePromise = shouldFetchArtists
				? fetch('/api/music-artists', { signal: controller.signal })
				: Promise.resolve(null);
			const [musicResponse, artistsResponse] = await Promise.all([
				musicResponsePromise,
				artistsResponsePromise
			]);

			if (!musicResponse.ok) {
				throw new Error('Impossible de charger la liste de musique');
			}

			const musicResult = (await musicResponse.json()) as MusicAudioApiResponse;
			if (musicResult.error) {
				throw new Error(musicResult.error);
			}

			let nextArtists = getMusicArtistsCache() || artists;
			if (artistsResponse) {
				if (!artistsResponse.ok) {
					throw new Error('Impossible de charger les artistes');
				}

				const artistsResult = (await artistsResponse.json()) as MusicArtistsApiResponse;
				if (artistsResult.error) {
					throw new Error(artistsResult.error);
				}

				nextArtists = setMusicArtistsCache(artistsResult.data || []);
			}

			if (requestToken !== currentListRequestToken || requestKey !== musicRequestKey) return;

			const cachedEntry = setMusicPageCache(requestKey, {
				musicAudio: musicResult.data || [],
				playlistAudio: musicResult.data || [],
				artists: nextArtists || [],
				total: musicResult.total || 0
			});

			applyMusicData(cachedEntry);
			listLoadError = '';
		} catch (error) {
			if ((error as Error).name === 'AbortError') return;
			if (requestToken !== currentListRequestToken || requestKey !== musicRequestKey) return;

			listLoadError =
				error instanceof Error ? error.message : 'Impossible de charger la liste de musique';

			if (!hasResolvedMusicList) {
				musicList = [];
				musicPlaylist = [];
				totalSongs = 0;
			}
		} finally {
			if (requestToken === currentListRequestToken) {
				isListLoading = false;
			}
			if (musicListAbortController === controller) {
				musicListAbortController = null;
			}
		}
	}

	$: if (musicRequestKey && musicRequestKey !== lastHandledMusicRequestKey) {
		lastHandledMusicRequestKey = musicRequestKey;
		listLoadError = '';

		const cachedArtists = getMusicArtistsCache() || [];
		const cachedEntry = getMusicPageCache(musicRequestKey);

		if (!isDeferredData) {
			const nextArtists = initialArtists.length > 0 ? initialArtists : cachedArtists;
			const seededEntry = setMusicPageCache(musicRequestKey, {
				musicAudio: initialMusicList,
				playlistAudio: initialPlaylist,
				artists: nextArtists,
				total: initialTotalSongs
			});

			if (nextArtists.length > 0) {
				setMusicArtistsCache(nextArtists, seededEntry.fetchedAt);
			}

			abortMusicListRequest();
			applyMusicData(seededEntry);
			isListLoading = false;
		} else if (cachedEntry) {
			applyMusicData({
				...cachedEntry,
				artists: cachedEntry.artists.length > 0 ? cachedEntry.artists : cachedArtists
			});
			void loadMusicListInBackground({ showLoading: !isMusicPageCacheFresh(cachedEntry) });
		} else {
			abortMusicListRequest();
			musicList = [];
			musicPlaylist = [];
			artists = cachedArtists;
			totalSongs = 0;
			hasResolvedMusicList = false;
			void loadMusicListInBackground({ showLoading: true });
		}
	}

	onMount(() => {
		void refreshCachedUrls();
	});

	onDestroy(() => {
		if (cacheRefreshTimer) clearTimeout(cacheRefreshTimer);
		abortMusicListRequest();
	});

	// Re-check the cache every time a track starts playing — gives the
	// SW a moment to write the response, then surfaces the new entry in
	// the "En cache" panel without a manual refresh.
	let cacheRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	$: if ($selectAudio) {
		if (cacheRefreshTimer) clearTimeout(cacheRefreshTimer);
		cacheRefreshTimer = setTimeout(() => void refreshCachedUrls(), 1500);
	}

	// Build a deduplicated list of cached songs by combining metadata
	// sources we have (favorites, recently played, current page) and
	// keeping only those whose URL is in the cache. Songs cached but
	// missing from all three sources won't appear — but in practice a
	// song must be played to be cached, so it's almost always either
	// in recently-played (last 20) or favorites.
	$: cachedSongs = (() => {
		const set = $cachedUrls;
		if (set.size === 0)
			return [] as Array<{
				id: string;
				title: string;
				artist?: string;
				category?: string;
				s3_url?: string;
				song?: MusicAudio;
			}>;

		const seen = new Set<string>();
		const out: Array<{
			id: string;
			title: string;
			artist?: string;
			category?: string;
			s3_url?: string;
			song?: MusicAudio;
		}> = [];

		const pushIfCached = (
			id: string,
			title: string,
			s3_url: string | null | undefined,
			artist: string | null | undefined,
			category: string | null | undefined,
			song?: MusicAudio
		) => {
			if (!id || seen.has(id)) return;
			if (!s3_url || !isUrlCached(s3_url, set)) return;
			seen.add(id);
			out.push({
				id,
				title,
				artist: artist ?? undefined,
				category: category ?? undefined,
				s3_url,
				song
			});
		};

		// Favorites first (most intentionally retained), then recents,
		// then current page — preserves a sensible default ordering.
		for (const fav of $favorites) {
			pushIfCached(fav.id, fav.title, fav.s3_url, fav.artist, fav.category);
		}
		for (const rec of $recentlyPlayed) {
			pushIfCached(rec.id, rec.title, rec.s3_url, rec.artist, rec.category);
		}
		for (const song of (musicPlaylist || []) as MusicAudio[]) {
			const id = song._id || song.s3_url || '';
			pushIfCached(id, song.title || 'Sans titre', song.s3_url, song.artist, song.category, song);
		}

		return out;
	})();

	$: cachedCount = cachedSongs.length;
	// ── END: cached filter state ──────────────────────────────────

	function findSongById(list: MusicAudio[], id: string): MusicAudio | undefined {
		return list.find((s) => (s._id || s.s3_url) === id);
	}

	function playAllFavorites() {
		const favSongs = $favorites
			.map((fav) => findSongById(musicPlaylist, fav.id))
			.filter(Boolean) as MusicAudio[];
		if (favSongs.length === 0) return;
		basePlaylist.set(favSongs);
		playlist.set(favSongs);
		currentIndex.set(0);
		selectAudio.set(favSongs[0]);
		isPlaying.set(true);
		addToRecentlyPlayed(favSongs[0] as any);
	}

	// ── BEGIN: play all cached (added) ────────────────────────────
	// Resolves each cached entry to its full MusicAudio (either from
	// the row itself or via the current page's playlist) and plays
	// them as a temporary playlist. Same constraint as Favoris "Tout
	// lire": entries whose full song record isn't currently loaded
	// are skipped — they'd need their playlist page to be visited.
	function playAllCached() {
		const songs = cachedSongs
			.map((item) => item.song ?? findSongById(musicPlaylist, item.id))
			.filter(Boolean) as MusicAudio[];
		if (songs.length === 0) return;
		basePlaylist.set(songs);
		playlist.set(songs);
		currentIndex.set(0);
		selectAudio.set(songs[0]);
		isPlaying.set(true);
		addToRecentlyPlayed(songs[0] as any);
	}

	$: cachedPlayableCount = cachedSongs.reduce(
		(n, item) => n + ((item.song ?? findSongById(musicPlaylist, item.id)) ? 1 : 0),
		0
	);
	// ── END: play all cached ──────────────────────────────────────
	$: filteredArtists = artists.filter((a: string) =>
		a.toLowerCase().includes(artistSearch.toLowerCase())
	);
	$: playlistIndexByUrl = new Map<string, number>(
		(musicPlaylist || []).map((song: MusicAudio, index: number) => [song.s3_url, index])
	);
	$: activeMusicSong = isMusicAudio($selectAudio) ? $selectAudio : null;
	$: activeMusicSongIndex = activeMusicSong
		? (playlistIndexByUrl.get(activeMusicSong.s3_url) ?? -1)
		: -1;
	$: isActiveMusicSongVisible =
		!!activeMusicSong &&
		(musicList || []).some((song: MusicAudio) => song.s3_url === activeMusicSong.s3_url);
	$: activeMusicSongPage =
		activeMusicSongIndex >= 0 ? Math.floor(activeMusicSongIndex / limit) + 1 : null;

	let searchInput = currentSearch;

	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

	const categories = [
		'All',
		'Sur les Ailes de la Foi',
		'Agakiza',
		'Gushimisha',
		'Cantique Collection',
		'Chants de Victoire',
		'Chorus',
		"Iz'i Gisenyi",
		'Izindi',
		'Nyimbo za Mungu',
		'Tenzi za Roho',
		'Umuco',
		'Nyimbo za Wokovu',
		'Ikirundi',
		'Impimbano',
		'Kolwezi'
	];
	const desktopMusicGrid =
		'md:grid-cols-[28px_minmax(0,2fr)_minmax(0,0.95fr)_minmax(0,0.85fr)_58px_28px_36px_36px] lg:grid-cols-[30px_minmax(0,2.2fr)_minmax(0,1.05fr)_minmax(0,0.95fr)_68px_32px_40px_40px] xl:grid-cols-[30px_minmax(0,2.5fr)_minmax(0,1.2fr)_minmax(0,1fr)_80px_32px_40px_40px]';
	$: isRandomListOrder = currentSort.split(/[: ,]/)[0] === 'random';

	// Sync playlist when songs are loaded
	$: if (hasResolvedMusicList) {
		const shouldPreserveActiveQueue =
			(!!$selectAudio && !activeMusicSong) || (!!activeMusicSong && !isActiveMusicSongVisible);
		if (!shouldPreserveActiveQueue) {
			basePlaylist.set(musicPlaylist);
			if (!$isShuffle) {
				playlist.set(musicPlaylist);
				if (activeMusicSong) {
					const nextIndex = playlistIndexByUrl.get(activeMusicSong.s3_url);
					if (nextIndex !== undefined) {
						currentIndex.set(nextIndex);
					}
				}
			}
		}
	}

	function createPlaylistSeed() {
		return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
	}

	function getEffectiveSort(params: URLSearchParams) {
		const explicitSort = params.get('sort');
		if (explicitSort) return explicitSort;

		const nextCategory = params.get('category') || currentCategory || 'All';
		const nextSearch = params.get('search') || '';
		const nextAlpha = params.get('alpha') || '';
		const nextArtist = params.get('artist') || '';

		if (nextCategory === 'All' && !nextSearch && !nextAlpha && !nextArtist) {
			return 'random';
		}

		return 'uploaded_at:desc';
	}

	function syncSeedParam(params: URLSearchParams) {
		if (getEffectiveSort(params).split(/[: ,]/)[0] === 'random') {
			params.set('seed', params.get('seed') || currentSeed || createPlaylistSeed());
			return;
		}

		params.delete('seed');
	}

	function handleSearch() {
		const params = new URLSearchParams($page.url.searchParams);
		if (searchInput) {
			params.set('search', searchInput);
		} else {
			params.delete('search');
		}
		params.delete('alpha'); // Search clears alphabetical filter
		params.delete('artist'); // Search clears artist filter
		params.set('page', '1');
		syncSeedParam(params);
		goto(`?${params.toString()}`);
	}

	function handleArtistChange(artist: string) {
		const params = new URLSearchParams($page.url.searchParams);
		if (currentArtist === artist) {
			params.delete('artist');
		} else {
			params.set('artist', artist);
		}
		params.delete('search');
		params.delete('alpha');
		params.set('page', '1');
		syncSeedParam(params);
		goto(`?${params.toString()}`);
	}

	function handleAlphaChange(letter: string) {
		const params = new URLSearchParams($page.url.searchParams);
		if (currentAlpha === letter) {
			params.delete('alpha');
		} else {
			params.set('alpha', letter);
		}
		params.delete('search'); // Alphabetical filter clears search
		params.delete('artist'); // Alphabetical filter clears artist
		params.set('page', '1');
		syncSeedParam(params);
		goto(`?${params.toString()}`);
	}

	function handleCategoryChange(category: string) {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('category', category);
		params.delete('artist');
		params.set('page', '1');

		// If switching to 'All' (Tout Voir), remove explicit sort to allow default random shuffle
		if (category === 'All') {
			params.delete('sort');
		} else {
			// For specific categories, default to recent uploads if no sort exists,
			// or keep existing sort?
			// Better to keep existing sort if user chose one?
			// Or maybe reset to default (uploaded_at) for cleaner UX?
			// Let's just remove sort for 'All' which triggers the +page.ts default 'random'.
			// For others, if we keep sort, it might be random?
			// If sort was 'random' and we switch to 'Umuco', we probably want 'uploaded_at' or 'title'.
			// 'random' is only handled for 'All' in +page.ts default.
			// But if we keep 'sort=random' in URL, backend handles proper random for categories too?
			// Backend: `if (property === 'random')` works for any query.
			// So random sort works for categories too!
			// Does the user *want* that? "in the list when it is Voir tous".
			// Maybe for specific collections they want order?
			// Let's explicitly remove 'sort' if it was 'random' when switching categories, or just always reset sort on category change?
			// Common pattern: Category change resets sort to default.
			params.delete('sort');
		}

		syncSeedParam(params);
		goto(`?${params.toString()}`);
	}

	function handleSortChange(property: string) {
		const params = new URLSearchParams($page.url.searchParams);

		if (property === 'random') {
			params.set('sort', 'random');
			params.set('seed', createPlaylistSeed());
			params.set('page', '1');
			goto(`?${params.toString()}`);
			return;
		}

		const current = params.get('sort') || 'uploaded_at:desc';
		const [currentProp, currentOrder] = current.split(':');

		let nextOrder = 'desc';
		if (currentProp === property) {
			nextOrder = currentOrder === 'desc' ? 'asc' : 'desc';
		} else {
			// Default to ASC for Titre and Artiste, DESC for everything else (dates, duration)
			nextOrder =
				property === 'title' || property === 'artist' || property === 'category' ? 'asc' : 'desc';
		}

		params.set('sort', `${property}:${nextOrder}`);
		params.set('page', '1');
		syncSeedParam(params);
		goto(`?${params.toString()}`);
	}

	function refreshRandomList() {
		const params = new URLSearchParams($page.url.searchParams);
		params.set('sort', 'random');
		params.set('seed', createPlaylistSeed());
		params.set('page', '1');
		goto(`?${params.toString()}`);
	}

	function shuffleQueueWithFirstSong(songs: MusicAudio[], firstSong: MusicAudio) {
		const rest = songs.filter((song) => song.s3_url !== firstSong.s3_url);
		for (let i = rest.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[rest[i], rest[j]] = [rest[j], rest[i]];
		}
		return [firstSong, ...rest];
	}

	function playSong(song: MusicAudio) {
		const queueSource =
			musicPlaylist.length > 0 ? musicPlaylist : musicList.length > 0 ? musicList : [song];
		const queue = queueSource.some((item) => item.s3_url === song.s3_url)
			? queueSource
			: [song, ...queueSource];

		basePlaylist.set(queue);
		if ($isShuffle && queue.length > 1) {
			playlist.set(shuffleQueueWithFirstSong(queue, song));
			currentIndex.set(0);
		} else {
			playlist.set(queue);
			currentIndex.set(
				Math.max(
					0,
					queue.findIndex((item) => item.s3_url === song.s3_url)
				)
			);
		}
		selectAudio.set(song);
		isPlaying.set(true);
		addToRecentlyPlayed(song as any);
	}

	function isMusicAudio(current: MusicAudio | AudioAsset | Sermon | null): current is MusicAudio {
		return !!current && 's3_url' in current;
	}

	function goToActiveSongPage() {
		if (!activeMusicSongPage || activeMusicSongPage === currentPage) return;
		const params = new URLSearchParams($page.url.searchParams);
		params.set('page', activeMusicSongPage.toString());
		syncSeedParam(params);
		goto(`?${params.toString()}`);
	}

	async function downloadSong(song: MusicAudio) {
		try {
			const url = song.s3_url;
			const response = await fetch(url);
			if (!response.ok) throw new Error('Download failed');
			const blob = await response.blob();
			const blobUrl = window.URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = blobUrl;
			a.download = `${song.title || 'chant'}.mp3`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			window.URL.revokeObjectURL(blobUrl);
		} catch (error) {
			console.error('Download failed, trying direct link:', error);
			// Fallback: Open in new tab which usually triggers download or opens the file
			window.open(song.s3_url, '_blank');
		}
	}
	function isSongActive(song: MusicAudio, current: MusicAudio | AudioAsset | Sermon | null) {
		if (!current) return false;
		const activeUrl =
			's3_url' in current
				? current.s3_url
				: 'mp3_url' in current
					? current.mp3_url
					: (current as any).url;
		const songUrl = 's3_url' in song ? song.s3_url : (song as any).url;
		return activeUrl === songUrl;
	}
</script>

<svelte:head>
	<title>Cantiques et Louanges - Missionnaire Network | Musique du Message</title>
	<meta
		name="description"
		content="Ecoutez les cantiques, louanges et adorations du Message de l'Heure sur Missionnaire Network. Une collection riche pour votre adoration quotidienne."
	/>
	<meta
		property="og:title"
		content="Cantiques et Louanges - Missionnaire Network | Musique du Message"
	/>
	<meta
		property="og:description"
		content="Ecoutez les cantiques, louanges et adorations du Message de l'Heure sur Missionnaire Network. Une collection riche pour votre adoration quotidienne."
	/>
</svelte:head>

<div class="w-full min-w-0 max-w-6xl mx-auto px-4 pt-0 pb-8 md:px-6">
	<!-- Page Header -->
	<div class="mb-10">
		<p class="text-[10px] font-bold uppercase tracking-[0.35em] text-missionnaire mb-3 font-body">
			Cantiques & Louange
		</p>
		<h1 class="font-display text-3xl md:text-4xl font-semibold text-stone-900">Musique</h1>
	</div>

	<!-- Alpha Filter -->
	<div class="mb-10">
		<h2
			class="text-[10px] md:text-xs font-bold text-missionnaire uppercase tracking-[0.35em] mb-4 font-body"
		>
			Par ordre alphabétique
		</h2>
		<div class="flex flex-wrap gap-x-4 gap-y-2">
			{#each alphabet as letter}
				<button
					class="text-[11px] font-body font-bold transition-all {currentAlpha === letter
						? 'text-missionnaire font-semibold'
						: 'text-stone-400 hover:text-missionnaire'}"
					on:click={() => handleAlphaChange(letter)}
				>
					{letter}
				</button>
			{/each}
		</div>
	</div>

	<div class="mb-12">
		<h2
			class="text-[10px] md:text-xs font-bold text-missionnaire uppercase tracking-[0.35em] mb-4 font-body"
		>
			Recueils
		</h2>
		<div
			class="flex overflow-x-auto pb-4 gap-2.5 md:gap-3 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 md:pb-0"
			style="scrollbar-width: none; -ms-overflow-style: none;"
		>
			{#each categories as category}
				<button
					class="flex-shrink-0 px-4 md:px-5 py-2 md:py-2.5 text-[10px] md:text-[11px] font-bold uppercase tracking-[0.16em] md:tracking-wider transition-all border {currentCategory ===
					category
						? 'border-missionnaire text-missionnaire bg-missionnaire/5'
						: 'bg-white/40 text-stone-500 border-stone-200/60 hover:border-missionnaire hover:text-missionnaire'}"
					on:click={() => handleCategoryChange(category)}
				>
					{category === 'All' ? 'Tout Voir' : category}
				</button>
			{/each}
		</div>
	</div>

	<!-- List Title and Mobile Filters -->
	<div class="flex flex-col gap-2 mb-6">
		<div class="flex items-center justify-between gap-3">
			<div class="flex items-center gap-2">
				<h2 class="font-display text-3xl font-bold text-stone-900">List</h2>
				{#if isRandomListOrder}
					<button
						class="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500 transition-colors hover:border-missionnaire hover:text-missionnaire"
						on:click={refreshRandomList}
						title="Rafraîchir l'ordre aléatoire"
					>
						<Icon src={BsShuffle} size="11" />
						Rafraîchir
					</button>
				{/if}
			</div>
			<!-- Mobile Artist Filter Toggle -->
			<div class="flex items-center gap-2">
				{#if isRandomListOrder}
					<button
						class="sm:hidden inline-flex items-center justify-center rounded-full border border-stone-200 bg-white p-2 text-stone-500 transition-colors hover:border-missionnaire hover:text-missionnaire"
						on:click={refreshRandomList}
						title="Rafraîchir l'ordre aléatoire"
					>
						<Icon src={BsShuffle} size="13" />
					</button>
				{/if}
				<div class="relative md:hidden">
					<button
						class="flex items-center gap-2 bg-white border border-stone-200 text-stone-600 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm active:scale-95 transition-transform"
						on:click|stopPropagation={() => (isArtistMenuOpen = !isArtistMenuOpen)}
					>
						<Icon src={BsSearch} size="12" />
						Artiste
					</button>
					{#if isArtistMenuOpen}
						<!-- svelte-ignore a11y-no-static-element-interactions -->
						<!-- svelte-ignore a11y-click-events-have-key-events -->
						<div
							class="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-stone-200 p-3 z-50 normal-case tracking-normal"
							on:click|stopPropagation
						>
							<div class="flex items-center gap-2 bg-stone-50 px-2 py-1.5 rounded-lg mb-2">
								<Icon src={BsSearch} size="12" color="#999" />
								<input
									type="text"
									placeholder="Rechercher un artiste..."
									class="bg-transparent border-none outline-none text-xs w-full text-stone-700 placeholder:text-stone-400"
									bind:value={artistSearch}
								/>
							</div>

							<div class="max-h-60 overflow-y-auto space-y-1 custom-scrollbar">
								{#if filteredArtists.length === 0}
									<div class="px-3 py-4 text-xs text-stone-400 text-center italic">
										Aucun artiste trouvé
									</div>
								{:else}
									<button
										class="w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors {!currentArtist
											? 'bg-stone-100 text-missionnaire'
											: 'text-stone-500 hover:bg-stone-50'}"
										on:click={() => {
											handleArtistChange('');
											isArtistMenuOpen = false;
										}}
									>
										Tous les artistes
									</button>
									{#each filteredArtists as artist}
										<button
											class="w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors {currentArtist ===
											artist
												? 'bg-stone-100 text-missionnaire font-bold'
												: 'text-stone-600 hover:bg-stone-50'}"
											on:click={() => {
												handleArtistChange(artist);
												isArtistMenuOpen = false;
											}}
										>
											{artist}
										</button>
									{/each}
								{/if}
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<!-- Active Filters (Mobile Only) -->
		{#if currentArtist || (currentCategory && currentCategory !== 'All')}
			<div class="md:hidden flex flex-wrap gap-2">
				{#if currentCategory && currentCategory !== 'All'}
					<button
						class="flex items-center gap-1.5 bg-stone-200 text-missionnaire px-3 py-1.5 rounded-full text-xs font-semibold"
						on:click={() => handleCategoryChange('All')}
					>
						<span>{currentCategory}</span>
						<Icon src={BsX} size="14" />
					</button>
				{/if}
				{#if currentArtist}
					<button
						class="flex items-center gap-1.5 bg-stone-200 text-missionnaire px-3 py-1.5 rounded-full text-xs font-semibold"
						on:click={() => handleArtistChange('')}
					>
						<span class="max-w-[150px] truncate">{currentArtist}</span>
						<Icon src={BsX} size="14" />
					</button>
				{/if}
			</div>
		{/if}
	</div>

	{#if activeMusicSong && !isActiveMusicSongVisible}
		<div class="mb-4 border border-stone-300 bg-stone-100/80 px-4 py-3">
			<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div class="min-w-0">
					<div class="text-[10px] font-semibold uppercase tracking-[0.25em] text-missionnaire">
						Lecture en cours
					</div>
					<div class="mt-1 truncate text-sm font-bold text-stone-900">
						{activeMusicSong.title || 'Sans titre'}
					</div>
					<div class="mt-1 text-[11px] font-medium text-stone-500">
						{activeMusicSong.artist ||
							activeMusicSong.book_full_name ||
							activeMusicSong.category ||
							'Missionnaire'}
						{#if activeMusicSongPage}
							<span class="mx-1 text-stone-300">•</span>
							<span>Page {activeMusicSongPage}</span>
						{/if}
					</div>
				</div>

				<div class="flex items-center gap-2">
					<button
						class="flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-bold text-missionnaire shadow-sm transition-colors hover:bg-stone-200"
						on:click={() => dispatchAudioPlayerAction('toggle')}
						title={$isPlaying ? 'Pause' : 'Lire'}
					>
						<Icon src={$isPlaying ? IoPauseCircle : IoPlayCircle} size="18" />
						<span>{$isPlaying ? 'Pause' : 'Lire'}</span>
					</button>
					<button
						class="rounded-full border border-stone-300 bg-white px-3 py-2 text-xs font-bold text-stone-700 transition-colors hover:border-missionnaire hover:text-missionnaire"
						on:click={goToActiveSongPage}
					>
						Afficher dans la liste
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Favorites & Recently Played (collapsed by default) -->
	{#if $favorites.length > 0 || $recentlyPlayed.length > 0 || cachedCount > 0}
		<div class="flex flex-wrap gap-1.5 md:gap-2 mb-4">
			{#if $favorites.length > 0}
				<button
					class="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-full border text-[10px] md:text-xs font-bold uppercase tracking-[0.12em] md:tracking-wider transition-colors whitespace-nowrap {showFavorites
						? 'border-red-200 bg-red-50 text-red-600'
						: 'border-stone-200 bg-white text-stone-500 hover:border-red-200 hover:text-red-500'}"
					on:click={() => {
						showFavorites = !showFavorites;
						showRecent = false;
						showCached = false;
					}}
				>
					<Icon src={BsHeartFill} size="11" />
					Favoris ({$favorites.length})
				</button>
			{/if}
			{#if $recentlyPlayed.length > 0}
				<button
					class="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-full border text-[10px] md:text-xs font-bold uppercase tracking-[0.12em] md:tracking-wider transition-colors whitespace-nowrap {showRecent
						? 'border-stone-300 bg-stone-100 text-missionnaire'
						: 'border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-missionnaire'}"
					on:click={() => {
						showRecent = !showRecent;
						showFavorites = false;
						showCached = false;
					}}
				>
					<Icon src={BsClockHistory} size="11" />
					Recents ({$recentlyPlayed.length})
				</button>
			{/if}
			<!-- ── BEGIN: cached filter button (added) ─────────────── -->
			{#if cachedCount > 0}
				<button
					class="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-full border text-[10px] md:text-xs font-bold uppercase tracking-[0.12em] md:tracking-wider transition-colors whitespace-nowrap {showCached
						? 'border-emerald-200 bg-emerald-50 text-emerald-600'
						: 'border-stone-200 bg-white text-stone-500 hover:border-emerald-200 hover:text-emerald-600'}"
					on:click={() => {
						showCached = !showCached;
						showFavorites = false;
						showRecent = false;
					}}
				>
					<Icon src={IoCloudDoneOutline} size="12" />
					En cache ({cachedCount})
				</button>
			{/if}
			<!-- ── END: cached filter button ─────────────────────────── -->
		</div>

		{#if showFavorites && $favorites.length > 0}
			<div class="bg-white/40 border border-stone-200/60 mb-6 overflow-hidden">
				<div
					class="flex items-center justify-between px-4 py-3 border-b border-stone-200 bg-stone-50/50"
				>
					<span class="text-[10px] font-bold uppercase tracking-widest text-stone-400">
						Favoris — {$favorites.length}
						{$favorites.length > 1 ? 'chants' : 'chant'}
					</span>
					<button
						class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-900 hover:bg-stone-800 text-white text-[10px] font-bold uppercase tracking-wider transition-colors"
						on:click={() => playAllFavorites()}
					>
						<Icon src={BsPlayFill} size="10" />
						Tout lire
					</button>
				</div>
				<div class="divide-y divide-stone-50 max-h-[300px] overflow-y-auto">
					{#each $favorites as fav, i}
						{@const favSong = findSongById(musicPlaylist, fav.id)}
						<div
							class="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-100/50 transition-colors group"
						>
							<span class="text-[10px] font-bold text-stone-300 w-5 text-center">{i + 1}</span>
							<button
								class="flex-1 min-w-0 text-left"
								on:click={() => {
									if (favSong) playSong(favSong);
								}}
							>
								<div
									class="text-sm font-bold text-stone-800 group-hover:text-missionnaire transition-colors truncate"
								>
									{fav.title}
								</div>
								<div class="flex items-center gap-2">
									{#if fav.artist}
										<span class="text-[10px] text-stone-400">{fav.artist}</span>
									{/if}
									{#if fav.category}
										<span class="text-[10px] text-stone-300">{fav.category}</span>
									{/if}
								</div>
							</button>
							<!-- svelte-ignore a11y-click-events-have-key-events -->
							<!-- svelte-ignore a11y-no-static-element-interactions -->
							<div
								class="text-red-300 hover:text-red-500 p-1 cursor-pointer transition-colors"
								on:click|stopPropagation={() =>
									toggleFavorite({
										_id: fav.id,
										title: fav.title,
										artist: fav.artist,
										s3_url: fav.s3_url
									})}
								title="Retirer des favoris"
							>
								<Icon src={BsX} size="14" />
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		{#if showRecent && $recentlyPlayed.length > 0}
			<div class="bg-white/40 border border-stone-200/60 mb-6 overflow-hidden">
				<div class="px-4 py-3 border-b border-stone-200 bg-stone-50/50">
					<span class="text-[10px] font-bold uppercase tracking-widest text-stone-400">
						Récemment joués
					</span>
				</div>
				<div class="divide-y divide-stone-50 max-h-[300px] overflow-y-auto">
					{#each $recentlyPlayed as recent, i}
						{@const recentSong = findSongById(musicPlaylist, recent.id)}
						<div
							class="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-100/50 transition-colors group"
						>
							<span class="text-[10px] font-bold text-stone-300 w-5 text-center">{i + 1}</span>
							<button
								class="flex-1 min-w-0 text-left"
								on:click={() => {
									if (recentSong) playSong(recentSong);
								}}
							>
								<div
									class="text-sm font-bold text-stone-800 group-hover:text-missionnaire transition-colors truncate"
								>
									{recent.title}
								</div>
								{#if recent.artist}
									<span class="text-[10px] text-stone-400">{recent.artist}</span>
								{/if}
							</button>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- ── BEGIN: cached panel (added) ────────────────────────── -->
		{#if showCached && cachedCount > 0}
			<div class="bg-white/40 border border-stone-200/60 mb-6 overflow-hidden">
				<div
					class="flex items-center justify-between px-4 py-3 border-b border-stone-200 bg-stone-50/50"
				>
					<span
						class="text-[10px] font-bold uppercase tracking-widest text-stone-400 flex items-center gap-2"
					>
						<span class="text-emerald-600"><Icon src={IoCloudDoneOutline} size="12" /></span>
						En cache — {cachedCount}
						{cachedCount > 1 ? 'chants disponibles hors ligne' : 'chant disponible hors ligne'}
					</span>
					<button
						class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-900 hover:bg-stone-800 text-white text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-stone-900"
						on:click={() => playAllCached()}
						disabled={cachedPlayableCount === 0}
						title={cachedPlayableCount === 0 ? 'Aucun chant jouable sur cette page' : ''}
					>
						<Icon src={BsPlayFill} size="10" />
						Tout lire
					</button>
				</div>
				<div class="divide-y divide-stone-50 max-h-[300px] overflow-y-auto">
					{#each cachedSongs as item, i}
						{@const cachedSong = item.song ?? findSongById(musicPlaylist, item.id)}
						<div
							class="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-100/50 transition-colors group"
						>
							<span class="text-[10px] font-bold text-stone-300 w-5 text-center">{i + 1}</span>
							<button
								class="flex-1 min-w-0 text-left"
								on:click={() => {
									if (cachedSong) playSong(cachedSong);
								}}
								disabled={!cachedSong}
								title={cachedSong ? '' : 'Rechargez la liste pour rejouer ce chant'}
							>
								<div
									class="text-sm font-bold text-stone-800 group-hover:text-missionnaire transition-colors truncate"
								>
									{item.title}
								</div>
								<div class="flex items-center gap-2">
									{#if item.artist}
										<span class="text-[10px] text-stone-400">{item.artist}</span>
									{/if}
									{#if item.category}
										<span class="text-[10px] text-stone-300">{item.category}</span>
									{/if}
								</div>
							</button>
						</div>
					{/each}
				</div>
			</div>
		{/if}
		<!-- ── END: cached panel ──────────────────────────────────── -->
	{/if}

	<!-- Songs List -->
	<div class="bg-white/40 border border-stone-200/60 min-h-[500px] flex flex-col overflow-hidden">
		<div
			class="grid grid-cols-[30px_1fr_auto_auto] {desktopMusicGrid} gap-2 md:gap-3 lg:gap-4 px-3 md:px-3 lg:px-4 py-3 border-b border-stone-200/60 text-[10px] md:text-[11px] font-bold text-stone-400 uppercase tracking-widest bg-white/40"
		>
			<div class="text-center">#</div>
			<button
				class="min-w-0 text-left flex items-center gap-1.5 hover:text-missionnaire transition-colors"
				on:click={() => handleSortChange('title')}
			>
				{#if currentSort.startsWith('title')}
					<span class="text-missionnaire">
						<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
					</span>
				{/if}
				<span class="truncate">Titre</span>
			</button>
			<button
				class="hidden md:flex min-w-0 text-left items-center gap-1.5 hover:text-missionnaire transition-colors"
				on:click={() => handleSortChange('category')}
			>
				{#if currentSort.startsWith('category')}
					<span class="text-missionnaire">
						<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
					</span>
				{/if}
				<span class="truncate">Recueil</span>
			</button>
			<div class="hidden md:flex relative min-w-0 items-center gap-1.5">
				<button
					class="min-w-0 hover:text-missionnaire transition-colors flex items-center gap-1.5"
					on:click={() => (isArtistMenuOpen = !isArtistMenuOpen)}
				>
					{#if currentSort.startsWith('artist')}
						<span class="text-missionnaire font-bold">
							<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
						</span>
					{/if}
					<span class="truncate">Artiste</span>
					{#if currentArtist}
						<span
							class="ml-1 bg-stone-200 text-missionnaire px-1.5 py-0.5 rounded-md text-[9px] lowercase"
							>filtré</span
						>
					{/if}
				</button>

				{#if isArtistMenuOpen}
					<!-- svelte-ignore a11y-no-static-element-interactions -->
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<div
						class="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-stone-200 p-3 z-50 normal-case tracking-normal"
						on:click|stopPropagation
					>
						<div class="flex items-center gap-2 bg-stone-50 px-2 py-1.5 rounded-lg mb-2">
							<Icon src={BsSearch} size="12" color="#999" />
							<input
								type="text"
								placeholder="Rechercher un artiste..."
								class="bg-transparent border-none outline-none text-xs w-full text-stone-700 placeholder:text-stone-400"
								bind:value={artistSearch}
							/>
						</div>

						<div class="max-h-60 overflow-y-auto space-y-1 custom-scrollbar">
							{#if filteredArtists.length === 0}
								<div class="px-3 py-4 text-xs text-stone-400 text-center italic">
									Aucun artiste trouvé
								</div>
							{:else}
								<button
									class="w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors {!currentArtist
										? 'bg-stone-100 text-missionnaire'
										: 'text-stone-500 hover:bg-stone-50'}"
									on:click={() => {
										handleArtistChange('');
										isArtistMenuOpen = false;
									}}
								>
									Tous les artistes
								</button>
								{#each filteredArtists as artist}
									<button
										class="w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors {currentArtist ===
										artist
											? 'bg-stone-100 text-missionnaire font-bold'
											: 'text-stone-600 hover:bg-stone-50'}"
										on:click={() => {
											handleArtistChange(artist);
											isArtistMenuOpen = false;
										}}
									>
										{artist}
									</button>
								{/each}
							{/if}
						</div>
					</div>
					<!-- Backdrop -->
					<!-- svelte-ignore a11y-no-static-element-interactions -->
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<div class="fixed inset-0 z-40" on:click={() => (isArtistMenuOpen = false)}></div>
				{/if}
			</div>
			<button
				class="hidden md:flex min-w-0 text-center items-center justify-center gap-1.5 hover:text-missionnaire transition-colors"
				on:click={() => handleSortChange('duration')}
			>
				{#if currentSort.startsWith('duration')}
					<span class="text-missionnaire">
						<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
					</span>
				{/if}
				<span class="truncate">Durée</span>
			</button>
			<div class="w-7 lg:w-8 hidden md:block"></div>
			<div class="w-9 lg:w-10 text-center"></div>
			<div class="w-9 lg:w-10 text-center flex items-center justify-center">
				<button
					class="hover:scale-110 active:scale-95 transition-all {isRandomListOrder
						? 'text-missionnaire'
						: 'text-stone-300 hover:text-missionnaire/60'}"
					on:click={refreshRandomList}
					title={isRandomListOrder ? "Rafraîchir l'ordre aléatoire" : 'Mélanger la liste'}
				>
					<Icon src={BsShuffle} size="16" />
				</button>
			</div>
		</div>

		<div class="divide-y divide-stone-100">
			{#if isListLoading && !hasResolvedMusicList}
				{#each Array.from({ length: 8 }) as _, i}
					<div
						class="grid grid-cols-[30px_1fr_auto_auto] {desktopMusicGrid} gap-2 md:gap-3 lg:gap-4 px-3 md:px-3 lg:px-4 py-3 md:py-4 items-center animate-pulse"
					>
						<div class="mx-auto h-3 w-4 rounded-full bg-stone-200"></div>
						<div class="space-y-2 min-w-0">
							<div class="h-4 w-3/4 rounded-full bg-stone-200"></div>
							<div class="h-3 w-1/2 rounded-full bg-stone-100 md:hidden"></div>
						</div>
						<div class="hidden md:block h-3 w-2/3 rounded-full bg-stone-100"></div>
						<div class="hidden md:block h-3 w-1/2 rounded-full bg-stone-100"></div>
						<div class="hidden md:block mx-auto h-3 w-10 rounded-full bg-stone-100"></div>
						<div class="hidden md:block mx-auto h-6 w-6 rounded-full bg-stone-100"></div>
						<div class="mx-auto h-7 w-7 rounded-full bg-stone-100"></div>
						<div class="mx-auto h-7 w-7 rounded-full bg-stone-200"></div>
					</div>
				{/each}
			{:else if listLoadError && !hasResolvedMusicList}
				<div class="py-20 px-6 text-center">
					<div class="text-stone-200 mb-4 flex justify-center">
						<Icon src={BsSearch} size="64" />
					</div>
					<p class="text-stone-500 font-bold uppercase tracking-widest text-sm">
						La liste n'a pas pu charger
					</p>
					<p class="mt-2 text-xs text-stone-400">{listLoadError}</p>
					<button
						class="mt-5 inline-flex items-center rounded-full border border-missionnaire px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-missionnaire transition-colors hover:bg-missionnaire/5"
						on:click={() => void loadMusicListInBackground({ showLoading: true })}
					>
						Réessayer
					</button>
				</div>
			{:else}
				{#if isListLoading}
					<div
						class="border-b border-stone-200/60 bg-stone-50/70 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400"
					>
						Mise à jour de la liste...
					</div>
				{/if}
				{#each musicList as song, i (song.s3_url || i)}
					{@const isActive = isSongActive(song, $selectAudio)}
					<!-- svelte-ignore a11y-click-events-have-key-events -->
					<!-- svelte-ignore a11y-no-static-element-interactions -->
					<div
						class="grid grid-cols-[30px_1fr_auto_auto] {desktopMusicGrid} gap-2 md:gap-3 lg:gap-4 px-3 md:px-3 lg:px-4 py-3 md:py-4 items-center transition-all group cursor-pointer {isActive
							? 'bg-missionnaire/5 border-l-4 border-l-missionnaire'
							: 'hover:bg-white/60'}"
						on:click={() => playSong(song)}
					>
						<div
							class="text-center text-[10px] md:text-xs font-bold {isActive
								? 'text-missionnaire'
								: 'text-stone-300'}"
						>
							{i + 1 + (currentPage - 1) * limit}
						</div>
						<div class="flex flex-col min-w-0">
							<div class="flex items-center gap-1.5 min-w-0">
								<div
									class="text-sm font-bold truncate min-w-0 transition-colors {isActive
										? 'text-missionnaire'
										: 'text-stone-800 group-hover:text-missionnaire'}"
								>
									{song.title || 'Sans titre'}
								</div>
								{#if song.has_lyrics}
									<!-- Slight clue: this song has published lyrics. Three text-line
									     glyph (matches the lyrics-review icon vocabulary). Stone-300
									     at rest, missionnaire when row is active or on hover. -->
									<svg
										class="lyrics-clue h-3 w-3 flex-shrink-0 transition-colors {isActive
											? 'text-missionnaire'
											: 'text-stone-300 group-hover:text-missionnaire/70'}"
										viewBox="0 0 12 12"
										fill="none"
										stroke="currentColor"
										stroke-width="1.4"
										stroke-linecap="round"
										aria-label="Paroles disponibles"
									>
										<title>Paroles disponibles</title>
										<path d="M2 3.25h7M2 6h7M2 8.75h5" />
									</svg>
								{/if}
							</div>
							<div
								class="flex flex-row items-center gap-2 md:hidden overflow-hidden text-ellipsis whitespace-nowrap"
							>
								<span
									class="text-[10px] font-medium {isActive
										? 'text-missionnaire/60'
										: 'text-stone-500'}"
								>
									{song.book_full_name || song.category || '-'}
								</span>
								{#if song.artist}
									<span class="text-[10px] text-stone-300">•</span>
									<button
										class="text-[10px] font-medium italic transition-colors {isActive
											? 'text-missionnaire/40 hover:text-missionnaire'
											: 'text-stone-400 hover:text-missionnaire'} {currentArtist === song.artist
											? 'text-missionnaire underline'
											: ''}"
										on:click|stopPropagation={() => handleArtistChange(song.artist || '')}
									>
										{song.artist}
									</button>
								{/if}
							</div>
						</div>
						<div
							class="hidden md:block min-w-0 truncate text-xs font-medium {isActive
								? 'text-missionnaire/60'
								: 'text-stone-500'}"
						>
							{song.book_full_name || song.category || '-'}
						</div>
						<div
							class="hidden md:block min-w-0 truncate text-xs font-medium italic {isActive
								? 'text-missionnaire/40'
								: 'text-stone-400'}"
						>
							{#if song.artist}
								<button
									class="block max-w-full truncate hover:text-missionnaire transition-colors cursor-pointer {currentArtist ===
									song.artist
										? 'text-missionnaire font-bold underline'
										: ''}"
									on:click|stopPropagation={() => handleArtistChange(song.artist || '')}
								>
									{song.artist}
								</button>
							{:else}
								-
							{/if}
						</div>
						<div
							class="hidden md:block text-center text-[11px] lg:text-xs font-mono {isActive
								? 'text-missionnaire'
								: 'text-stone-400'}"
						>
							{song['duration'] ? formatTime(song['duration']) : '--:--'}
						</div>
						<div class="w-7 lg:w-8 text-center hidden md:block">
							<button
								class="transition-colors p-1 md:p-1.5 {isFavorite(
									song._id || song.s3_url,
									$favorites
								)
									? 'text-red-500'
									: 'text-stone-300 hover:text-red-400'}"
								on:click|stopPropagation={() => toggleFavorite(song)}
								title={isFavorite(song._id || song.s3_url, $favorites)
									? 'Retirer des favoris'
									: 'Ajouter aux favoris'}
							>
								<Icon
									src={isFavorite(song._id || song.s3_url, $favorites) ? BsHeartFill : BsHeart}
									size="13"
								/>
							</button>
						</div>
						<div class="w-9 lg:w-10 text-center">
							<button
								class="transition-colors p-1.5 md:p-2 {isActive
									? 'text-missionnaire/60 hover:text-missionnaire'
									: 'text-stone-400 hover:text-missionnaire'}"
								on:click|stopPropagation={() => downloadSong(song)}
								title="Télécharger"
							>
								<Icon src={IoCloudDownloadOutline} size="18" />
							</button>
						</div>
						<div class="w-9 lg:w-10 text-center">
							<button
								class="hover:scale-110 active:scale-95 transition-all p-1.5 md:p-2 {isActive
									? 'text-missionnaire'
									: 'text-missionnaire'}"
								on:click|stopPropagation={() => {
									if (isActive) {
										dispatchAudioPlayerAction('toggle');
									} else {
										playSong(song);
									}
								}}
								title={isActive && $isPlaying ? 'Pause' : 'Lire'}
							>
								<Icon src={isActive && $isPlaying ? IoPauseCircle : IoPlayCircle} size="22" />
							</button>
						</div>
					</div>
				{:else}
					<div class="py-20 text-center">
						<div class="text-stone-200 mb-4 flex justify-center">
							<Icon src={BsSearch} size="64" />
						</div>
						<p class="text-stone-400 font-bold uppercase tracking-widest text-sm">
							Aucun chant trouvé
						</p>
					</div>
				{/each}
			{/if}
		</div>
	</div>

	<!-- Pagination (shared component — same shape as /predications and
	     /live/rediffusions). Lignes selector stays as music-list chrome;
	     pagination itself sits on its own row to avoid wrap collisions. -->
	{#if hasResolvedMusicList && totalPages > 1}
		<div class="mt-12 py-6 border-t border-stone-200/60 flex flex-col gap-6">
			<div
				class="flex flex-col sm:flex-row items-center sm:justify-between gap-4 text-[10px] md:text-xs font-bold text-stone-400 tracking-widest uppercase"
			>
				<div class="hidden md:block">
					Affichage de {musicList.length} sur {totalSongs} chants
				</div>
				<div class="flex items-center gap-3">
					<span class="opacity-60">Lignes:</span>
					<select
						class="bg-stone-100 rounded-lg px-3 py-1.5 outline-none text-stone-800 focus:ring-2 focus:ring-missionnaire/20 transition-all cursor-pointer"
						value={limit}
						on:change={(e) => {
							const params = new URLSearchParams($page.url.searchParams);
							params.set('limit', e.currentTarget.value);
							params.set('page', '1');
							syncSeedParam(params);
							goto(`?${params.toString()}`);
						}}
					>
						<option value="10">10</option>
						<option value="20">20</option>
						<option value="50">50</option>
						<option value="100">100</option>
					</select>
				</div>
			</div>
			<Pagination
				current={currentPage}
				total={totalPages}
				getHref={(p) => {
					const params = new URLSearchParams($page.url.searchParams);
					params.set('page', String(p));
					syncSeedParam(params);
					return `?${params.toString()}`;
				}}
			/>
		</div>
	{/if}
</div>

<style>
	/* Hide scrollbar for Chrome, Safari and Opera */
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}

	/* Hide scrollbar for IE, Edge and Firefox */
	.no-scrollbar {
		-ms-overflow-style: none; /* IE and Edge */
		scrollbar-width: none; /* Firefox */
	}
</style>
