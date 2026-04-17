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

export async function getIcecastSnapshot(): Promise<IcecastSnapshot> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 3000);
		const res = await fetch(icecastStatusUrl(), { signal: controller.signal });
		clearTimeout(timeout);
		if (!res.ok) return { reachable: false, sourceActive: false, listeners: 0 };
		const json = (await res.json()) as IcecastStatus;
		const source = json.icestats?.source;
		if (!source) return { reachable: true, sourceActive: false, listeners: 0 };
		const sources = Array.isArray(source) ? source : [source];
		const listeners = sources.reduce((sum, s) => sum + (s.listeners ?? 0), 0);
		return { reachable: true, sourceActive: sources.length > 0, listeners };
	} catch {
		return { reachable: false, sourceActive: false, listeners: 0 };
	}
}
