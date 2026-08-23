import { describe, expect, it } from 'vitest';
import { mergeEnvDestinations, parseStudioEnv } from './env-config';
import type { Destination } from './state.svelte';

describe('Studio .env import', () => {
	it('imports only known Studio settings and preserves equals signs in secrets', () => {
		const config = parseStudioEnv(`
			MONGODB_URI=mongodb://do-not-import
			PUBLIC_MAIN_URL="http://localhost:8081/"
			ADMIN_SITE_URL=https://admin.missionnaire.net
			RECORDER_TOKEN=abc=123
			RTMP_URL=rtmp://localhost:1935/live
			STREAM_KEY=obs
			YOUTUBE_STREAM_KEY=youtube-secret
		`);
		expect(config).toEqual({
			mainSiteUrl: 'http://localhost:8081',
			adminSiteUrl: 'https://admin.missionnaire.net',
			recorderUrl: undefined,
			recorderToken: 'abc=123',
			missionnaireUrl: 'rtmp://localhost:1935/live',
			missionnaireKey: 'obs',
			youtubeUrl: undefined,
			youtubeKey: 'youtube-secret'
		});
	});

	it('uses the canonical production host instead of returning redirect text', () => {
		expect(parseStudioEnv('MAIN_SITE_URL=https://missionnaire.net').mainSiteUrl).toBe(
			'https://www.missionnaire.net'
		);
		expect(
			parseStudioEnv('ADMIN_SITE_URL=https://www.admin.missionnaire.net').adminSiteUrl
		).toBe('https://admin.missionnaire.net');
	});

	it('updates the existing destinations without creating duplicates', () => {
		const destinations: Destination[] = [
			{ id: 'app', name: 'Missionnaire', url: 'rtmp://old/live', key: '', enabled: false, hold: false },
			{ id: 'yt', name: 'YouTube', url: 'rtmp://a.rtmp.youtube.com/live2', key: '', enabled: false, hold: false }
		];
		const merged = mergeEnvDestinations(destinations, {
			missionnaireUrl: 'rtmps://radio.example/live', missionnaireKey: 'radio', youtubeKey: 'youtube'
		});
		expect(merged).toHaveLength(2);
		expect(merged[0]).toMatchObject({ url: 'rtmps://radio.example/live', key: 'radio', enabled: true, hold: false });
		expect(merged[1]).toMatchObject({ key: 'youtube', enabled: true, hold: true });
	});

	it('rejects an imported insecure remote control URL', () => {
		expect(() => parseStudioEnv('MAIN_SITE_URL=http://example.com')).toThrow('https://');
	});
});
