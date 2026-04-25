import type { SerializedTranscription } from '$lib/server/transcriptions';

export interface TranscriptionsPageCacheEntry {
	documents: SerializedTranscription[];
	total: number;
	years: number[];
	fetchedAt: number;
}

export const TRANSCRIPTIONS_PAGE_CACHE_TTL_MS = 60_000;

const MAX_CACHE_ENTRIES = 30;
const pageCache = new Map<string, TranscriptionsPageCacheEntry>();

function pruneCache(now = Date.now()) {
	for (const [key, entry] of pageCache) {
		if (now - entry.fetchedAt >= TRANSCRIPTIONS_PAGE_CACHE_TTL_MS) pageCache.delete(key);
	}
	if (pageCache.size <= MAX_CACHE_ENTRIES) return;
	const oldest = [...pageCache.entries()]
		.sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)
		.slice(0, pageCache.size - MAX_CACHE_ENTRIES);
	for (const [key] of oldest) pageCache.delete(key);
}

export function getTranscriptionsCache(key: string): TranscriptionsPageCacheEntry | null {
	return pageCache.get(key) ?? null;
}

export function setTranscriptionsCache(
	key: string,
	entry: Omit<TranscriptionsPageCacheEntry, 'fetchedAt'> & { fetchedAt?: number }
): TranscriptionsPageCacheEntry {
	const cached: TranscriptionsPageCacheEntry = {
		...entry,
		fetchedAt: entry.fetchedAt ?? Date.now()
	};
	pageCache.set(key, cached);
	pruneCache(cached.fetchedAt);
	return cached;
}

export function isTranscriptionsCacheFresh(
	entry: TranscriptionsPageCacheEntry,
	now = Date.now()
): boolean {
	return now - entry.fetchedAt < TRANSCRIPTIONS_PAGE_CACHE_TTL_MS;
}
