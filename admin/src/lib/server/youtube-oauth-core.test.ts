import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizationUrl, decryptToken, encryptToken, youtubeBroadcastId } from './youtube-oauth-core';

test('accepts scheduled YouTube links and rejects channel/default links', () => {
	assert.equal(youtubeBroadcastId('https://www.youtube.com/watch?v=HzQljJ_464Q'), 'HzQljJ_464Q');
	assert.equal(youtubeBroadcastId('https://youtu.be/HzQljJ_464Q'), 'HzQljJ_464Q');
	assert.equal(youtubeBroadcastId('https://www.youtube.com/@MissionnaireNetwork/live'), null);
});

test('encrypts refresh tokens and authenticates them when reading', () => {
	const encrypted = encryptToken('refresh-secret', 'server-secret');
	assert.notEqual(encrypted, 'refresh-secret');
	assert.equal(decryptToken(encrypted, 'server-secret'), 'refresh-secret');
	assert.throws(() => decryptToken(encrypted, 'wrong-secret'));
});

test('OAuth request asks for offline YouTube access and preserves state', () => {
	const url = new URL(authorizationUrl({ clientId: 'client', redirectUri: 'https://admin.test/callback', state: 'state-1' }));
	assert.equal(url.searchParams.get('state'), 'state-1');
	assert.equal(url.searchParams.get('access_type'), 'offline');
	assert.match(url.searchParams.get('scope') ?? '', /youtube\.force-ssl/);
});
