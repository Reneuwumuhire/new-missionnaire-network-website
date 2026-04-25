import type { Sermon } from '$lib/models/sermon';
import type { PublishedRecording } from '$lib/server/recordings';

export interface PredicationsPageCacheEntry {
	filterType: 'sermon' | 'retransmission';
	sermons: Sermon[];
	recordings: PublishedRecording[];
	recordingsTotal: number;
	showBlendedRetransmissions: boolean;
	total: number;
	availableAuthors: string[];
	years: string[];
	fetchedAt: number;
}

export const PREDICATIONS_PAGE_CACHE_TTL_MS = 60_000;
export const PREDICATIONS_META_CACHE_TTL_MS = 5 * 60_000;

const MAX_PAGE_CACHE_ENTRIES = 30;
const pageCache = new Map<string, PredicationsPageCacheEntry>();

let authorsCache: { authors: string[]; fetchedAt: number } | null = null;
let yearsCache: { years: string[]; fetchedAt: number } | null = null;

function prunePageCache(now = Date.now()) {
	for (const [key, entry] of pageCache) {
		if (now - entry.fetchedAt >= PREDICATIONS_PAGE_CACHE_TTL_MS) pageCache.delete(key);
	}
	if (pageCache.size <= MAX_PAGE_CACHE_ENTRIES) return;
	const oldest = [...pageCache.entries()]
		.sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)
		.slice(0, pageCache.size - MAX_PAGE_CACHE_ENTRIES);
	for (const [key] of oldest) pageCache.delete(key);
}

export function getPredicationsPageCache(key: string): PredicationsPageCacheEntry | null {
	return pageCache.get(key) ?? null;
}

export function setPredicationsPageCache(
	key: string,
	entry: Omit<PredicationsPageCacheEntry, 'fetchedAt'> & { fetchedAt?: number }
): PredicationsPageCacheEntry {
	const cached: PredicationsPageCacheEntry = {
		...entry,
		fetchedAt: entry.fetchedAt ?? Date.now()
	};
	pageCache.set(key, cached);
	prunePageCache(cached.fetchedAt);
	return cached;
}

export function isPredicationsPageCacheFresh(
	entry: PredicationsPageCacheEntry,
	now = Date.now()
): boolean {
	return now - entry.fetchedAt < PREDICATIONS_PAGE_CACHE_TTL_MS;
}

export function getCachedAuthors(): string[] | null {
	return authorsCache?.authors ?? null;
}

export function setCachedAuthors(authors: string[], fetchedAt = Date.now()): string[] {
	authorsCache = { authors, fetchedAt };
	return authors;
}

export function areAuthorsFresh(now = Date.now()): boolean {
	return !!authorsCache && now - authorsCache.fetchedAt < PREDICATIONS_META_CACHE_TTL_MS;
}

export function getCachedYears(): string[] | null {
	return yearsCache?.years ?? null;
}

export function setCachedYears(years: string[], fetchedAt = Date.now()): string[] {
	yearsCache = { years, fetchedAt };
	return years;
}

export function areYearsFresh(now = Date.now()): boolean {
	return !!yearsCache && now - yearsCache.fetchedAt < PREDICATIONS_META_CACHE_TTL_MS;
}
