import type { MusicAudio } from '$lib/models/music-audio';

export interface MusicPageCacheEntry {
	artists: string[];
	musicAudio: MusicAudio[];
	playlistAudio: MusicAudio[];
	total: number;
	fetchedAt: number;
}

export const MUSIC_PAGE_CACHE_TTL_MS = 60_000;
export const MUSIC_ARTISTS_CACHE_TTL_MS = 5 * 60_000;

const MAX_MUSIC_PAGE_CACHE_ENTRIES = 30;
const musicPageCache = new Map<string, MusicPageCacheEntry>();

let musicArtistsCache: { artists: string[]; fetchedAt: number } | null = null;

function pruneMusicPageCache(now = Date.now()) {
	for (const [key, entry] of musicPageCache) {
		if (now - entry.fetchedAt >= MUSIC_PAGE_CACHE_TTL_MS) {
			musicPageCache.delete(key);
		}
	}

	if (musicPageCache.size <= MAX_MUSIC_PAGE_CACHE_ENTRIES) return;

	const oldestEntries = [...musicPageCache.entries()]
		.sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)
		.slice(0, musicPageCache.size - MAX_MUSIC_PAGE_CACHE_ENTRIES);

	for (const [key] of oldestEntries) {
		musicPageCache.delete(key);
	}
}

export function getMusicPageCache(key: string): MusicPageCacheEntry | null {
	return musicPageCache.get(key) ?? null;
}

export function setMusicPageCache(
	key: string,
	entry: Omit<MusicPageCacheEntry, 'fetchedAt'> & { fetchedAt?: number }
): MusicPageCacheEntry {
	const cachedEntry: MusicPageCacheEntry = {
		...entry,
		fetchedAt: entry.fetchedAt ?? Date.now()
	};

	musicPageCache.set(key, cachedEntry);
	pruneMusicPageCache(cachedEntry.fetchedAt);
	return cachedEntry;
}

export function isMusicPageCacheFresh(entry: MusicPageCacheEntry, now = Date.now()): boolean {
	return now - entry.fetchedAt < MUSIC_PAGE_CACHE_TTL_MS;
}

export function getMusicArtistsCache(): string[] | null {
	return musicArtistsCache?.artists ?? null;
}

export function setMusicArtistsCache(artists: string[], fetchedAt = Date.now()): string[] {
	musicArtistsCache = { artists, fetchedAt };
	return artists;
}

export function areMusicArtistsCached(now = Date.now()): boolean {
	return !!musicArtistsCache && now - musicArtistsCache.fetchedAt < MUSIC_ARTISTS_CACHE_TTL_MS;
}
