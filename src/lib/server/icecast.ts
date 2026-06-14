import { env } from '$env/dynamic/private';
import { getLiveAudioSourceUrl } from '$lib/server/live-audio';

// Reads the real listener count from Icecast's public `/status-json.xsl`, the
// same source the Fly dashboard reports. This replaces the old per-browser
// MongoDB heartbeat count, which measured a different population (and undercounted
// badly because its TTL never matched the player's poll cadence).

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

const STATUS_FETCH_TIMEOUT_MS = 3000;

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

export async function getIcecastSnapshot(): Promise<IcecastSnapshot> {
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
		const listeners = sources.reduce((sum, s) => sum + (s.listeners ?? 0), 0);
		return { reachable: true, sourceActive: sources.length > 0, listeners };
	} catch {
		return { reachable: false, sourceActive: false, listeners: 0 };
	}
}
