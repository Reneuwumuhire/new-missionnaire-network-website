import { env } from '$env/dynamic/private';

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

function icecastStatusUrl(): string {
	return env.ICECAST_STATUS_URL ?? 'http://localhost:8000/status-json.xsl';
}

/** Public MP3 stream URL. Falls back to deriving from the status URL. */
export function icecastStreamUrl(): string {
	if (env.ICECAST_STREAM_URL) return env.ICECAST_STREAM_URL;
	return icecastStatusUrl().replace(/\/status-json\.xsl$/, '/radio.mp3');
}

/** HLS DVR playlist (PDT-stamped) served by the recorder. Preferred source for
 *  the live monitor: hls.js `playingDate` gives the exact broadcast wall-clock
 *  of the audio the operator hears, which makes the subtitle-sync anchor exact
 *  for every listener regardless of anyone's buffering latency. Derives from
 *  RECORDER_URL (the recorder serves /hls/*) unless overridden. */
export function liveAudioHlsUrl(): string | null {
	if (env.LIVE_AUDIO_HLS_URL) return env.LIVE_AUDIO_HLS_URL;
	if (env.RECORDER_URL) return `${env.RECORDER_URL.replace(/\/$/, '')}/hls/live.m3u8`;
	return null;
}

/** Mount path of the real broadcast stream (e.g. `/radio.mp3`). Detection must
 *  be mount-specific: the Fly stack also runs a permanent silence source on
 *  `/silence.mp3` (the fallback that keeps listener connections alive through
 *  source drops) which must never count as "on air". */
function streamMountPath(): string {
	try {
		const pathname = new URL(icecastStreamUrl(), 'http://localhost').pathname;
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
 *  path — these never open an Icecast connection, so the mount count alone
 *  misses them, including the admin's own HLS monitor). Served by the
 *  recorder at /hls-stats. 0 when unconfigured or unreachable. */
async function fetchHlsListenerCount(): Promise<number> {
	const hlsUrl = liveAudioHlsUrl();
	if (!hlsUrl) return 0;
	try {
		const statsUrl = new URL('/hls-stats', hlsUrl).toString();
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10_000);
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
		// Production TTFB from the Fly app is 4-6s under load; a 3s timeout
		// showed "Icecast unreachable" while the stream was up.
		const timeout = setTimeout(() => controller.abort(), 10_000);
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
	// recorder) + HLS DVR clients. Parallel; the HLS count fails soft to 0.
	const [snapshot, hlsListeners] = await Promise.all([
		fetchIcecastStatus(),
		fetchHlsListenerCount()
	]);
	return { ...snapshot, listeners: snapshot.listeners + hlsListeners };
}
