import { env } from '$env/dynamic/private';

interface IcecastSource {
	listenurl?: string;
	stream_start_iso8601?: string;
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

export async function getIcecastSnapshot(): Promise<IcecastSnapshot> {
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
		const mountSources = sources.filter((s) => isStreamMount(s, mount));
		const listeners = mountSources.reduce((sum, s) => sum + (s.listeners ?? 0), 0);
		return { reachable: true, sourceActive: mountSources.length > 0, listeners };
	} catch {
		return { reachable: false, sourceActive: false, listeners: 0 };
	}
}
