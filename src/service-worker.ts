/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

// ── App shell cache (versioned) ───────────────────────────────────
// Bumped on every deploy via the SvelteKit-injected `version` token.
// Old shells are deleted in `activate` so users always run the latest
// HTML/CSS/JS even when the network is unreachable.
const APP_SHELL_CACHE = `app-shell-${version}`;

// ── Audio cache (version-independent, NEW name kept stable) ───────
// Stable cache for audio files so cached tracks survive deploys —
// users don't lose their offline music every time the app updates.
const AUDIO_CACHE_NAME = 'audio-cache-v1';
const AUDIO_EXTENSIONS = ['.mp3', '.ogg', '.wav', '.flac', '.aac', '.m4a'];

// Hard ceiling on what we'll write to the audio cache. Sermons run
// 30–120 MB; music tracks are 3–7 MB. Anything bigger than this is
// almost certainly long-form content that would drain device storage
// quickly, so we serve it directly from the network without caching.
const MAX_AUDIO_CACHE_BYTES = 25 * 1024 * 1024;

// Pages whose audio playback should never populate the cache. Matches
// /predications and /predications/[slug] — sermons originate there.
const NO_CACHE_REFERRER_PREFIXES = ['/predications'];

function isFromNoCachePage(request: Request): boolean {
	const referrer = request.referrer;
	if (!referrer) return false;
	try {
		const refUrl = new URL(referrer);
		return NO_CACHE_REFERRER_PREFIXES.some((prefix) => refUrl.pathname.startsWith(prefix));
	} catch {
		return false;
	}
}

// ── YouTube thumbnails cache (version-independent) ────────────────
const YT_THUMB_CACHE = 'yt-thumbnails';

// ── Offline fallback page ─────────────────────────────────────────
// Pre-cached during install. Served when both the network and the
// app-shell cache miss for navigation requests.
const OFFLINE_URL = '/offline.html';

// ── Critical app shell (always pre-cached on install) ─────────────
// `[...build, ...files]` already covers SvelteKit chunks + everything
// in /static, but we explicitly pin the offline page and root URL so
// the install step fails loudly if either is missing.
const APP_SHELL_ASSETS = [...build, ...files, OFFLINE_URL, '/'];

function isAudioRequest(url: URL): boolean {
	const path = url.pathname.toLowerCase();
	return AUDIO_EXTENSIONS.some((ext) => path.endsWith(ext));
}

// ── Install ───────────────────────────────────────────────────────
// Pre-cache the app shell so the first paint after install works
// fully offline. We DO NOT auto-skipWaiting here — that's handled
// conditionally in the `message` handler so updates show a banner
// instead of forcing a silent reload.
sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(APP_SHELL_CACHE);
			// Use individual put() calls so a single 404 doesn't fail the
			// whole install (cache.addAll is all-or-nothing). Build
			// artefacts are content-hashed, so the HTTP cache is always
			// safe to share — `cache: 'reload'` was forcing every asset
			// through the network on each SW install, slamming Vercel's
			// edge in parallel and competing for bandwidth with the
			// page's own resource loads on first visit after a deploy.
			await Promise.all(
				APP_SHELL_ASSETS.map(async (asset) => {
					try {
						const response = await fetch(asset);
						if (response.ok) await cache.put(asset, response);
					} catch {
						/* skip individual failures — best-effort pre-cache */
					}
				})
			);

			// First-install fast path: when there's no previously active
			// worker, the user has never had a cached shell — take
			// control immediately so subsequent navigations hit the cache
			// without a manual reload. Updates (when an old SW is still
			// active) take the message-driven path: banner → user click
			// → SKIP_WAITING message → controllerchange → reload.
			if (!sw.registration.active) {
				await sw.skipWaiting();
			}
		})()
	);
});

