import { browser } from '$app/environment';
import type { MusicAudio } from '$lib/models/music-audio';
import { songSlug } from '$lib/utils/songSlug';

export const load = async ({ fetch, url }) => {
	const category = url.searchParams.get('category') || 'All';
	const search = url.searchParams.get('search') || '';
	const alpha = url.searchParams.get('alpha') || '';
	const artist = url.searchParams.get('artist') || '';
	const pageNumber = url.searchParams.get('page') || '1';
	const limit = url.searchParams.get('limit') || '100';
	const playId = url.searchParams.get('play') || '';
	const parsedPageNumber = Number.parseInt(pageNumber);
	const parsedLimit = Number.parseInt(limit);

	// Default to random sort for "All" category if no specific sort is requested
	let defaultSort = 'uploaded_at:desc';
	if (category === 'All' && !search && !alpha && !artist) {
		defaultSort = 'random';
	}

	const sort = url.searchParams.get('sort') || defaultSort;
	// Seed is intentionally left empty when the user hasn't picked a custom
	// shuffle: the API endpoint defaults to a daily-rotating seed so the URL
	// stays identical across users for the whole day, which lets the edge
	// cache and the in-memory shuffle cache both hit on virtually every
	// request. The previous behaviour minted a unique per-session seed and
	// 307-redirected the listener through it — fast for back/forward, but
	// every first visit paid a redirect round-trip AND missed every cache.
	// Users who want their own order use "Rafraîchir" which writes a
	// per-session seed to the URL explicitly.
	const seed = url.searchParams.get('seed') || '';

	if (browser) {
		return {
			musicAudio: [] as MusicAudio[],
			playlistAudio: [] as MusicAudio[],
			artists: [] as string[],
			total: 0,
			category,
			search,
			alpha,
			artist,
			sort,
			seed,
			page: parsedPageNumber,
			limit: parsedLimit,
			playId,
			sharedSong: null as MusicAudio | null,
			meta: buildMusiqueMeta({ sharedSong: null, playId }),
			deferred: true
		};
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

	const [artistResponse, response] = await Promise.all([
		fetch('/api/music-artists'),
		fetch(`/api/music-audio?${queryParams.toString()}`)
	]);

	let artists: string[] = [];
	try {
		if (artistResponse.ok) {
			const artistResult = await artistResponse.json();
			artists = artistResult.data || [];
		} else {
			console.error('[Load] Failed to fetch artists:', artistResponse.status);
		}
	} catch (e) {
		console.error('[Load] Error fetching artists:', e);
	}

	const result = await response.json();
	const musicAudio = result.data as MusicAudio[];
	const total = result.total as number;
	const playlistAudio = musicAudio;

	// Resolve the shared song server-side so its title flows into the
	// initial HTML's OG meta tags — that's what WhatsApp/iMessage/etc.
	// scrape for link previews. Without this, the preview falls back to
	// the static site title and listeners can't tell which song was
	// shared.
	let sharedSong: MusicAudio | null = null;
	if (playId) {
		try {
			const songRes = await fetch(`/api/music-audio/${encodeURIComponent(playId)}`);
			if (songRes.ok) {
				const payload = (await songRes.json()) as { data?: MusicAudio | null };
				sharedSong = payload?.data ?? null;
			}
		} catch (err) {
			console.error('[Load] shared song fetch failed:', err);
		}
	}

	const meta = buildMusiqueMeta({ sharedSong, playId });

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
		page: parsedPageNumber,
		limit: parsedLimit,
		playId,
		sharedSong,
		meta,
		deferred: false
	};
};

// Shape consumed by +layout.svelte to render the single set of og:*
// tags. Kept tiny: title/description/url/type. The image falls back to
// the default OG image — per-song imagery is a future iteration.
function buildMusiqueMeta(opts: { sharedSong: MusicAudio | null; playId: string }) {
	const title = opts.sharedSong?.title?.trim() ?? '';
	if (!title) {
		return {
			title: 'Cantiques · Missionnaire Network',
			description:
				"Écoutez les cantiques et adorations du Message de l'Heure sur Missionnaire Network — une collection riche pour votre adoration quotidienne.",
			url: 'https://missionnaire.net/musique'
		};
	}
	const artistName = opts.sharedSong?.artist?.trim() ?? '';
	const category = opts.sharedSong?.category?.trim() ?? '';
	// Target the 90-155 char window that Facebook/WhatsApp like for OG
	// descriptions — shorter ones get padded with the URL, longer ones
	// get truncated mid-sentence.
	const tagline = 'un cantique du Message à écouter et partager sur Missionnaire Network.';
	let description = `Écoutez « ${title} » — ${tagline}`;
	if (artistName) {
		description = `Écoutez « ${title} » par ${artistName} — ${tagline}`;
	} else if (category) {
		description = `Écoutez « ${title} » du recueil ${category} — ${tagline}`;
	}
	// Always canonicalise to the slug form even when the inbound URL
	// used an ObjectId — keeps share previews crawler-deduplicated and
	// gives WhatsApp a prettier URL to display.
	const slug = songSlug(title);
	const canonicalKey = slug || opts.playId;
	return {
		title: composeShareTitle(title),
		description,
		url: `https://missionnaire.net/musique?play=${encodeURIComponent(canonicalKey)}`,
		type: 'music.song'
	};
}

// Keep the OG title under the 60-char limit social previews truncate
// past. We try the branded form first, drop the brand suffix when the
// song name alone is already heavy, and only ellipsise the song name as
// a last resort for unusually long titles.
const OG_TITLE_LIMIT = 60;
const BRAND_SUFFIX = ' · Missionnaire Network';

function composeShareTitle(title: string): string {
	const branded = `${title}${BRAND_SUFFIX}`;
	if (branded.length <= OG_TITLE_LIMIT) return branded;
	if (title.length <= OG_TITLE_LIMIT) return title;
	return `${title.slice(0, OG_TITLE_LIMIT - 1).trimEnd()}…`;
}
