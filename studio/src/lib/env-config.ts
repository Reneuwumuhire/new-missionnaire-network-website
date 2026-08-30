import type { Destination, Settings } from './state.svelte';

export type StudioEnvConfig = Partial<Pick<Settings, 'mainSiteUrl' | 'adminSiteUrl'>> & {
	missionnaireUrl?: string;
	missionnaireKey?: string;
	youtubeUrl?: string;
	youtubeKey?: string;
};

function values(text: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim().replace(/^export\s+/, '');
		if (!line || line.startsWith('#')) continue;
		const separator = line.indexOf('=');
		if (separator < 1) continue;
		const key = line.slice(0, separator).trim();
		let value = line.slice(separator + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		result[key] = value;
	}
	return result;
}

function first(env: Record<string, string>, ...keys: string[]): string | undefined {
	return keys.map((key) => env[key]?.trim()).find(Boolean);
}

function webUrl(value: string | undefined, label: string): string | undefined {
	if (!value) return undefined;
	value = value.replace(/^https:\/\/missionnaire\.net(?=\/|$)/, 'https://www.missionnaire.net');
	value = value.replace(
		/^https:\/\/www\.admin\.missionnaire\.net(?=\/|$)/,
		'https://admin.missionnaire.net'
	);
	const loopback = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/.test(value);
	if (!value.startsWith('https://') && !loopback)
		throw new Error(`${label} must use https:// (or local http://).`);
	return value.replace(/\/+$/, '');
}

function rtmpUrl(value: string | undefined, label: string): string | undefined {
	if (!value) return undefined;
	if (!/^rtmps?:\/\//.test(value) || /[|[\]'"\\\s]/.test(value))
		throw new Error(`${label} must use rtmp:// or rtmps://.`);
	return value.replace(/\/+$/, '');
}

export function parseStudioEnv(text: string): StudioEnvConfig {
	const env = values(text);
	return {
		mainSiteUrl: webUrl(
			first(env, 'STUDIO_MAIN_SITE_URL', 'MAIN_SITE_URL', 'PUBLIC_MAIN_URL'),
			'Main site URL'
		),
		adminSiteUrl: webUrl(first(env, 'STUDIO_ADMIN_SITE_URL', 'ADMIN_SITE_URL'), 'Admin site URL'),
		missionnaireUrl: rtmpUrl(
			first(env, 'MISSIONNAIRE_RTMP_URL', 'STUDIO_RTMP_URL', 'RTMP_URL'),
			'Missionnaire RTMP URL'
		),
		missionnaireKey: first(env, 'MISSIONNAIRE_STREAM_KEY', 'STUDIO_STREAM_KEY', 'STREAM_KEY'),
		youtubeUrl: rtmpUrl(first(env, 'YOUTUBE_RTMP_URL'), 'YouTube RTMP URL'),
		youtubeKey: first(env, 'YOUTUBE_STREAM_KEY')
	};
}

export function importedCount(config: StudioEnvConfig): number {
	return Object.values(config).filter((value) => value !== undefined).length;
}

export function mergeEnvDestinations(
	destinations: Destination[],
	config: StudioEnvConfig
): Destination[] {
	return destinations.map((destination) => {
		const youtube = /youtube/i.test(destination.name) || /youtube/i.test(destination.url);
		if (youtube && (config.youtubeUrl || config.youtubeKey)) {
			return {
				...destination,
				url: config.youtubeUrl ?? destination.url,
				key: config.youtubeKey ?? destination.key,
				enabled: true,
				hold: false
			};
		}
		if (!youtube && (config.missionnaireUrl || config.missionnaireKey)) {
			return {
				...destination,
				url: config.missionnaireUrl ?? destination.url,
				key: config.missionnaireKey ?? destination.key,
				enabled: true,
				hold: false
			};
		}
		return destination;
	});
}
