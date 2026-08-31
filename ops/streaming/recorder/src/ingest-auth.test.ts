import assert from 'node:assert/strict';
import test from 'node:test';
import { createIngestCredential, verifyIngestCredential } from './ingest-auth.js';

test('issues a path-bound credential that expires', () => {
	const now = Date.UTC(2026, 7, 30);
	const credential = createIngestCredential(
		'server-secret',
		'rtmps://stream.example:1936/live/',
		now,
		'computer'
	);
	const token = new URL(`https://local/?${credential.key.split('?')[1]}`).searchParams.get('token');
	assert.equal(credential.url, 'rtmps://stream.example:1936/live');
	assert.ok(token);
	assert.equal(verifyIngestCredential('server-secret', 'live/computer', token, now), true);
	assert.equal(verifyIngestCredential('server-secret', 'live/another', token, now), false);
	assert.equal(verifyIngestCredential('wrong-secret', 'live/computer', token, now), false);
	assert.equal(
		verifyIngestCredential(
			'server-secret',
			'live/computer',
			token,
			Date.parse(credential.expiresAt)
		),
		false
	);
});

test('issues a credential for a root RTMP URL without a leading path slash', () => {
	const now = Date.UTC(2026, 7, 30);
	const credential = createIngestCredential(
		'server-secret',
		'rtmp://stream.example:1935',
		now,
		'computer'
	);
	const token = new URL(`https://local/?${credential.key.split('?')[1]}`).searchParams.get('token');

	assert.equal(credential.url, 'rtmp://stream.example:1935');
	assert.ok(token);
	assert.equal(verifyIngestCredential('server-secret', 'computer', token, now), true);
	assert.equal(verifyIngestCredential('server-secret', '/computer', token, now), false);
});
