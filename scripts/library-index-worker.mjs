import { MongoClient } from 'mongodb';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { extract } from './library-extract.mjs';
import { discover, processOne } from './library-index-queue.mjs';
import { ensureLibrarySearchIndexes } from '../src/lib/server/librarySearchIndexes.ts';

export function extractIsolated(url, kind, hosts) {
	return new Promise((resolve, reject) => {
		const worker = new Worker(new URL(import.meta.url), { workerData: { url, kind, hosts } });
		const timer = setTimeout(() => {
			reject(new Error('Extraction exceeded 90 seconds'));
			void worker.terminate();
		}, 90_000);
		worker.once('message', (result) => {
			clearTimeout(timer);
			resolve(result);
		});
		worker.once('error', (error) => {
			clearTimeout(timer);
			reject(error);
		});
		worker.once('exit', (code) => {
			clearTimeout(timer);
			reject(new Error(`Extractor exited (${code})`));
		});
	});
}

if (!isMainThread) {
	parentPort.postMessage(await extract(workerData.url, workerData.kind, new Set(workerData.hosts)));
} else {
	if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
	const hosts = (
		process.env.LIBRARY_ASSET_HOSTS || 'missionnaire-bucket.s3.af-south-1.amazonaws.com'
	)
		.split(',')
		.map((host) => host.trim())
		.filter(Boolean);
	const client = new MongoClient(process.env.MONGODB_URI, {
		maxPoolSize: 2,
		serverSelectionTimeoutMS: 10000
	});
	const controller = new AbortController();
	const owner = randomUUID();
	for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => controller.abort());
	try {
		await client.connect();
		const db = client.db('youtube_data');
		await ensureLibrarySearchIndexes(db, console.log);
		await db.collection('library_index_jobs').createIndex({ status: 1, availableAt: 1 });
		let nextScan = 0;
		while (!controller.signal.aborted) {
			try {
				// ponytail: one extractor for this catalogue. Increase concurrency only
				// after measuring database/storage headroom on the deployed tier.
				const now = new Date();
				const workers = db.collection('library_index_workers');
				try {
					await workers.updateOne(
						{ _id: 'worker' },
						{ $setOnInsert: { leaseUntil: new Date(0) } },
						{ upsert: true }
					);
				} catch (error) {
					if (error.code !== 11000) throw error;
				}
				const acquired = await workers.updateOne(
					{ _id: 'worker', $or: [{ owner }, { leaseUntil: { $lte: now } }] },
					{ $set: { owner, heartbeat: now, leaseUntil: new Date(now.getTime() + 120_000) } }
				);
				if (!acquired.matchedCount) {
					await delay(5000, undefined, { signal: controller.signal }).catch(() => {});
					continue;
				}
				if (Date.now() >= nextScan) {
					const count = await discover(db);
					console.log(`[library-index] Watching ${count} published assets`);
					nextScan = Date.now() + 60_000;
				}
				const renewed = await workers.updateOne(
					{ _id: 'worker', owner },
					{
						$set: {
							heartbeat: new Date(),
							leaseUntil: new Date(Date.now() + 120_000)
						}
					}
				);
				if (!renewed.matchedCount) continue;
				if (await processOne(db, (url, kind) => extractIsolated(url, kind, hosts))) continue;
			} catch (error) {
				console.error('[library-index] Worker iteration failed:', error.message);
			}
			await delay(5000, undefined, { signal: controller.signal }).catch(() => {});
		}
	} finally {
		await client
			.db('youtube_data')
			.collection('library_index_workers')
			.updateOne(
				{ _id: 'worker', owner },
				{ $set: { leaseUntil: new Date(0), heartbeat: new Date(0) } }
			)
			.catch(() => {});
		await client.close();
	}
}
