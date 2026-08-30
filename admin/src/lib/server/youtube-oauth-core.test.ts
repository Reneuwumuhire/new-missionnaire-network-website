import assert from 'node:assert/strict';
import test from 'node:test';
import {
	authorizationUrl,
	decryptToken,
	encryptToken,
	scheduledBroadcastBody,
	validateYouTubeThumbnail,
	youtubeBroadcastId,
	youtubeLiveStep
} from './youtube-oauth-core';

test('accepts scheduled YouTube links and rejects channel/default links', () => {
	assert.equal(youtubeBroadcastId('https://www.youtube.com/watch?v=HzQljJ_464Q'), 'HzQljJ_464Q');
	assert.equal(youtubeBroadcastId('https://youtu.be/HzQljJ_464Q'), 'HzQljJ_464Q');
	assert.equal(youtubeBroadcastId('https://www.youtube.com/@MissionnaireNetwork/live'), null);
});

test('advances YouTube through its asynchronous live states', () => {
	assert.equal(youtubeLiveStep('ready'), 'start-testing');
	assert.equal(youtubeLiveStep('testStarting'), 'wait');
	assert.equal(youtubeLiveStep('testing'), 'start-live');
	assert.equal(youtubeLiveStep('liveStarting'), 'wait');
	assert.equal(youtubeLiveStep('live'), 'done');
});

test('encrypts refresh tokens and authenticates them when reading', () => {
	const encrypted = encryptToken('refresh-secret', 'server-secret');
	assert.notEqual(encrypted, 'refresh-secret');
	assert.equal(decryptToken(encrypted, 'server-secret'), 'refresh-secret');
	assert.throws(() => decryptToken(encrypted, 'wrong-secret'));
});

test('OAuth request asks for account selection, offline YouTube access, and preserves state', () => {
	const url = new URL(
		authorizationUrl({
			clientId: 'client',
			redirectUri: 'https://admin.test/callback',
			state: 'state-1'
		})
	);
	assert.equal(url.searchParams.get('state'), 'state-1');
	assert.equal(url.searchParams.get('prompt'), 'consent select_account');
	assert.equal(url.searchParams.get('access_type'), 'offline');
	assert.match(url.searchParams.get('scope') ?? '', /youtube\.force-ssl/);
});

test('scheduled broadcasts wait for the operator to go live', () => {
	const body = scheduledBroadcastBody({
		title: 'Sunday service',
		description: null,
		scheduledAt: new Date('2026-08-30T08:00:00.000Z'),
		privacyStatus: 'public',
		madeForKids: true
	});
	assert.equal(body.snippet.scheduledStartTime, '2026-08-30T08:00:00.000Z');
	assert.equal(body.contentDetails.enableAutoStart, false);
	assert.equal(body.contentDetails.monitorStream.enableMonitorStream, true);
	assert.equal(body.status.selfDeclaredMadeForKids, true);
});

test('YouTube thumbnails accept JPEG/PNG up to 2 MB', () => {
	assert.equal(validateYouTubeThumbnail('image/jpeg', 1024), 'image/jpeg');
	assert.equal(validateYouTubeThumbnail('image/png; charset=binary', 2 * 1024 * 1024), 'image/png');
	assert.throws(() => validateYouTubeThumbnail('image/webp', 1024), /JPEG or PNG/);
	assert.throws(() => validateYouTubeThumbnail('image/jpeg', 2 * 1024 * 1024 + 1), /under 2 MB/);
});
