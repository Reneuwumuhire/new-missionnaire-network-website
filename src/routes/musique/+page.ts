import type { MusicAudio } from '$lib/models/music-audio';

export const load = async ({ fetch, url }) => {
	const category = url.searchParams.get('category') || 'All';
	const search = url.searchParams.get('search') || '';
	const alpha = url.searchParams.get('alpha') || '';
	const artist = url.searchParams.get('artist') || '';
	const pageNumber = url.searchParams.get('page') || '1';
	const limit = url.searchParams.get('limit') || '100';

	// Default to random sort for "All" category if no specific sort is requested
	let defaultSort = 'uploaded_at:desc';
	if (category === 'All' && !search && !alpha && !artist) {
		defaultSort = 'random';
	}

	const sort = url.searchParams.get('sort') || defaultSort;

	let artists: string[] = [];
	try {
		const artistResponse = await fetch('/api/music-artists');
		if (artistResponse.ok) {
			const artistResult = await artistResponse.json();
			artists = artistResult.data || [];
		} else {
			console.error('[Load] Failed to fetch artists:', artistResponse.status);
		}
	} catch (e) {
		console.error('[Load] Error fetching artists:', e);
	}

	const queryParams = new URLSearchParams({
		category,
		search,
		alpha,
		artist,
		pageNumber,
		limit,
		sort
	});

	const response = await fetch(`/api/music-audio?${queryParams.toString()}`);
	const result = await response.json();
	const musicAudio = result.data as MusicAudio[];
	const total = result.total as number;
	let playlistAudio = musicAudio;

	if (total > musicAudio.length) {
		const playlistParams = new URLSearchParams({
			category,
			search,
			alpha,
			artist,
			pageNumber: '1',
			limit: total.toString(),
			sort
		});

		try {
			const playlistResponse = await fetch(`/api/music-audio?${playlistParams.toString()}`);
			if (playlistResponse.ok) {
				const playlistResult = await playlistResponse.json();
				playlistAudio = (playlistResult.data as MusicAudio[]) || musicAudio;
			}
		} catch (e) {
			console.error('[Load] Error fetching full music playlist:', e);
		}
	}

	return {
		musicAudio,
		playlistAudio,
		artists: artists,
		total,
		category,
		search,
		alpha,
		artist,
		sort,
		page: Number.parseInt(pageNumber),
		limit: Number.parseInt(limit)
	};
};