// ── Activate ──────────────────────────────────────────────────────
// Delete every cache that doesn't match the current version, with the
// audio + thumbnail caches whitelisted (they're versioned independently
// of the app shell).
sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys.map((key) => {
					if (key === APP_SHELL_CACHE) return undefined;
					if (key === AUDIO_CACHE_NAME) return undefined;
					if (key === YT_THUMB_CACHE) return undefined;
					return caches.delete(key);
				})
			);
			await sw.clients.claim();

			// Tell every controlled client which version is now active.
			// The layout uses this to decide whether to show the update
			// banner: if the client was already running, the version it
			// booted with no longer matches the controller and we want
			// the user to reload to pick up the new bundle.
			const clientList = await sw.clients.matchAll({ includeUncontrolled: true });
			for (const client of clientList) {
				client.postMessage({ type: 'SW_ACTIVATED', version });
			}
		})()
	);
});

// ── Message handler — controlled update flow ─────────────────────
// The page sends `{type: 'SKIP_WAITING'}` after the listener clicks
// "Reload" on the update banner. We swap the waiting SW into active
// state; the layout listens for `controllerchange` and reloads.
sw.addEventListener('message', (event) => {
	if (!event.data) return;
	if (event.data.type === 'SKIP_WAITING') {
		sw.skipWaiting();
	}
	if (event.data.type === 'GET_VERSION' && event.source) {
		(event.source as Client).postMessage({
			type: 'VERSION',
			version,
			requestId: event.data.requestId
		});
	}
});

// ── Push Notifications ────────────────────────────────────────────

function ackNotification(action: string, tag: string) {
	fetch('/api/notifications/ack', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ action, tag, timestamp: Date.now() })
	}).catch(() => {
		// Best-effort tracking — don't block user interaction
	});
}

sw.addEventListener('push', (event) => {
	if (!event.data) return;

	try {
		const payload = event.data.json() as {
			title: string;
			body: string;
			url?: string;
			icon?: string;
			image?: string;
		};

		const tag = payload.url || 'missionnaire-notification';

		const options: NotificationOptions & {
			renotify?: boolean;
			image?: string;
			actions?: { action: string; title: string; icon?: string }[];
		} = {
			body: payload.body,
			icon: payload.icon || '/favicon.png',
			badge: '/favicon.png',
			data: { url: payload.url || '/' },
			tag,
			renotify: true,
			actions: [
				{ action: 'open', title: 'Ouvrir' },
				{ action: 'dismiss', title: 'Ignorer' }
			]
		};
		if (payload.image) options.image = payload.image;

		event.waitUntil(
			sw.registration.showNotification(payload.title, options).then(() => {
				ackNotification('received', tag);
			})
		);
	} catch (e) {
		console.error('[SW] Error handling push event:', e);
	}
});

sw.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const url = (event.notification.data?.url as string) || '/';
	const tag = event.notification.tag || 'unknown';
	const action = event.action || 'click';

	// Track that the user interacted with the notification
	ackNotification(action === 'dismiss' ? 'dismissed' : 'clicked', tag);

	// "dismiss" action — just close, don't navigate
	if (action === 'dismiss') return;

	event.waitUntil(
		sw.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
			// Focus an existing tab already on the target URL
			for (const client of clients) {
				if (new URL(client.url).pathname === url && 'focus' in client) {
					return client.focus();
				}
			}
			// Focus any existing tab on the same origin and navigate it
			for (const client of clients) {
				if (new URL(client.url).origin === sw.location.origin && 'focus' in client) {
					return client
						.focus()
						.then((c) => ('navigate' in c ? c.navigate(url) : sw.clients.openWindow(url)));
				}
			}
			// Otherwise open a new window
			return sw.clients.openWindow(url);
		})
	);
});

// ── Fetch / Cache strategies ──────────────────────────────────────
// Three clearly-separated lanes:
//   1. Audio  → AUDIO_CACHE_NAME, cache-first with Range slicing
//   2. Data   → /api/* — network-only (never cached, always fresh)
//   3. Shell  → APP_SHELL_CACHE — cache-first for build/static assets,
//              stale-while-revalidate for navigations, network-first
//              with cache fallback for everything else same-origin
// Cross-origin everything else (except YouTube thumbs) is left alone.

