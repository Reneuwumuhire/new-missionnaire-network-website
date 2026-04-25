import type { MusicAudio } from '$lib/models/music-audio';
import { redirect } from '@sveltejs/kit';

function isRandomSort(sort: string): boolean {
	return sort.split(/[: ,]/)[0] === 'random';
}

function createPlaylistSeed(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

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
	const seed = url.searchParams.get('seed') || '';

	if (isRandomSort(sort) && !seed) {
		const redirectUrl = new URL(url);
		redirectUrl.searchParams.set('sort', sort);
		redirectUrl.searchParams.set('seed', createPlaylistSeed());
		throw redirect(307, `${redirectUrl.pathname}?${redirectUrl.searchParams.toString()}`);
	}

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
	if (seed) {
		queryParams.set('seed', seed);
	}

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
		if (seed) {
			playlistParams.set('seed', seed);
		}

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
		seed,
		page: Number.parseInt(pageNumber),
		limit: Number.parseInt(limit)
	};
};
