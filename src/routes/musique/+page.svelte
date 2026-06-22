<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { t } from '../../i18n';
	import type { MusicAudio } from '$lib/models/music-audio';
	import type { AudioAsset } from '$lib/models/media-assets';
	import type { Sermon } from '$lib/models/sermon';
	import { getPlayableAudioUrl } from '../../utils/audioPlayback';
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
	import ListSkeleton from '$lib/components/ListSkeleton.svelte';
	import ErrorCard from '$lib/components/ErrorCard.svelte';
	import ResultsSummary from '$lib/components/ResultsSummary.svelte';
	// @ts-ignore
	import Icon from 'svelte-icons-pack/Icon.svelte';
	import BsSearch from 'svelte-icons-pack/bs/BsSearch';
	import BsPlayFill from 'svelte-icons-pack/bs/BsPlayFill';
	import BsArrowUp from 'svelte-icons-pack/bs/BsArrowUp';
	import BsArrowDown from 'svelte-icons-pack/bs/BsArrowDown';
	import BsX from 'svelte-icons-pack/bs/BsX';
	import BsShuffle from 'svelte-icons-pack/bs/BsShuffle';

	import AiOutlineDownload from 'svelte-icons-pack/ai/AiOutlineDownload';
	import IoPlayCircle from 'svelte-icons-pack/io/IoPlayCircle';
	import IoPauseCircle from 'svelte-icons-pack/io/IoPauseCircle';
	import BsHeartFill from 'svelte-icons-pack/bs/BsHeartFill';
	import BsHeart from 'svelte-icons-pack/bs/BsHeart';
	import { formatTime } from '../../utils/FormatTime';
	import { dispatchAudioPlayerAction } from '$lib/utils/audioPlayerControls';
	import {
		addToRecentlyPlayed,
		toggleFavorite,
		isFavorite,
		recentlyPlayed,
		favorites
	} from '$lib/stores/musicHistory';
	import { songSlug } from '$lib/utils/songSlug';
	// ── BEGIN: cached filter imports (added) ──────────────────────
	import { onDestroy, onMount, tick, untrack } from 'svelte';
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
	import {
		buildDownloadFilename,
		downloadSongsAsZip,
		fetchAllSongsForDownload,
		type DownloadProgress
	} from '$lib/utils/musicDownload';
	import { portal } from '$lib/actions/portal';
	import { focusTrap } from '$lib/actions/focusTrap';

	type MusicAudioApiResponse = {
		data: MusicAudio[];
		total: number;
		error?: string | null;
	};

	type MusicArtistsApiResponse = {
		data: string[];
		error?: string | null;
	};

	let { data } = $props();

	let musicList: MusicAudio[] = $state([]);
	let musicPlaylist: MusicAudio[] = $state([]);
	let artists: string[] = $state([]);
	let totalSongs = $state(0);
	let isListLoading = $state(false);
	let listLoadError = $state('');
	let hasResolvedMusicList = $state(false);
	let musicListAbortController: AbortController | null = null;
	let currentListRequestToken = 0;
	let lastHandledMusicRequestKey = $state('');


	let artistSearch = $state('');
	// "Filtres" sheet — bottom sheet on mobile, centered dialog on sm+.
	// Hosts the artist picker, alphabet, sort options and the list
	// utilities (Rafraîchir, Tout télécharger). Every choice inside goes
	// through the existing handle*Change goto/URL-param handlers.
	let filtersOpen = $state(false);

	function openFilters() {
		filtersOpen = true;
	}

	function closeFilters() {
		filtersOpen = false;
	}
	let showFavorites = $state(false);
	let showRecent = $state(false);
	// ── BEGIN: cached filter state (added) ────────────────────────
	let showCached = $state(false);

	// ── Bulk download (current filter as .zip) ────────────────────
	// Modal-driven flow: open confirms count + warns about size, Start
	// kicks off a sequential streaming zip via `client-zip`. Cancel
	// aborts pending fetches and the assembled blob is never saved.
	let downloadModalOpen = $state(false);
	let isDownloading = $state(false);
	let downloadProgress: DownloadProgress = $state({
		completed: 0,
		total: 0,
		currentTitle: '',
		skipped: 0
	});
	let downloadError = $state('');
	let downloadAbortController: AbortController | null = null;
	let downloadDoneSummary: { completed: number; skipped: number } | null = $state(null);

	function openDownloadModal() {
		if (isDownloading) return;
		downloadError = '';
		downloadDoneSummary = null;
		downloadModalOpen = true;
	}

	function closeDownloadModal() {
		if (isDownloading) return;
		downloadModalOpen = false;
		downloadError = '';
		downloadDoneSummary = null;
	}

	async function startDownload() {
		if (isDownloading) return;
		downloadError = '';
		downloadDoneSummary = null;
		isDownloading = true;
		downloadProgress = { completed: 0, total: 0, currentTitle: '', skipped: 0 };
		downloadAbortController = new AbortController();
		const signal = downloadAbortController.signal;

		try {
			const songs = await fetchAllSongsForDownload(
				{
					category: currentCategory,
					search: currentSearch,
					alpha: currentAlpha,
					artist: currentArtist,
					sort: currentSort,
					seed: currentSeed
				},
				signal
			);
			if (songs.length === 0) {
				downloadError = $t('music.nothingToDownload');
				return;
			}
			downloadProgress = {
				completed: 0,
				total: songs.length,
				currentTitle: '',
				skipped: 0
			};
			const filename = buildDownloadFilename({
				category: currentCategory,
				search: currentSearch,
				alpha: currentAlpha,
				artist: currentArtist
			});
			const summary = await downloadSongsAsZip(
				songs,
				filename,
				(p) => (downloadProgress = p),
				signal
			);
			downloadDoneSummary = summary;
		} catch (err) {
			if ((err as Error).name !== 'AbortError') {
				downloadError = err instanceof Error ? err.message : $t('music.downloadFailedDot');
			}
		} finally {
			isDownloading = false;
			downloadAbortController = null;
		}
	}

	function cancelDownload() {
		downloadAbortController?.abort();
	}

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
				throw new Error($t('music.loadFailed'));
			}

			const musicResult = (await musicResponse.json()) as MusicAudioApiResponse;
			if (musicResult.error) {
				throw new Error(musicResult.error);
			}

			let nextArtists = getMusicArtistsCache() || artists;
			if (artistsResponse) {
				if (!artistsResponse.ok) {
					throw new Error($t('music.loadArtistsFailed'));
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
				error instanceof Error ? error.message : $t('music.loadFailed');

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


	let recueilsScrollEl: HTMLDivElement | undefined = $state();
	let recueilsCanLeft = $state(false);
	let recueilsCanRight = $state(true);

	function updateRecueilsScrollState() {
		if (!recueilsScrollEl) return;
		const { scrollLeft, clientWidth, scrollWidth } = recueilsScrollEl;
		recueilsCanLeft = scrollLeft > 4;
		recueilsCanRight = scrollLeft + clientWidth < scrollWidth - 4;
	}

	// Shared-link landing: when a recipient opens /musique?play=<id>,
	// this stashes the id on mount and the resolver below either picks
	// it out of the loaded list or fetches the single song by id once
	// the list has settled, then starts playback. We only handle the
	// param once per id-change so the user can still pause/skip without
	// the page yanking the track back. The `play` query stays in the
	// URL so the link remains re-shareable.
	let pendingPlayId: string | null = $state(null);
	let handledPlayId: string | null = $state(null);

	onMount(() => {
		void refreshCachedUrls();
		updateRecueilsScrollState();
	});

	// Track the `play` query param reactively rather than only on mount.
	// Picking a song from the global search uses a client-side goto, which
	// updates the URL without remounting this page — so an onMount-only read
	// would miss it when the user is already on /musique. Reading $page.url
	// here re-runs on every navigation and queues the newly selected song.
	$effect(() => {
		const playParam = $page.url.searchParams.get('play');
		if (playParam && playParam !== pendingPlayId) {
			untrack(() => {
				pendingPlayId = playParam;
			});
		}
	});

	async function resolveSharedSong(key: string): Promise<MusicAudio | null> {
		// The play= param can be either an ObjectId or a title slug.
		// Look in the already-loaded list first (covers the common case
		// where the recipient lands on a list that already contains the
		// song) before falling back to the API endpoint that handles
		// both shapes.
		const fromList = findSongByIdOrSlug(musicPlaylist, key) ?? findSongByIdOrSlug(musicList, key);
		if (fromList) return fromList;
		try {
			const response = await fetch(`/api/music-audio/${encodeURIComponent(key)}`);
			if (!response.ok) return null;
			const payload = (await response.json()) as { data?: MusicAudio | null };
			return payload?.data ?? null;
		} catch (error) {
			console.warn('[Musique] Failed to resolve shared song:', error);
			return null;
		}
	}

	function findSongByIdOrSlug(list: MusicAudio[], key: string): MusicAudio | undefined {
		if (!key) return undefined;
		return list.find((s) => s._id === key || s.s3_url === key || songSlug(s.title) === key);
	}

	async function playSharedSong(id: string) {
		const song = await resolveSharedSong(id);
		if (!song) return;
		playSong(song);
		// Click-navigation from WhatsApp / iMessage / etc. carries a
		// transient user-activation gesture into the new page, which
		// browsers accept as permission to autoplay. After playSong()
		// has queued the track, we explicitly fire the player's play
		// action one tick later so the <audio> element has had a chance
		// to mount the new src before .play() runs. If the browser ends
		// up rejecting the play promise (cold tab / pasted URL with no
		// gesture), the player drops to its normal "press play" state.
		void tick().then(() => dispatchAudioPlayerAction('play'));
	}


	onDestroy(() => {
		if (cacheRefreshTimer) clearTimeout(cacheRefreshTimer);
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		abortMusicListRequest();
	});

	// Re-check the cache every time a track starts playing — gives the
	// SW a moment to write the response, then surfaces the new entry in
	// the "En cache" panel without a manual refresh.
	let cacheRefreshTimer: ReturnType<typeof setTimeout> | null = $state(null);


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


	let searchInput = $state((data as any).search);

	// Debounced list search for the row-2 utility bar (mobile; desktop
	// keeps the header band's inline search). Same 300ms debounce as the
	// layout's hero search, applied through the existing handleSearch()
	// URL mechanism so both inputs stay in sync via the URL.
	let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let lastSyncedListSearch = $state(((data as any).search || '') as string);

	function onSearchInput() {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(() => {
			if ((searchInput || '').trim() !== (currentSearch || '')) handleSearch();
		}, 300);
	}

	function clearListSearch() {
		if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
		searchInput = '';
		if (currentSearch) handleSearch();
	}

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
			// Only preserve an explicit seed the user already chose
			// (via "Rafraîchir" or an inbound link). When no seed is
			// present we leave the URL bare so every listener hits the
			// same edge-cached response and the server falls back to a
			// daily-rotating seed.
			const existing = params.get('seed') || currentSeed;
			if (existing) params.set('seed', existing);
			else params.delete('seed');
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
			// Drop any existing seed so the server uses the shared daily
			// seed — listeners who want a personal shuffle still get one
			// via the explicit "Rafraîchir" button.
			params.delete('seed');
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
		const url = getPlayableAudioUrl(song);
		try {
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
			window.open(url, '_blank');
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
	let initialMusicList = $derived(((data as any).musicAudio || []) as MusicAudio[]);
	let initialPlaylist = $derived(((data as any).playlistAudio || initialMusicList || []) as MusicAudio[]);
	let initialArtists = $derived(((data as any).artists || []) as string[]);
	let initialTotalSongs = $derived(((data as any).total || 0) as number);
	let currentCategory = $derived((data as any).category);
	let currentSearch = $derived((data as any).search);
	let currentAlpha = $derived((data as any).alpha);
	let currentSort = $derived((data as any).sort || 'uploaded_at:desc');
	let currentSeed = $derived((data as any).seed || '');
	let currentArtist = $derived((data as any).artist);
	let currentPage = $derived((data as any).page);
	let limit = $derived((data as any).limit);
	let isDeferredData = $derived(Boolean((data as any).deferred));
	// Shared-song metadata (server-fetched when ?play=<id> is present).
	// Drives the dynamic OG/Twitter tags so WhatsApp etc. show the song
	// title in the link preview instead of the generic site title.
	let sharedSong = $derived(((data as any).sharedSong || null) as MusicAudio | null);
	let sharedSongId = $derived(((data as any).playId || '') as string);
	let sharedSongTitle = $derived(sharedSong?.title?.trim() || '');
	let sharedSongArtist = $derived(sharedSong?.artist?.trim() || '');
	let sharedSongCategory = $derived(sharedSong?.category?.trim() || '');
	let sharedSongPreviewTitle = $derived(sharedSongTitle ? `${sharedSongTitle} — Missionnaire Network` : '');
	let sharedSongPreviewDescription = $derived(sharedSongTitle
		? sharedSongArtist
			? `Écoutez « ${sharedSongTitle} » par ${sharedSongArtist} sur Missionnaire Network.`
			: sharedSongCategory
				? `Écoutez « ${sharedSongTitle} » (${sharedSongCategory}) sur Missionnaire Network.`
				: `Écoutez « ${sharedSongTitle} » sur Missionnaire Network.`
		: '');
	let sharedSongCanonical = $derived(sharedSongId
		? `https://missionnaire.net/musique?play=${encodeURIComponent(sharedSongId)}`
		: '');
	let musicRequestKey = $derived(JSON.stringify({
		category: currentCategory || 'All',
		search: currentSearch || '',
		alpha: currentAlpha || '',
		artist: currentArtist || '',
		pageNumber: currentPage || 1,
		limit: limit || 100,
		sort: currentSort || 'uploaded_at:desc',
		seed: currentSeed || ''
	}));
	$effect(() => {
		if (musicRequestKey && musicRequestKey !== lastHandledMusicRequestKey) {
			untrack(() => {
				lastHandledMusicRequestKey = musicRequestKey;
			});
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
	});
	let totalPages = $derived(Math.ceil(totalSongs / limit));
	let summaryFrom = $derived(totalSongs === 0 ? 0 : (currentPage - 1) * limit + 1);
	let summaryTo = $derived(Math.min(currentPage * limit, totalSongs));
	let downloadEstimateMb = $derived(Math.round((totalSongs * 4.5) / 1) || 0);
	let downloadFilterLabel = $derived((() => {
		if (currentSearch) return `« ${currentSearch} »`;
		if (currentArtist) return currentArtist;
		if (currentAlpha) return $t('music.letterLabel', { letter: currentAlpha });
		if (currentCategory && currentCategory !== 'All') return currentCategory;
		return $t('music.allSongs');
	})());
	// Keep the row-2 search input in step with the URL (e.g. when the
	// desktop header search or a back/forward navigation changes it),
	// without stomping on in-progress typing.
	$effect(() => {
		const urlSearch = currentSearch || '';
		if (urlSearch !== lastSyncedListSearch) {
			searchInput = urlSearch;
			untrack(() => {
				lastSyncedListSearch = urlSearch;
			});
		}
	});
	// Badge on the "Filtres" button: how many sheet-managed filters are
	// currently narrowing the list (collection has its own pill row).
	let activeFilterCount = $derived((currentArtist ? 1 : 0) + (currentAlpha ? 1 : 0));
	$effect(() => {
		if (pendingPlayId && hasResolvedMusicList && pendingPlayId !== handledPlayId) {
			const id = pendingPlayId;
			untrack(() => {
				handledPlayId = id;
			});
			void playSharedSong(id);
		}
	});
	$effect(() => {
		if ($selectAudio) {
			// Timer bookkeeping only — reading/writing `cacheRefreshTimer`
			// tracked would make this effect re-trigger itself on every run.
			untrack(() => {
				if (cacheRefreshTimer) clearTimeout(cacheRefreshTimer);
				cacheRefreshTimer = setTimeout(() => void refreshCachedUrls(), 1500);
			});
		}
	});
	// Build a deduplicated list of cached songs by combining metadata
	// sources we have (favorites, recently played, current page) and
	// keeping only those whose URL is in the cache. Songs cached but
	// missing from all three sources won't appear — but in practice a
	// song must be played to be cached, so it's almost always either
	// in recently-played (last 20) or favorites.
	let cachedSongs = $derived((() => {
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
	})());
	let cachedCount = $derived(cachedSongs.length);
	let cachedPlayableCount = $derived(cachedSongs.reduce(
		(n, item) => n + ((item.song ?? findSongById(musicPlaylist, item.id)) ? 1 : 0),
		0
	));
	// ── END: play all cached ──────────────────────────────────────
	let filteredArtists = $derived(artists.filter((a: string) =>
		a.toLowerCase().includes(artistSearch.toLowerCase())
	));
	let playlistIndexByUrl = $derived(new Map<string, number>(
		(musicPlaylist || []).map((song: MusicAudio, index: number) => [song.s3_url, index])
	));
	let activeMusicSong = $derived(isMusicAudio($selectAudio) ? $selectAudio : null);
	let activeMusicSongIndex = $derived(activeMusicSong
		? (playlistIndexByUrl.get(activeMusicSong.s3_url) ?? -1)
		: -1);
	let isActiveMusicSongVisible =
		$derived(!!activeMusicSong &&
		(musicList || []).some((song: MusicAudio) => song.s3_url === activeMusicSong.s3_url));
	let activeMusicSongPage =
		$derived(activeMusicSongIndex >= 0 ? Math.floor(activeMusicSongIndex / limit) + 1 : null);
	let isRandomListOrder = $derived(currentSort.split(/[: ,]/)[0] === 'random');
	// Sync playlist when songs are loaded
	$effect(() => {
		if (hasResolvedMusicList) {
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
	});
</script>

<!-- All <title> / og:* / twitter:* meta lives in src/routes/+layout.svelte
     and reads from this page's load `meta` field (see +page.ts's
     buildMusiqueMeta) so there's exactly one tag per property. -->

<div class="w-full min-w-0 max-w-6xl mx-auto px-4 pt-0 pb-8 md:px-6">
	<!-- ROW 1 — Collections: THE primary filter, music-app style pill row
	     directly under the header band. No kicker label; the active pill
	     is solid missionnaire orange so the current recueil is
	     unmistakable. Edge fade hints at horizontal scrollability. -->
	<div
		class="recueils-scroll relative -mx-4 md:mx-0"
		class:can-scroll-left={recueilsCanLeft}
		class:can-scroll-right={recueilsCanRight}
	>
		<div
			bind:this={recueilsScrollEl}
			onscroll={updateRecueilsScrollState}
			class="recueils-track flex overflow-x-auto overscroll-x-contain gap-2 md:gap-2.5 no-scrollbar px-4 md:px-0 py-1"
			style="scrollbar-width: none; -ms-overflow-style: none;"
			role="group"
			aria-label={$t('music.collections')}
		>
			{#each categories as category}
				<button
					class="flex-shrink-0 inline-flex items-center h-10 md:h-11 px-4 md:px-5 rounded-full border text-[11px] md:text-xs font-bold uppercase tracking-[0.1em] md:tracking-wider transition-colors duration-150 {currentCategory ===
					category
						? 'bg-missionnaire border-missionnaire text-white shadow-sm'
						: 'bg-white/60 text-stone-600 border-stone-200 hover:border-missionnaire hover:text-missionnaire'}"
					aria-pressed={currentCategory === category}
					onclick={() => handleCategoryChange(category)}
				>
					{category === 'All' ? $t('music.allPill') : category}
				</button>
			{/each}
		</div>
	</div>

	<!-- ROW 2 — slim utility bar: compact search (mobile only; desktop
	     keeps the header band's inline search) + one "Filtres" button that
	     opens the sheet (artist, alphabet, sort, Rafraîchir, Tout
	     télécharger). -->
	<div class="mt-3 mb-3 md:mb-4 flex items-center gap-2 md:justify-end">
		<div class="relative min-w-0 flex-1 md:hidden">
			<svg
				class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<circle cx="11" cy="11" r="7" />
				<line x1="21" y1="21" x2="16.65" y2="16.65" />
			</svg>
			<input
				type="text"
				inputmode="search"
				enterkeyhint="search"
				class="h-10 w-full border border-stone-200 bg-white/70 pl-9 {searchInput
					? 'pr-9'
					: 'pr-3'} font-body text-sm text-stone-800 outline-none transition-colors duration-150 placeholder:text-stone-400 focus:border-missionnaire/60 focus:bg-white"
				placeholder={$t('music.searchPlaceholder')}
				aria-label={$t('music.searchPlaceholder')}
				bind:value={searchInput}
				oninput={onSearchInput}
			/>
			{#if searchInput}
				<button
					type="button"
					class="absolute right-0 top-0 flex h-10 w-9 items-center justify-center text-stone-400 transition-colors duration-150 hover:text-stone-700"
					aria-label={$t('music.clearSearch')}
					onclick={clearListSearch}
				>
					<Icon src={BsX} size="16" />
				</button>
			{/if}
		</div>
		{#if isRandomListOrder}
			<button
				class="hidden md:inline-flex h-10 items-center gap-1.5 border border-stone-200 bg-white/70 px-4 text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500 transition-colors duration-150 hover:border-missionnaire hover:text-missionnaire"
				onclick={refreshRandomList}
				title={$t('music.refreshRandom')}
			>
				<Icon src={BsShuffle} size="11" />
				{$t('music.refresh')}
			</button>
		{/if}
		<button
			class="inline-flex h-10 shrink-0 items-center gap-2 border px-4 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors duration-150 {filtersOpen ||
			activeFilterCount > 0
				? 'border-missionnaire/60 bg-missionnaire/5 text-missionnaire'
				: 'border-stone-200 bg-white/70 text-stone-500 hover:border-missionnaire hover:text-missionnaire'}"
			aria-haspopup="dialog"
			aria-expanded={filtersOpen}
			onclick={openFilters}
		>
			<svg
				viewBox="0 0 24 24"
				width="13"
				height="13"
				fill="none"
				stroke="currentColor"
				stroke-width="2.2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<line x1="4" y1="6" x2="20" y2="6" />
				<line x1="7" y1="12" x2="17" y2="12" />
				<line x1="10" y1="18" x2="14" y2="18" />
			</svg>
			{$t('music.filters')}
			{#if activeFilterCount > 0}
				<span
					class="flex h-4 min-w-4 items-center justify-center rounded-full bg-missionnaire px-1 text-[9px] font-bold text-white"
				>
					{activeFilterCount}
				</span>
			{/if}
		</button>
	</div>

	<!-- Active sheet-filters as dismissible chips (collection state is
	     already visible in the pill row above). -->
	{#if currentArtist || currentAlpha}
		<div class="mb-3 flex flex-wrap gap-2">
			{#if currentArtist}
				<button
					class="flex items-center gap-1.5 rounded-full border border-missionnaire/40 bg-missionnaire/10 px-3 py-1.5 text-xs font-semibold text-missionnaire"
					onclick={() => handleArtistChange('')}
					title={$t('music.allArtists')}
				>
					<span class="max-w-[150px] truncate">{currentArtist}</span>
					<Icon src={BsX} size="14" />
				</button>
			{/if}
			{#if currentAlpha}
				<button
					class="flex items-center gap-1.5 rounded-full border border-missionnaire/40 bg-missionnaire/10 px-3 py-1.5 text-xs font-semibold text-missionnaire"
					onclick={() => handleAlphaChange(currentAlpha)}
				>
					<span>{$t('music.letterLabel', { letter: currentAlpha })}</span>
					<Icon src={BsX} size="14" />
				</button>
			{/if}
		</div>
	{/if}

	{#if activeMusicSong && !isActiveMusicSongVisible}
		<div class="mb-4 border border-stone-300 bg-stone-100/80 px-4 py-3">
			<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
				<div class="min-w-0">
					<div class="text-[10px] font-semibold uppercase tracking-[0.25em] text-missionnaire">
						{$t('player.nowPlaying')}
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
							<span>{$t('pagination.page')} {activeMusicSongPage}</span>
						{/if}
					</div>
				</div>

				<div class="flex items-center gap-2">
					<button
						class="flex items-center gap-2 rounded-full bg-white px-4 py-2 min-h-11 text-xs font-bold text-missionnaire shadow-sm transition-colors hover:bg-stone-200"
						onclick={() => dispatchAudioPlayerAction('toggle')}
						title={$isPlaying ? $t('player.pause') : $t('player.playAction')}
					>
						<Icon src={$isPlaying ? IoPauseCircle : IoPlayCircle} size="18" />
						<span>{$isPlaying ? $t('player.pause') : $t('player.playAction')}</span>
					</button>
					<button
						class="rounded-full border border-stone-300 bg-white px-4 py-2 min-h-11 text-xs font-bold text-stone-700 transition-colors hover:border-missionnaire hover:text-missionnaire"
						onclick={goToActiveSongPage}
					>
						{$t('music.showInList')}
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- ROW 3 — results summary with the quiet Favoris / Récents / En
	     cache links right-aligned. The links open the same panels the
	     old pill buttons did; Tout télécharger moved into the Filtres
	     sheet. -->
	<div class="mb-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
		<div class="min-w-0">
			{#if hasResolvedMusicList}
				<ResultsSummary
					from={summaryFrom}
					to={summaryTo}
					total={totalSongs}
					query={currentSearch}
				/>
			{/if}
		</div>
		{#if $favorites.length > 0 || $recentlyPlayed.length > 0 || cachedCount > 0}
			<div class="ml-auto flex shrink-0 items-center gap-3 font-body text-[11px]">
				{#if $favorites.length > 0}
					<button
						class="underline decoration-stone-300 underline-offset-2 transition-colors duration-150 {showFavorites
							? 'font-semibold text-red-600 decoration-red-300'
							: 'text-stone-500 hover:text-red-600'}"
						aria-pressed={showFavorites}
						onclick={() => {
							showFavorites = !showFavorites;
							showRecent = false;
							showCached = false;
						}}
					>
						{$t('music.favoritesCount', { count: $favorites.length })}
					</button>
				{/if}
				{#if $recentlyPlayed.length > 0}
					<button
						class="underline decoration-stone-300 underline-offset-2 transition-colors duration-150 {showRecent
							? 'font-semibold text-missionnaire decoration-missionnaire/40'
							: 'text-stone-500 hover:text-missionnaire'}"
						aria-pressed={showRecent}
						onclick={() => {
							showRecent = !showRecent;
							showFavorites = false;
							showCached = false;
						}}
					>
						{$t('music.recentsCount', { count: $recentlyPlayed.length })}
					</button>
				{/if}
				{#if cachedCount > 0}
					<button
						class="underline decoration-stone-300 underline-offset-2 transition-colors duration-150 {showCached
							? 'font-semibold text-emerald-600 decoration-emerald-300'
							: 'text-stone-500 hover:text-emerald-600'}"
						aria-pressed={showCached}
						onclick={() => {
							showCached = !showCached;
							showFavorites = false;
							showRecent = false;
						}}
					>
						{$t('music.cachedCount', { count: cachedCount })}
					</button>
				{/if}
			</div>
		{/if}
	</div>

		{#if showFavorites && $favorites.length > 0}
			<div class="bg-white/40 border border-stone-200/60 mb-6 overflow-hidden">
				<div
					class="flex items-center justify-between px-4 py-3 border-b border-stone-200 bg-stone-50/50"
				>
					<span class="text-[10px] font-bold uppercase tracking-widest text-stone-400">
						{$t('music.favorites')} — {$favorites.length}
						{$favorites.length > 1 ? $t('music.songs') : $t('music.song')}
					</span>
					<button
						class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-900 hover:bg-stone-800 text-white text-[10px] font-bold uppercase tracking-wider transition-colors"
						onclick={() => playAllFavorites()}
					>
						<Icon src={BsPlayFill} size="10" />
						{$t('music.playAll')}
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
								onclick={() => {
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
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="text-red-300 hover:text-red-500 p-1 cursor-pointer transition-colors"
								onclick={(e) => {
									e.stopPropagation();
									toggleFavorite({
										_id: fav.id,
										title: fav.title,
										artist: fav.artist,
										s3_url: fav.s3_url
									});
								}}
								title={$t('player.unfavorite')}
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
						{$t('music.recentlyPlayed')}
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
								onclick={() => {
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
						{$t('player.cached')} — {cachedCount}
						{cachedCount > 1 ? $t('music.cachedManySuffix') : $t('music.cachedOneSuffix')}
					</span>
					<button
						class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-900 hover:bg-stone-800 text-white text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-stone-900"
						onclick={() => playAllCached()}
						disabled={cachedPlayableCount === 0}
						title={cachedPlayableCount === 0 ? $t('music.noPlayableCached') : ''}
					>
						<Icon src={BsPlayFill} size="10" />
						{$t('music.playAll')}
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
								onclick={() => {
									if (cachedSong) playSong(cachedSong);
								}}
								disabled={!cachedSong}
								title={cachedSong ? '' : $t('music.reloadToReplay')}
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

	<!-- Songs List -->
	<div class="bg-white/40 border border-stone-200/60 min-h-[500px] flex flex-col overflow-hidden">
		<div
			class="grid grid-cols-[24px_1fr_auto_auto] {desktopMusicGrid} gap-1.5 md:gap-3 lg:gap-4 px-2 md:px-3 lg:px-4 py-3 border-b border-stone-200/60 text-[10px] md:text-[11px] font-bold text-stone-400 uppercase tracking-widest bg-white/40"
		>
			<div class="text-center">#</div>
			<button
				class="min-w-0 text-left flex items-center gap-1.5 hover:text-missionnaire transition-colors"
				onclick={() => handleSortChange('title')}
			>
				{#if currentSort.startsWith('title')}
					<span class="text-missionnaire">
						<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
					</span>
				{/if}
				<span class="truncate">{$t('list.title')}</span>
			</button>
			<button
				class="hidden md:flex min-w-0 text-left items-center gap-1.5 hover:text-missionnaire transition-colors"
				onclick={() => handleSortChange('category')}
			>
				{#if currentSort.startsWith('category')}
					<span class="text-missionnaire">
						<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
					</span>
				{/if}
				<span class="truncate">{$t('music.collection')}</span>
			</button>
			<!-- Artist column is a plain label; filtering is done via the
			     "Artiste" chip button in the list header (works on all sizes).
			     `normal-case` matches the sibling <button> columns, which
			     Tailwind preflight resets to text-transform: none. -->
			<div class="hidden md:flex min-w-0 items-center gap-1.5 normal-case">
				{#if currentSort.startsWith('artist')}
					<span class="text-missionnaire font-bold">
						<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
					</span>
				{/if}
				<span class="truncate">{$t('music.artist')}</span>
				{#if currentArtist}
					<span
						class="ml-1 bg-stone-200 text-missionnaire px-1.5 py-0.5 rounded-md text-[9px] lowercase"
						>{$t('music.filtered')}</span
					>
				{/if}
			</div>
			<button
				class="hidden md:flex min-w-0 text-center items-center justify-center gap-1.5 hover:text-missionnaire transition-colors"
				onclick={() => handleSortChange('duration')}
			>
				{#if currentSort.startsWith('duration')}
					<span class="text-missionnaire">
						<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="12" />
					</span>
				{/if}
				<span class="truncate">{$t('list.duration')}</span>
			</button>
			<div class="w-7 lg:w-8 hidden md:block"></div>
			<div class="w-9 lg:w-10 text-center"></div>
			<div class="w-9 lg:w-10 text-center flex items-center justify-center">
				<button
					class="hover:scale-110 active:scale-95 transition-all {isRandomListOrder
						? 'text-missionnaire'
						: 'text-stone-300 hover:text-missionnaire/60'}"
					onclick={refreshRandomList}
					title={isRandomListOrder ? $t('music.refreshRandom') : $t('music.shuffleList')}
				>
					<Icon src={BsShuffle} size="16" />
				</button>
			</div>
		</div>

		<div class="divide-y divide-stone-100">
			{#if isListLoading && !hasResolvedMusicList}
				<ListSkeleton rows={8} />
			{:else if listLoadError && !hasResolvedMusicList}
				<ErrorCard
					message={listLoadError}
					onRetry={() => void loadMusicListInBackground({ showLoading: true })}
				/>
			{:else}
				{#if isListLoading}
					<div
						class="border-b border-stone-200/60 bg-stone-50/70 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-stone-400"
					>
						{$t('list.updating')}
					</div>
				{/if}
				{#each musicList as song, i (song.s3_url || i)}
					{@const isActive = isSongActive(song, $selectAudio)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="grid grid-cols-[24px_1fr_auto_auto] {desktopMusicGrid} gap-1.5 md:gap-3 lg:gap-4 px-2 md:px-3 lg:px-4 py-3 md:py-4 items-center transition-all group cursor-pointer {isActive
							? 'bg-missionnaire/5 border-l-4 border-l-missionnaire'
							: 'hover:bg-white/60'}"
						onclick={() => playSong(song)}
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
										aria-label={$t('player.lyricsAvailable')}
									>
										<title>{$t('player.lyricsAvailable')}</title>
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
										onclick={(e) => {
											e.stopPropagation();
											handleArtistChange(song.artist || '');
										}}
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
									onclick={(e) => {
										e.stopPropagation();
										handleArtistChange(song.artist || '');
									}}
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
								onclick={(e) => {
									e.stopPropagation();
									toggleFavorite(song);
								}}
								title={isFavorite(song._id || song.s3_url, $favorites)
									? $t('player.unfavorite')
									: $t('player.favorite')}
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
								onclick={(e) => {
									e.stopPropagation();
									downloadSong(song);
								}}
								title={$t('player.download')}
							>
								<Icon src={AiOutlineDownload} size="18" />
							</button>
						</div>
						<div class="w-9 lg:w-10 text-center">
							<button
								class="hover:scale-110 active:scale-95 transition-all p-1.5 md:p-2 {isActive
									? 'text-missionnaire'
									: 'text-missionnaire'}"
								onclick={(e) => {
									e.stopPropagation();
									if (isActive) {
										dispatchAudioPlayerAction('toggle');
									} else {
										playSong(song);
									}
								}}
								title={isActive && $isPlaying ? $t('player.pause') : $t('player.playAction')}
							>
								<Icon src={isActive && $isPlaying ? IoPauseCircle : IoPlayCircle} size="22" />
							</button>
						</div>
					</div>
				{:else}
					<div class="py-24 text-center">
						<div
							class="bg-stone-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 text-stone-200"
						>
							<Icon src={BsSearch} size="32" />
						</div>
						<h3 class="text-xl font-bold text-stone-800 mb-2">
							{$t('music.noSongs')}
						</h3>
						<p class="text-stone-400 text-sm">
							{$t('list.tryAdjustFilters')}
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
					{$t('music.showingOf', { shown: musicList.length, total: totalSongs })}
				</div>
				<div class="flex items-center gap-3">
					<span class="opacity-60">{$t('list.rows')}</span>
					<select
						class="bg-stone-100 rounded-lg px-3 py-1.5 outline-none text-stone-800 focus:ring-2 focus:ring-missionnaire/20 transition-all cursor-pointer"
						value={limit}
						onchange={(e) => {
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

<!-- "Filtres" sheet — bottom sheet on mobile, centered panel on sm+.
     Hosts everything that used to crowd the rows above the list: the
     artist picker (old "Artiste" dropdown), the alphabet filter, sort
     options, plus the Rafraîchir / Tout télécharger utilities. Each
     choice routes through the existing handle*Change goto/URL handlers,
     so a filter picked here applies exactly like the old inline panel.
     Portalled to <body> for the same containing-block reason as the
     download modal below. -->
{#if filtersOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		use:portal
		class="fixed inset-0 z-[100] flex items-end justify-center bg-stone-900/50 backdrop-blur-sm sm:items-center sm:p-4"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeFilters();
		}}
	>
		<div
			class="filters-sheet flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden border border-stone-200 bg-white shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label={$t('music.filters')}
			use:focusTrap={{ onEscape: closeFilters }}
		>
			<div class="flex items-center justify-between border-b border-stone-100 px-5 py-4">
				<p class="text-[10px] font-bold uppercase tracking-[0.25em] text-missionnaire">
					{$t('music.filters')}
				</p>
				<button
					class="p-1 text-stone-400 transition-colors duration-150 hover:text-stone-700"
					onclick={closeFilters}
					aria-label={$t('misc.close')}
				>
					<Icon src={BsX} size="20" />
				</button>
			</div>

			<div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
				<!-- Sort -->
				<section>
					<h3 class="mb-2 text-[10px] font-bold uppercase tracking-widest text-stone-400">
						{$t('music.sortBy')}
					</h3>
					<div class="flex flex-wrap gap-2">
						<button
							class="inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors duration-150 {isRandomListOrder
								? 'bg-missionnaire border-missionnaire text-white'
								: 'border-stone-200 bg-white text-stone-500 hover:border-missionnaire hover:text-missionnaire'}"
							aria-pressed={isRandomListOrder}
							onclick={() => handleSortChange('random')}
						>
							<Icon src={BsShuffle} size="11" />
							{$t('music.sortRandom')}
						</button>
						{#each [{ prop: 'uploaded_at', label: $t('music.sortNewest') }, { prop: 'title', label: $t('list.title') }, { prop: 'artist', label: $t('music.artist') }, { prop: 'category', label: $t('music.collection') }, { prop: 'duration', label: $t('list.duration') }] as option}
							{@const isActiveSort = currentSort.startsWith(option.prop)}
							<button
								class="inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors duration-150 {isActiveSort
									? 'bg-missionnaire border-missionnaire text-white'
									: 'border-stone-200 bg-white text-stone-500 hover:border-missionnaire hover:text-missionnaire'}"
								aria-pressed={isActiveSort}
								onclick={() => handleSortChange(option.prop)}
							>
								{option.label}
								{#if isActiveSort}
									<Icon src={currentSort.endsWith('desc') ? BsArrowDown : BsArrowUp} size="11" />
								{/if}
							</button>
						{/each}
					</div>
				</section>

				<!-- Alphabet -->
				<section>
					<h3 class="mb-2 text-[10px] font-bold uppercase tracking-widest text-stone-400">
						{$t('music.firstLetter')}
					</h3>
					<div class="grid grid-cols-7 gap-1.5">
						{#each alphabet as letter}
							<button
								class="flex h-9 items-center justify-center border text-xs font-bold transition-colors duration-150 {currentAlpha ===
								letter
									? 'bg-missionnaire border-missionnaire text-white'
									: 'border-stone-200 bg-white text-stone-500 hover:border-missionnaire hover:text-missionnaire'}"
								aria-pressed={currentAlpha === letter}
								onclick={() => {
									handleAlphaChange(letter);
									closeFilters();
								}}
							>
								{letter}
							</button>
						{/each}
					</div>
				</section>

				<!-- Artist picker (moved here from the old "Artiste" dropdown) -->
				<section>
					<h3 class="mb-2 text-[10px] font-bold uppercase tracking-widest text-stone-400">
						{$t('music.artist')}
					</h3>
					<div class="mb-2 flex items-center gap-2 border border-stone-200 bg-stone-50 px-2.5 py-2">
						<Icon src={BsSearch} size="12" color="#999" />
						<input
							type="text"
							placeholder={$t('music.searchArtist')}
							class="w-full border-none bg-transparent font-body text-sm text-stone-700 outline-none placeholder:text-stone-400"
							bind:value={artistSearch}
						/>
					</div>
					<div class="max-h-48 space-y-1 overflow-y-auto custom-scrollbar">
						{#if filteredArtists.length === 0}
							<div class="px-3 py-4 text-center text-xs italic text-stone-400">
								{$t('music.noArtistFound')}
							</div>
						{:else}
							<button
								class="w-full px-3 py-2 text-left text-xs font-bold transition-colors duration-150 {!currentArtist
									? 'bg-stone-100 text-missionnaire'
									: 'text-stone-500 hover:bg-stone-50'}"
								onclick={() => {
									handleArtistChange('');
									closeFilters();
								}}
							>
								{$t('music.allArtists')}
							</button>
							{#each filteredArtists as artist}
								<button
									class="w-full px-3 py-2 text-left text-xs font-medium transition-colors duration-150 {currentArtist ===
									artist
										? 'bg-stone-100 font-bold text-missionnaire'
										: 'text-stone-600 hover:bg-stone-50'}"
									onclick={() => {
										handleArtistChange(artist);
										closeFilters();
									}}
								>
									{artist}
								</button>
							{/each}
						{/if}
					</div>
				</section>
			</div>

			<!-- Utilities (moved from the old pill row) -->
			<div class="flex items-center gap-2 border-t border-stone-100 bg-stone-50/50 px-5 py-3">
				<button
					class="inline-flex h-10 flex-1 items-center justify-center gap-1.5 border border-stone-200 bg-white px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-600 transition-colors duration-150 hover:border-missionnaire hover:text-missionnaire"
					onclick={() => {
						closeFilters();
						refreshRandomList();
					}}
					title={$t('music.refreshRandom')}
				>
					<Icon src={BsShuffle} size="11" />
					{$t('music.refresh')}
				</button>
				<button
					class="inline-flex h-10 flex-1 items-center justify-center gap-1.5 border border-stone-200 bg-white px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-600 transition-colors duration-150 hover:border-missionnaire hover:text-missionnaire disabled:cursor-not-allowed disabled:opacity-50"
					onclick={() => {
						closeFilters();
						openDownloadModal();
					}}
					disabled={isDownloading || totalSongs === 0}
					title={$t('music.downloadAllTitle')}
				>
					<Icon src={AiOutlineDownload} size="12" />
					{$t('music.downloadAll')}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Bulk-download modal. Single dialog used for confirm + progress + done.
     Portalled to <body> because `.page-fade-in` (the layout wrapper) uses
     a CSS transform, which makes it a containing block for `position: fixed`
     and pins the overlay to the scrolled page position instead of the
     viewport. -->
{#if downloadModalOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		use:portal
		class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-stone-900/50 backdrop-blur-sm px-4 pb-4 sm:p-4"
		onclick={(e) => {
			if (e.target === e.currentTarget) closeDownloadModal();
		}}
	>
		<div
			class="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-stone-200"
			role="dialog"
			aria-modal="true"
			aria-label={$t('music.downloadSongs')}
		>
			<div class="px-5 pt-5 pb-4 border-b border-stone-100">
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<p class="text-[10px] font-bold uppercase tracking-[0.25em] text-missionnaire mb-1">
							{$t('music.downloadHeading')}
						</p>
						<h3 class="font-display text-xl font-semibold text-stone-900 truncate">
							{downloadFilterLabel}
						</h3>
					</div>
					{#if !isDownloading}
						<button
							class="p-1 text-stone-400 hover:text-stone-700 transition-colors"
							onclick={closeDownloadModal}
							aria-label={$t('misc.close')}
						>
							<Icon src={BsX} size="20" />
						</button>
					{/if}
				</div>
			</div>

			<div class="px-5 py-5 space-y-4">
				{#if !isDownloading && !downloadDoneSummary && !downloadError}
					<div class="space-y-2">
						<p class="text-sm text-stone-700">
							{$t('music.zipBefore', {
								count: totalSongs,
								unit: totalSongs > 1 ? $t('music.songs') : $t('music.song')
							})}
							<span class="font-semibold">.zip</span>{$t('music.zipAfter')}
						</p>
						<p class="text-xs text-stone-500 leading-relaxed">
							{$t('music.zipSizeHint', { mb: downloadEstimateMb })}
						</p>
						{#if totalSongs > 200}
							<p
								class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
							>
								{$t('music.zipLargeWarning')}
							</p>
						{/if}
					</div>
				{/if}

				{#if isDownloading}
					<div class="space-y-3">
						<div class="flex items-center justify-between text-xs font-bold text-stone-600">
							<span>
								{downloadProgress.completed} / {downloadProgress.total || totalSongs}
							</span>
							<span class="text-stone-400">
								{#if downloadProgress.total > 0}
									{Math.round((downloadProgress.completed / downloadProgress.total) * 100)}%
								{:else}
									{$t('music.preparing')}
								{/if}
							</span>
						</div>
						<div class="h-2 bg-stone-100 rounded-full overflow-hidden">
							<div
								class="h-full bg-missionnaire transition-[width] duration-200 ease-out"
								style="width: {downloadProgress.total > 0
									? Math.min(
											100,
											Math.round((downloadProgress.completed / downloadProgress.total) * 100)
										)
									: 0}%"
							></div>
						</div>
						{#if downloadProgress.currentTitle}
							<p class="text-xs text-stone-500 truncate">
								{$t('music.inProgress', { title: downloadProgress.currentTitle })}
							</p>
						{/if}
						{#if downloadProgress.skipped > 0}
							<p class="text-xs text-amber-700">
								{$t('music.skippedCount', { count: downloadProgress.skipped })}
							</p>
						{/if}
					</div>
				{/if}

				{#if downloadDoneSummary}
					<div class="space-y-2">
						<p class="text-sm text-emerald-700 font-semibold">
							{$t('music.zipDone', {
								count: downloadDoneSummary.completed,
								unit: downloadDoneSummary.completed > 1 ? $t('music.songs') : $t('music.song')
							})}
						</p>
						{#if downloadDoneSummary.skipped > 0}
							<p class="text-xs text-amber-700">
								{$t('music.zipSkipped', { count: downloadDoneSummary.skipped })}
							</p>
						{/if}
					</div>
				{/if}

				{#if downloadError}
					<p class="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
						{downloadError}
					</p>
				{/if}
			</div>

			<div
				class="px-5 py-4 bg-stone-50/50 border-t border-stone-100 flex items-center justify-end gap-2"
			>
				{#if isDownloading}
					<button
						class="px-4 py-2 min-h-11 rounded-full border border-stone-300 bg-white text-xs font-bold uppercase tracking-wider text-stone-700 hover:border-red-300 hover:text-red-600 transition-colors"
						onclick={cancelDownload}
					>
						{$t('misc.cancel')}
					</button>
				{:else if downloadDoneSummary || downloadError}
					<button
						class="px-4 py-2 min-h-11 rounded-full bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold uppercase tracking-wider transition-colors"
						onclick={closeDownloadModal}
					>
						{$t('misc.close')}
					</button>
				{:else}
					<button
						class="px-4 py-2 min-h-11 rounded-full border border-stone-300 bg-white text-xs font-bold uppercase tracking-wider text-stone-700 hover:border-stone-400 transition-colors"
						onclick={closeDownloadModal}
					>
						{$t('misc.cancel')}
					</button>
					<button
						class="flex items-center gap-1.5 px-4 py-2 min-h-11 rounded-full bg-missionnaire hover:bg-missionnaire/90 text-white text-xs font-bold uppercase tracking-wider transition-colors"
						onclick={startDownload}
					>
						<Icon src={AiOutlineDownload} size="12" />
						{$t('music.start')}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	/* Filtres sheet entrance: quick slide-up from the bottom edge on
	   mobile (where it is a bottom sheet). Kept under 200ms and disabled
	   entirely for prefers-reduced-motion. */
	.filters-sheet {
		animation: sheet-up 0.18s ease-out;
	}

	@keyframes sheet-up {
		from {
			transform: translateY(24px);
			opacity: 0.5;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.filters-sheet {
			animation: none;
		}
	}

	/* Hide scrollbar for Chrome, Safari and Opera */
	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}

	/* Hide scrollbar for IE, Edge and Firefox */
	.no-scrollbar {
		-ms-overflow-style: none; /* IE and Edge */
		scrollbar-width: none; /* Firefox */
	}

	/* Edge-fade affordance for the horizontally scrollable Recueils row.
	   The mask fades the track to transparent on whichever side has more
	   content, so the row reads as "scrollable" instead of "complete". */
	.recueils-scroll .recueils-track {
		--fade: 28px;
		-webkit-mask-image: linear-gradient(to right, #000 0, #000 100%);
		mask-image: linear-gradient(to right, #000 0, #000 100%);
	}
	.recueils-scroll.can-scroll-right .recueils-track {
		-webkit-mask-image: linear-gradient(
			to right,
			#000 0,
			#000 calc(100% - var(--fade)),
			transparent 100%
		);
		mask-image: linear-gradient(to right, #000 0, #000 calc(100% - var(--fade)), transparent 100%);
	}
	.recueils-scroll.can-scroll-left .recueils-track {
		-webkit-mask-image: linear-gradient(to right, transparent 0, #000 var(--fade), #000 100%);
		mask-image: linear-gradient(to right, transparent 0, #000 var(--fade), #000 100%);
	}
	.recueils-scroll.can-scroll-left.can-scroll-right .recueils-track {
		-webkit-mask-image: linear-gradient(
			to right,
			transparent 0,
			#000 var(--fade),
			#000 calc(100% - var(--fade)),
			transparent 100%
		);
		mask-image: linear-gradient(
			to right,
			transparent 0,
			#000 var(--fade),
			#000 calc(100% - var(--fade)),
			transparent 100%
		);
	}
</style>