sw.addEventListener('fetch', (event) => {
	if (event.request.method !== 'GET') return;

	const url = new URL(event.request.url);

	// Lane 2: Data / API — never cache, always hit the network.
	// Crawler files also shouldn't be cached.
	if (url.pathname.startsWith('/api/')) return;
	if (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml') return;

	// Lane 1: Audio — cache-first with Range support. Lives in its own
	// versioned cache so deploys don't wipe the listener's library.
	if (isAudioRequest(url)) {
		event.respondWith(handleAudioFetch(event));
		return;
	}

	// YouTube thumbnails — cache-first, separate cache.
	if (url.hostname === 'i.ytimg.com') {
		event.respondWith(handleThumbnailFetch(event.request));
		return;
	}

	// Don't intercept other cross-origin requests (fonts.googleapis,
	// analytics, etc.) — let the browser handle them normally.
	if (url.origin !== sw.location.origin) return;

	// Lane 3: App shell.
	event.respondWith(handleAppShellFetch(event.request, url));
});

async function handleThumbnailFetch(request: Request): Promise<Response> {
	const cache = await caches.open(YT_THUMB_CACHE);
	const cached = await cache.match(request);
	if (cached) return cached;
	try {
		const response = await fetch(request);
		if (response.ok) cache.put(request, response.clone());
		return response;
	} catch {
		return new Response('', { status: 504 });
	}
}

async function handleAppShellFetch(request: Request, url: URL): Promise<Response> {
	const cache = await caches.open(APP_SHELL_CACHE);

	// Build artefacts and pinned static files: cache-first. These are
	// content-hashed by SvelteKit, so a cache hit is always correct
	// for the version we have installed.
	if (build.includes(url.pathname) || files.includes(url.pathname)) {
		const cached = await cache.match(request);
		if (cached) return cached;
		try {
			const response = await fetch(request);
			if (response.status === 200) cache.put(request, response.clone());
			return response;
		} catch {
			// One last try in case the same asset got cached under a
			// different request (e.g. with/without trailing slash).
			const fallback = await cache.match(url.pathname);
			if (fallback) return fallback;
			return offlineResponse(cache);
		}
	}

	// Navigation requests (HTML pages): stale-while-revalidate so the
	// installed app paints instantly from cache on launch instead of
	// waiting on a slow network. The cache is refreshed in the
	// background so the next visit sees fresh content.
	if (request.mode === 'navigate') {
		const cacheControl = request.headers.get('cache-control') || '';
		const wantsFreshHtml = request.cache === 'reload' || cacheControl.includes('no-cache');

		if (wantsFreshHtml) {
			try {
				const response = await fetch(request);
				if (response.status === 200) {
					cache.put(request, response.clone());
				}
				return response;
			} catch {
				const cached = await cache.match(request);
				if (cached) return cached;
				return offlineResponse(cache);
			}
		}

		const cached = await cache.match(request);
		const networkFetch = fetch(request)
			.then((response) => {
				if (response.status === 200) {
					cache.put(request, response.clone());
				}
				return response;
			})
			.catch(() => null);

		if (cached) {
			void networkFetch;
			return cached;
		}

		const fresh = await networkFetch;
		if (fresh) return fresh;

		return offlineResponse(cache);
	}

	// Subresources (CSS chunks fetched at runtime, dynamic imports,
	// images that aren't in `files`): network-first, fall back to cache.
	try {
		const response = await fetch(request);
		if (response.status === 200) cache.put(request, response.clone());
		return response;
	} catch {
		const cached = await cache.match(request);
		if (cached) return cached;
		return new Response('', { status: 504 });
	}
}

async function offlineResponse(cache: Cache): Promise<Response> {
	const offline = await cache.match(OFFLINE_URL);
	if (offline) return offline;
	const cachedIndex = await cache.match('/');
	if (cachedIndex) return cachedIndex;
	return new Response(
		'<!DOCTYPE html><meta charset="utf-8"><title>Hors ligne</title><body style="font-family:system-ui;background:#FAF8F3;color:#292524;padding:48px;text-align:center"><h1>Hors ligne</h1><p>Aucune connexion. Réessayez dans un instant.</p></body>',
		{
			status: 503,
			headers: { 'Content-Type': 'text/html; charset=utf-8' }
		}
	);
}

// ── Audio cache-first helpers (unchanged) ────────────────────────
// Cache key strips method/body/Range so every variant of "play this
// track" — full GET, byte-range probe, seek-to-the-end probe — hits
// the same cached entry.
function buildAudioCacheKey(request: Request): Request {
	return new Request(request.url, { method: 'GET' });
}

async function handleAudioFetch(event: FetchEvent): Promise<Response> {
	const request = event.request;
	const cache = await caches.open(AUDIO_CACHE_NAME);
	const cacheKey = buildAudioCacheKey(request);
	const rangeHeader = request.headers.get('range');

	// Cache hit — serve from disk. Slice if the audio element asked for
	// a Range so seeking after caching still produces 206 Partial Content
	// (the only thing that lets the browser scrub freely on iOS Safari).
	const cached = await cache.match(cacheKey);
	if (cached) {
		if (rangeHeader) {
			try {
				return await sliceCachedToRange(cached, rangeHeader);
			} catch {
				// Slicing failed (corrupt cache entry?) — fall through to network.
			}
		} else {
			return cached.clone();
		}
	}

	// Cache miss — pass the ORIGINAL request through to the network so
	// the audio element receives the same streaming response it would
	// without the SW (no buffering, no first-byte penalty). The body is
	// teed via `response.clone()` and inspected in the background; if
	// the response covers the full file (the common "Range: bytes=0-"
	// reply that S3 returns as 206 with the entire file), we promote
	// it to a 200 and write it to cache. If it's a partial response
	// (a seek mid-file), we kick off a background full-file fetch.
	let response: Response;
	try {
		response = await fetch(request);
	} catch {
		return new Response('Offline', { status: 503, statusText: 'Offline' });
	}

	if (response.status !== 200 && response.status !== 206) {
		// 4xx/5xx — surface the failure to the audio element directly.
		return response;
	}

	// Skip the cache write for audio originating on the predications
	// pages — sermons are 30–120 MB and would fill device storage
	// quickly. Cache HITS still serve from disk if a previously-stored
	// entry exists; we just stop adding new ones from this lane.
	if (isFromNoCachePage(request)) {
		return response;
	}

	const responseForCache = response.clone();
	// Extend the SW's lifetime until the cache write settles; without
	// `waitUntil` the worker may be killed before the body finishes
	// buffering into the cache.
	event.waitUntil(capturePassthroughForCache(cache, cacheKey, responseForCache));

	return response;
}

/** Inspects a passed-through network response and writes it to cache
 *  when it represents the complete file. Bandwidth-conscious:
 *  - 200 OK → stored directly (no extra fetch).
 *  - 206 covering bytes 0..total-1 → converted to 200 and stored
 *    (this is what S3 returns for the browser's initial "bytes=0-"
 *    probe, so the FIRST play warms the cache for free).
 *  - 206 partial (seek/probe) → schedules ONE background full-file
 *    fetch so the next play is served from cache. */
async function capturePassthroughForCache(
	cache: Cache,
	cacheKey: Request,
	response: Response
): Promise<void> {
	try {
		if (response.status === 200) {
			// Skip oversized 200s (large podcast/sermon files) — content-length
			// is the cheapest possible discriminator and avoids buffering a
			// 100 MB blob into memory just to discover we shouldn't store it.
			if (exceedsMaxCacheSize(response.headers.get('content-length'))) return;
			await cache.put(cacheKey, response);
			return;
		}

		if (response.status !== 206) return;

		const contentRange = response.headers.get('content-range');
		const match = contentRange ? /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(contentRange.trim()) : null;
		if (!match) return;

		const start = Number.parseInt(match[1], 10);
		const end = Number.parseInt(match[2], 10);
		const total = Number.parseInt(match[3], 10);

		if (start === 0 && end === total - 1) {
			// Full file delivered as 206. Bail before buffering if the total
			// size is over the cap — same reasoning as the 200 branch.
			if (Number.isFinite(total) && total > MAX_AUDIO_CACHE_BYTES) return;

			// Buffer into a fresh 200 so the cache always stores complete,
			// sliceable bodies.
			const buffer = await response.arrayBuffer();
			if (buffer.byteLength > MAX_AUDIO_CACHE_BYTES) return;
			const headers = copyResponseHeaders(response, {
				'Content-Length': String(buffer.byteLength)
			});
			await cache.put(cacheKey, new Response(buffer, { status: 200, statusText: 'OK', headers }));
			return;
		}

		// Partial — fetch the rest in the background so future plays hit cache.
		await warmCacheInBackground(cache, cacheKey);
	} catch {
		// Cache writes are best-effort. A partial-stream hangup, quota
		// exhaustion, or opaque-response rejection here just means the
		// next play will warm the cache instead.
	}
}

function exceedsMaxCacheSize(contentLengthHeader: string | null): boolean {
	if (!contentLengthHeader) return false;
	const size = Number.parseInt(contentLengthHeader, 10);
	if (!Number.isFinite(size)) return false;
	return size > MAX_AUDIO_CACHE_BYTES;
}

const warmupInFlight = new Set<string>();
async function warmCacheInBackground(cache: Cache, cacheKey: Request): Promise<void> {
	if (warmupInFlight.has(cacheKey.url)) return;
	warmupInFlight.add(cacheKey.url);
	try {
		const response = await fetch(cacheKey);
		if (!response.ok || response.status !== 200) return;
		if (exceedsMaxCacheSize(response.headers.get('content-length'))) return;
		await cache.put(cacheKey, response);
	} catch {
		/* network failed — the next play will warm again */
	} finally {
		warmupInFlight.delete(cacheKey.url);
	}
}

async function sliceCachedToRange(response: Response, rangeHeader: string): Promise<Response> {
	const buffer = await response.clone().arrayBuffer();
	const total = buffer.byteLength;

	// Parse "bytes=START-END" / "bytes=START-" / "bytes=-SUFFIX".
	const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
	if (!match) {
		return new Response(buffer, {
			status: 200,
			headers: copyResponseHeaders(response, { 'Content-Length': String(total) })
		});
	}

	let start: number;
	let end: number;
	if (match[1] === '' && match[2] !== '') {
		// Suffix range: last N bytes.
		const suffix = Number.parseInt(match[2], 10);
		start = Math.max(0, total - suffix);
		end = total - 1;
	} else {
		start = match[1] === '' ? 0 : Number.parseInt(match[1], 10);
		end = match[2] === '' ? total - 1 : Number.parseInt(match[2], 10);
	}

	if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= total) {
		return new Response(null, {
			status: 416,
			statusText: 'Range Not Satisfiable',
			headers: { 'Content-Range': `bytes */${total}` }
		});
	}

	end = Math.min(end, total - 1);
	const chunk = buffer.slice(start, end + 1);
	const length = end - start + 1;

	return new Response(chunk, {
		status: 206,
		statusText: 'Partial Content',
		headers: copyResponseHeaders(response, {
			'Content-Range': `bytes ${start}-${end}/${total}`,
			'Content-Length': String(length),
			'Accept-Ranges': 'bytes'
		})
	});
}

function copyResponseHeaders(response: Response, overrides: Record<string, string>): Headers {
	const headers = new Headers();
	response.headers.forEach((value, key) => {
		const k = key.toLowerCase();
		// Drop length/range so callers can set fresh, accurate values.
		if (k === 'content-length' || k === 'content-range') return;
		headers.set(key, value);
	});
	for (const [k, v] of Object.entries(overrides)) headers.set(k, v);
	if (!headers.has('Accept-Ranges')) headers.set('Accept-Ranges', 'bytes');
	return headers;
}
