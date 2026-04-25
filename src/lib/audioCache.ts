// ── BEGIN: audio cache utility (new file) ─────────────────────────
// Helpers for inspecting and clearing the audio Cache Storage bucket
// populated by the service worker. The cache name MUST match the
// `AUDIO_CACHE_NAME` constant declared in src/service-worker.ts.

import { browser } from '$app/environment';
import { writable, type Readable } from 'svelte/store';

export const AUDIO_CACHE_NAME = 'audio-cache-v1';

// ── Reactive set of cached audio URLs ─────────────────────────────
// Subscribers receive a Set<string> of every URL currently stored in
// the audio cache. Call `refreshCachedUrls()` to re-read the cache;
// `clearCache()` resets it implicitly. URLs are stored exactly as the
// service worker keyed them — i.e. as `request.url`, which matches
// what the audio element fetched (typically `encodeURI(rawUrl)`).
const cachedUrlsInternal = writable<Set<string>>(new Set());
export const cachedUrls: Readable<Set<string>> = {
	subscribe: cachedUrlsInternal.subscribe
};

/** Re-reads the audio cache and updates the `cachedUrls` store. */
export async function refreshCachedUrls(): Promise<Set<string>> {
	if (!browser || typeof caches === 'undefined') {
		const empty = new Set<string>();
		cachedUrlsInternal.set(empty);
		return empty;
	}
	try {
		const cache = await caches.open(AUDIO_CACHE_NAME);
		const requests = await cache.keys();
		const set = new Set(requests.map((r) => r.url));
		cachedUrlsInternal.set(set);
		return set;
	} catch {
		const empty = new Set<string>();
		cachedUrlsInternal.set(empty);
		return empty;
	}
}

/** Returns true if the given (already-played) URL is in the cached
 *  set. Cheap, synchronous; relies on `refreshCachedUrls()` having
 *  been called at least once. Use `isCached()` for an authoritative
 *  async check. The lookup tries both the raw URL and its
 *  `encodeURI`-form so callers can pass either. */
export function isUrlCached(url: string, set: Set<string>): boolean {
	if (!url) return false;
	if (set.has(url)) return true;
	try {
		return set.has(encodeURI(url));
	} catch {
		return false;
	}
}

// ── Prefetching ────────────────────────────────────────────────────
// Pulling the next track into the audio cache while the current one
// plays makes "Next" feel instant on slow connections. Uses a plain
// `fetch()` so the request flows through the SW's audio handler and
// lands in `audio-cache-v1` automatically — no special path needed.

const prefetchInFlight = new Set<string>();

interface NetworkInformation {
	saveData?: boolean;
	effectiveType?: '4g' | '3g' | '2g' | 'slow-2g';
}

function getConnection(): NetworkInformation | null {
	if (!browser) return null;
	const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
	return conn ?? null;
}

/** Skip on Save-Data or extremely slow links (2g, slow-2g). Unknown
 *  / missing API → prefetch (sensible default for desktop browsers
 *  that don't expose Network Information). */
function shouldPrefetchOverConnection(): boolean {
	const conn = getConnection();
	if (!conn) return true;
	if (conn.saveData) return false;
	if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g') return false;
	return true;
}

/** Warm the audio cache for `url` in the background. Resolves once the
 *  fetch completes (or is skipped). Safe to call repeatedly — already-
 *  cached URLs and in-flight prefetches are deduplicated. */
export async function prefetchAudio(url: string): Promise<void> {
	if (!browser || !url) return;
	if (prefetchInFlight.has(url)) return;
	if (!shouldPrefetchOverConnection()) return;

	try {
		if (await isCached(url)) return;
	} catch {
		/* fall through and try prefetching anyway */
	}

	prefetchInFlight.add(url);
	try {
		// `priority: 'low'` keeps the prefetch from competing with the
		// audio element's high-priority Range fetch on the current
		// track — supported in Chromium-based browsers, ignored elsewhere.
		// `priority: 'low'` keeps the prefetch from competing with the
		// audio element's high-priority Range fetch on the current
		// track — Chromium honours it, others silently ignore.
		await fetch(url, {
			method: 'GET',
			mode: 'cors',
			credentials: 'omit',
			priority: 'low'
		} as RequestInit & { priority: 'low' });
		// Refresh the reactive set so subscribers (the music page's
		// "En cache" panel, the player's badge) see the new entry.
		void refreshCachedUrls();
	} catch {
		/* network failed — next play retries */
	} finally {
		prefetchInFlight.delete(url);
	}
}

/** Returns true if the given URL has a cached response in the audio cache. */
export async function isCached(url: string): Promise<boolean> {
	if (!browser || typeof caches === 'undefined' || !url) return false;
	try {
		const cache = await caches.open(AUDIO_CACHE_NAME);
		const match = await cache.match(url, { ignoreSearch: false, ignoreVary: true });
		return !!match;
	} catch {
		return false;
	}
}

/** Returns a human-readable size of the audio cache, e.g. "42 MB". */
export async function getCacheSize(): Promise<string> {
	if (!browser || typeof caches === 'undefined') return '0 B';
	try {
		const cache = await caches.open(AUDIO_CACHE_NAME);
		const requests = await cache.keys();

		let total = 0;
		for (const request of requests) {
			const response = await cache.match(request);
			if (!response) continue;

			// Prefer Content-Length when present — avoids the cost of reading
			// every blob into memory just to measure it. Fall back to the blob
			// size when the header is missing or unparseable.
			const cl = response.headers.get('content-length');
			const parsed = cl ? Number.parseInt(cl, 10) : Number.NaN;
			if (Number.isFinite(parsed) && parsed > 0) {
				total += parsed;
			} else {
				try {
					const blob = await response.clone().blob();
					total += blob.size;
				} catch {
					/* unreadable entry — skip */
				}
			}
		}

		return formatBytes(total);
	} catch {
		return '0 B';
	}
}

/** Removes every entry from the audio cache. */
export async function clearCache(): Promise<void> {
	if (!browser || typeof caches === 'undefined') return;
	try {
		await caches.delete(AUDIO_CACHE_NAME);
	} catch {
		/* ignore — nothing the caller can do about it */
	}
	cachedUrlsInternal.set(new Set());
}

function formatBytes(bytes: number): string {
	if (!bytes || bytes < 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let i = 0;
	let value = bytes;
	while (value >= 1024 && i < units.length - 1) {
		value /= 1024;
		i++;
	}
	const rounded = value >= 10 || i === 0 ? Math.round(value) : Math.round(value * 10) / 10;
	return `${rounded} ${units[i]}`;
}
// ── END: audio cache utility ──────────────────────────────────────
