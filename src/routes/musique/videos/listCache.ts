import type { YoutubeVideo } from '$lib/models/youtube';

export interface VideosPageCacheEntry {
	videos: YoutubeVideo[];
	total: number;
	skipCount: number;
	hasMore: boolean;
	fetchedAt: number;
}

export const VIDEOS_PAGE_CACHE_TTL_MS = 60_000;

const MAX_CACHE_ENTRIES = 12;
const cache = new Map<string, VideosPageCacheEntry>();

function pruneCache(now = Date.now()) {
	for (const [key, entry] of cache) {
		if (now - entry.fetchedAt >= VIDEOS_PAGE_CACHE_TTL_MS) cache.delete(key);
	}
	if (cache.size <= MAX_CACHE_ENTRIES) return;
	const oldest = [...cache.entries()]
		.sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)
		.slice(0, cache.size - MAX_CACHE_ENTRIES);
	for (const [key] of oldest) cache.delete(key);
}

export function getVideosCache(key: string): VideosPageCacheEntry | null {
	return cache.get(key) ?? null;
}

export function setVideosCache(
	key: string,
	entry: Omit<VideosPageCacheEntry, 'fetchedAt'> & { fetchedAt?: number }
): VideosPageCacheEntry {
	const cached: VideosPageCacheEntry = {
		...entry,
		fetchedAt: entry.fetchedAt ?? Date.now()
	};
	cache.set(key, cached);
	pruneCache(cached.fetchedAt);
	return cached;
}

export function isVideosCacheFresh(entry: VideosPageCacheEntry, now = Date.now()): boolean {
	return now - entry.fetchedAt < VIDEOS_PAGE_CACHE_TTL_MS;
}
