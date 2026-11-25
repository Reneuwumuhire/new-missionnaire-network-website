import assert from 'node:assert/strict';
import test from 'node:test';
import { MongoClient, ObjectId, type Db } from 'mongodb';

test('auto-publish waits for ready audio and the end of its public live session', async (t) => {
	for (const name of [
		'RECORDER_TOKEN',
		'MONGODB_URI',
		'AWS_ACCESS_KEY_ID',
		'AWS_SECRET_ACCESS_KEY',
		'AWS_S3_BUCKET',
		'AWS_S3_REGION'
	])
		process.env[name] = name === 'MONGODB_URI' ? 'mongodb://localhost:27017' : 'test';

	const startedAt = new Date('2026-11-25T10:00:00Z');
	const recordingStartedAt = new Date('2026-11-25T10:01:00Z');
	const id = new ObjectId();
	let gate = { is_live: true, is_test: false, started_at: startedAt.toISOString() };
	let ready = false;
	const insertOne = t.mock.fn(async (_doc: unknown) => {});
	const find = t.mock.fn((_filter: unknown) => ({
		toArray: async () => (ready ? [{ _id: id }] : [])
	}));
	const updateMany = t.mock.fn(async (_filter: unknown, _updates: unknown) => {});
	const db = {
		collection: (name: string) =>
			name === 'broadcast_admin_state'
				? { findOne: async () => gate }
				: { insertOne, find, updateMany }
	} as unknown as Db;
	t.mock.method(MongoClient.prototype, 'connect', async function (this: MongoClient) {
		return this;
	});
	t.mock.method(MongoClient.prototype, 'db', () => db);

	const { insertRecordingStarting, publishReadyLiveRecordings } = await import('./mongo.js');
	const recording = {
		id,
		title: 'Live audio',
		startedAt: recordingStartedAt,
		createdBy: 'operator'
	};
	await insertRecordingStarting(recording);
	assert.partialDeepStrictEqual(insertOne.mock.calls[0].arguments[0], {
		published: false,
		auto_publish_live_started_at: startedAt.toISOString()
	});

	gate = { ...gate, is_test: true };
	await insertRecordingStarting(recording);
	assert.equal(
		Object.hasOwn(insertOne.mock.calls[1].arguments[0] as object, 'auto_publish_live_started_at'),
		false
	);

	await publishReadyLiveRecordings();
	assert.equal(updateMany.mock.callCount(), 0);

	ready = true;
	gate = { ...gate, is_test: false };
	await publishReadyLiveRecordings();
	assert.partialDeepStrictEqual(updateMany.mock.calls[0].arguments[0], {
		_id: { $in: [id] },
		status: 'ready',
		published: false,
		auto_publish_live_started_at: { $exists: true, $ne: startedAt.toISOString() }
	});

	gate = { ...gate, is_live: false };
	await publishReadyLiveRecordings();
	assert.partialDeepStrictEqual(updateMany.mock.calls[1].arguments[0], {
		_id: { $in: [id] },
		status: 'ready',
		published: false,
		auto_publish_live_started_at: { $exists: true }
	});
	assert.partialDeepStrictEqual(updateMany.mock.calls[1].arguments[1], {
		$set: { published: true },
		$unset: { auto_publish_live_started_at: '' }
	});
});
