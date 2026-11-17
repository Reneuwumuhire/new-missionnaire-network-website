import assert from 'node:assert/strict';
import test from 'node:test';
import { studioYouTubeBody } from './studio-youtube-request';

test('accepts Studio status after browser approval without scheduling fields', () => {
	const request = {
		action: 'status',
		deviceInfo: {
			os: 'macos',
			architecture: 'x86_64',
			username: 'operator',
			deviceName: 'Studio Mac',
			appVersion: '0.1.42',
			installationId: '00000000-0000-4000-8000-000000000000'
		}
	};
	assert.deepEqual(studioYouTubeBody.parse(request), request);
});

test('accepts actions that have no scheduling or device fields', () => {
	for (const action of [
		'status',
		'heartbeat',
		'audio-status',
		'logout',
		'recorder-start',
		'recorder-stop'
	]) {
		assert.deepEqual(studioYouTubeBody.parse({ action }), { action });
	}
});

test('preserves scheduling fields for action-specific validation', () => {
	const request = {
		action: 'schedule',
		channelId: 'channel-1',
		title: 'Sunday service',
		scheduledAt: '2026-11-22T10:00:00Z',
		privacyStatus: 'public',
		madeForKids: false
	};
	assert.deepEqual(studioYouTubeBody.parse(request), request);
});

test('still rejects malformed actions and identifiers', () => {
	for (const request of [
		null,
		{},
		{ action: 1 },
		{ action: 'x'.repeat(31) },
		{ action: 'ingest', sessionId: { $ne: null } },
		{ action: 'disconnect', channelId: { $ne: null } }
	]) {
		assert.equal(studioYouTubeBody.safeParse(request).success, false);
	}
});
