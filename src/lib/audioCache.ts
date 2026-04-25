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
