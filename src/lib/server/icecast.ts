import { env } from '$env/dynamic/private';
import { getLiveAudioHlsUrl, getLiveAudioSourceUrl, probeLiveAudio } from '$lib/server/live-audio';

// Reads the real listener count from Icecast's public `/status-json.xsl`, the
// same source the Fly dashboard reports. This replaces the old per-browser
// MongoDB heartbeat count, which measured a different population (and undercounted
// badly because its TTL never matched the player's poll cadence).

interface IcecastSource {
	listenurl?: string;
	stream_start_iso8601?: string;
	server_type?: string;
	listeners?: number;
}

interface IcecastStatus {
	icestats?: {
		source?: IcecastSource | IcecastSource[];
	};
}

export interface IcecastSnapshot {
	reachable: boolean;
	sourceActive: boolean;
	listeners: number;
}

// Measured production TTFB from the Fly app (jnb) is 4-6s under load — a 3s
// timeout made every check read "unreachable" while the stream was actually
// up, which tripped the auto-end safety mid-broadcast. Keep below Vercel's
// function budget but comfortably above the observed worst case.
const STATUS_FETCH_TIMEOUT_MS = 10_000;

/**
 * Status URL resolution: prefer an explicit `ICECAST_STATUS_URL` override,
 * otherwise derive it from the configured stream URL so no extra prod config is
 * needed (e.g. `https://…/radio.mp3` → `https://…/status-json.xsl`).
 */
function icecastStatusUrl(): string {
	if (env.ICECAST_STATUS_URL && env.ICECAST_STATUS_URL.length > 0) {
		return env.ICECAST_STATUS_URL;
	}
	try {
		return new URL('/status-json.xsl', getLiveAudioSourceUrl()).toString();
	} catch {
		return 'http://localhost:8000/status-json.xsl';
	}
}

/** Mount path of the real broadcast stream (e.g. `/radio.mp3`), derived from
 *  the configured stream URL. Detection must be mount-specific: the Fly stack
 *  also runs a permanent silence source on `/silence.mp3` (the fallback that
 *  keeps listener connections alive through source drops) which must never
 *  count as "on air". */
function streamMountPath(): string {
	try {
		const pathname = new URL(getLiveAudioSourceUrl(), 'http://localhost').pathname;
		return pathname && pathname !== '/' ? pathname : '/radio.mp3';
	} catch {
		return '/radio.mp3';
	}
}

function isStreamMount(source: IcecastSource, mount: string): boolean {
	if (!source.listenurl) return false;
	try {
		return new URL(source.listenurl).pathname === mount;
	} catch {
		return source.listenurl.endsWith(mount);
	}
}

/** Because /radio.mp3 is declared in icecast.xml (for the silence fallback),
 *  status-json lists the mount even with NO publisher connected — a "dummy"
 *  entry with only listenurl/listeners. A real connected source always
 *  carries stream metadata (stream_start / server_type); the dummy carries
 *  neither. Without this check the admin showed "live detected" and the
 *  monitor played fallback silence while OBS was off. */
function hasConnectedSource(source: IcecastSource): boolean {
	return (
		typeof source.stream_start_iso8601 === 'string' || typeof source.server_type === 'string'
	);
}

/** Distinct clients currently pulling the HLS DVR feed (the default playback
 *  path since the DVR shipped — these never open an Icecast connection, so
 *  the mount count alone misses them). Served by the recorder at /hls-stats,
 *  derived from the playlist URL. 0 when HLS isn't configured or the recorder
 *  is unreachable. */
async function fetchHlsListenerCount(): Promise<number> {
	const hlsUrl = getLiveAudioHlsUrl();
	if (!hlsUrl) return 0;
	try {
		const statsUrl = new URL('/hls-stats', hlsUrl).toString();
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), STATUS_FETCH_TIMEOUT_MS);
		const res = await fetch(statsUrl, { signal: controller.signal });
		clearTimeout(timeout);
		if (!res.ok) return 0;
		const json = (await res.json()) as { listeners?: number };
		return typeof json.listeners === 'number' && json.listeners > 0 ? json.listeners : 0;
	} catch {
		return 0;
	}
}

async function fetchIcecastStatus(): Promise<IcecastSnapshot> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), STATUS_FETCH_TIMEOUT_MS);
		const res = await fetch(icecastStatusUrl(), { signal: controller.signal });
		clearTimeout(timeout);
		if (!res.ok) return { reachable: false, sourceActive: false, listeners: 0 };
		const json = (await res.json()) as IcecastStatus;
		const source = json.icestats?.source;
		if (!source) return { reachable: true, sourceActive: false, listeners: 0 };
		const sources = Array.isArray(source) ? source : [source];
		const mount = streamMountPath();
		const mountSources = sources.filter((s) => isStreamMount(s, mount) && hasConnectedSource(s));
		const listeners = mountSources.reduce((sum, s) => sum + (s.listeners ?? 0), 0);
		return { reachable: true, sourceActive: mountSources.length > 0, listeners };
	} catch {
		return { reachable: false, sourceActive: false, listeners: 0 };
	}
}

export async function getIcecastSnapshot(): Promise<IcecastSnapshot> {
	// Total audience = Icecast connections (fallback-mode listeners, the
	// recorder) + HLS DVR clients. Fetched in parallel — the HLS count adds
	// no latency and fails soft to 0.
	const [snapshot, hlsListeners] = await Promise.all([
		fetchIcecastStatus(),
		fetchHlsListenerCount()
	]);
	return { ...snapshot, listeners: snapshot.listeners + hlsListeners };
}

export interface LiveAudioCheck {
	isLive: boolean;
	sourceUrl: string;
	listeners: number;
	status: number | null;
	error: string | null;
}

/** Authoritative "is the broadcast on air" check.
 *
 *  Primary signal is the status page (is the real mount's source connected),
 *  NOT the old read-bytes probe: with the silence fallback mount, bytes flow
 *  on /radio.mp3 even when the broadcaster is gone, so a byte-flow probe would
 *  report live forever. The byte probe remains as a fallback for when the
 *  status page itself is unreachable. */
export async function checkLiveAudio(fetchFn: typeof fetch): Promise<LiveAudioCheck> {
	const sourceUrl = getLiveAudioSourceUrl();
	const snapshot = await getIcecastSnapshot();
	if (snapshot.reachable) {
		return {
			isLive: snapshot.sourceActive,
			sourceUrl,
			listeners: snapshot.listeners,
			status: 200,
			error: null
		};
	}
	const probe = await probeLiveAudio(fetchFn);
	return { ...probe, listeners: 0 };
}
