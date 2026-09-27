#!/usr/bin/env node
/** Copy external sermon audio/PDF files to the existing S3 sermon layout.
 * Dry-run by default. --write uploads one file at a time and updates MongoDB
 * only after S3 confirms the object exists. Safe to stop and rerun. */
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, rm, stat, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { MongoClient } from 'mongodb';
import fetch from 'node-fetch';

const TRUSTED_SOURCE_HOSTS = new Set([
	'd21kl6o5a7faj0.cloudfront.net',
	'd2w09gj4mqt5u.cloudfront.net'
]);
const MAX_FILE_BYTES = 1_500_000_000;
const LANGUAGE_ORDER = ['fr', 'en', 'rw', 'sw'];
const LANGUAGES = {
	fr: { name: 'french', title: 'french_title', audio: 'mp3_url', pdf: 'pdf_url', folder: '' },
	en: {
		name: 'english',
		title: 'english_title',
		audio: 'english_audio_url',
		pdf: 'english_pdf_url',
		folder: 'english'
	},
	rw: {
		name: 'kinyarwanda',
		title: 'localizations.rw.title',
		audio: 'localizations.rw.audio_url',
		pdf: 'localizations.rw.pdf_url',
		folder: 'kinyarwanda'
	},
	sw: {
		name: 'swahili',
		title: 'localizations.sw.title',
		audio: 'localizations.sw.audio_url',
		pdf: 'localizations.sw.pdf_url',
		folder: 'swahili'
	}
};

const getPath = (value, path) => path.split('.').reduce((current, key) => current?.[key], value);

export function sermonDate(code) {
	const match = /^(\d{2})-(\d{2})(\d{2})[A-Z]?$/.exec(String(code || '').toUpperCase());
	if (!match) return null;
	return { year: `19${match[1]}`, month: match[2], day: match[3] };
}

export function safeTitle(value) {
	return String(value || '')
		.normalize('NFC')
		.replace(/[^\p{L}\p{N}\s-]/gu, '')
		.replace(/\s+/g, ' ')
		.trim();
}

export function sermonAssetKey(document, language, kind, sourceUrl) {
	const config = LANGUAGES[language];
	const date = sermonDate(document.full_date_code || document.date_code);
	const title = safeTitle(getPath(document, config?.title));
	if (!config || !date || !title) return null;
	const extension = new URL(sourceUrl).pathname.match(/\.(pdf|m4a|mp3)$/i)?.[1]?.toLowerCase();
	if (!extension) return null;
	const directory = ['sermons', date.year, date.month, config.folder].filter(Boolean).join('/');
	return `${directory}/${title} - ${date.year}-${date.month}-${date.day}.${extension}`;
}

const codeOrder = (code = '') => {
	const match = /^(\d{2})-(\d{4})([A-Z]?)$/i.exec(code);
	if (!match) return `99999999-${code}`;
	const session =
		{ M: '0', A: '1', '': '2', B: '3', E: '4', S: '5', X: '6' }[match[3].toUpperCase()] ?? match[3];
	return `${match[1]}${match[2]}${session}`;
};

export function sortJobs(jobs) {
	return jobs.toSorted(
		(a, b) =>
			codeOrder(a.code).localeCompare(codeOrder(b.code), 'en', { numeric: true }) ||
			LANGUAGE_ORDER.indexOf(a.language) - LANGUAGE_ORDER.indexOf(b.language) ||
			(a.kind === 'audio' ? 0 : 1) - (b.kind === 'audio' ? 0 : 1)
	);
}

const s3Url = (bucket, region, key) =>
	`https://${bucket}.s3.${region}.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`;

const contentType = (key) =>
	key.endsWith('.pdf') ? 'application/pdf' : key.endsWith('.mp3') ? 'audio/mpeg' : 'audio/mp4';

const disposition = (key) => {
	const filename = key.split('/').at(-1);
	const fallback = filename.replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '') || 'sermon';
	return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
};

function parseArgs(argv) {
	const options = { write: false, languages: [...LANGUAGE_ORDER], limit: Infinity, concurrency: 4 };
	for (const arg of argv) {
		if (arg === '--') continue;
		if (arg === '--write') options.write = true;
		else if (arg.startsWith('--languages='))
			options.languages = arg
				.slice('--languages='.length)
				.split(',')
				.map((value) => value.trim().toLowerCase())
				.filter(Boolean);
		else if (arg.startsWith('--limit=')) options.limit = Number.parseInt(arg.slice(8), 10);
		else if (arg.startsWith('--concurrency='))
			options.concurrency = Number.parseInt(arg.slice('--concurrency='.length), 10);
		else if (arg === '--help') {
			console.log(
				'node --env-file=admin/.env.local scripts/migrate-sermon-assets.mjs [--languages=fr,en,rw,sw] [--limit=N] [--concurrency=4] [--write]'
			);
			process.exit(0);
		} else throw new Error(`Unknown argument: ${arg}`);
	}
	if (options.languages.some((language) => !LANGUAGES[language]))
		throw new Error('Languages must be selected from fr,en,rw,sw');
	if (Number.isFinite(options.limit) && (!Number.isInteger(options.limit) || options.limit < 1))
		throw new Error('--limit must be positive');
	if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 8)
		throw new Error('--concurrency must be between 1 and 8');
	return options;
}

function assertSource(value) {
	const url = new URL(value);
	if (
		url.protocol !== 'https:' ||
		url.username ||
		url.password ||
		!TRUSTED_SOURCE_HOSTS.has(url.host)
	)
		throw new Error(`Untrusted source URL: ${value}`);
	return url;
}

async function destinationExists(s3, bucket, key) {
	try {
		const result = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
		return Number(result.ContentLength) > 0;
	} catch (error) {
		if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return false;
		throw error;
	}
}

async function download(sourceUrl, destination) {
	const url = assertSource(sourceUrl);
	const response = await fetch(url, {
		headers: { 'user-agent': 'MissionnaireNetwork/1.0 (+https://missionnaire.net)' },
		signal: AbortSignal.timeout(30 * 60 * 1000)
	});
	if (!response.ok || !response.body) throw new Error(`Source returned HTTP ${response.status}`);
	const announcedSize = Number(response.headers.get('content-length'));
	if (announcedSize > MAX_FILE_BYTES) throw new Error('Source file exceeds 1.5 GB');
	let received = 0;
	response.body.on('data', (chunk) => {
		received += chunk.length;
		if (received > MAX_FILE_BYTES) response.body.destroy(new Error('Source file exceeds 1.5 GB'));
	});
	await pipeline(response.body, createWriteStream(destination));
	if (!received) throw new Error('Source file is empty');
}

async function uploadJob({ s3, bucket, region, collection, directory, job }) {
	const targetUrl = s3Url(bucket, region, job.key);
	if (!(await destinationExists(s3, bucket, job.key))) {
		const filename = join(directory, `${job.documentId}-${job.language}-${job.kind}`);
		try {
			await download(job.sourceUrl, filename);
			const { size } = await stat(filename);
			await s3.send(
				new PutObjectCommand({
					Bucket: bucket,
					Key: job.key,
					Body: createReadStream(filename),
					ContentLength: size,
					ContentType: contentType(job.key),
					ContentDisposition: disposition(job.key)
				})
			);
			if (!(await destinationExists(s3, bucket, job.key)))
				throw new Error('S3 verification failed');
		} finally {
			await unlink(filename).catch(() => {});
		}
	}
	const result = await collection.updateOne(
		{ _id: job._id, [job.path]: job.sourceUrl },
		{ $set: { [job.path]: targetUrl, updated_at: new Date() } }
	);
	if (result.modifiedCount !== 1) throw new Error('Database URL changed during migration');
}

async function uploadWithRetry(options, label) {
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			return await uploadJob(options);
		} catch (error) {
			if (attempt === 3) throw error;
			console.warn(
				`${label} retry ${attempt}/2: ${error instanceof Error ? error.message : error}`
			);
			await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
		}
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	for (const name of ['MONGODB_URI', 'AWS_S3_BUCKET', 'AWS_S3_REGION'])
		if (!process.env[name]) throw new Error(`${name} is required`);
	if (options.write)
		for (const name of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'])
			if (!process.env[name]) throw new Error(`${name} is required with --write`);

	const bucket = process.env.AWS_S3_BUCKET;
	const region = process.env.AWS_S3_REGION;
	const bucketHost = `${bucket}.s3.${region}.amazonaws.com`;
	const credentials =
		process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
			? {
					accessKeyId: process.env.AWS_ACCESS_KEY_ID,
					secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
				}
			: undefined;
	const s3 = new S3Client({ region, credentials, requestChecksumCalculation: 'WHEN_REQUIRED' });
	const mongo = new MongoClient(process.env.MONGODB_URI);
	const directory = await mkdtemp(join(tmpdir(), 'sermon-assets-'));
	let completed = 0;
	let failed = 0;
	try {
		await mongo.connect();
		const collection = mongo.db(process.env.MONGODB_DB || 'youtube_data').collection('sermons');
		const documents = await collection.find({}).project({ library_search: 0 }).toArray();
		const jobs = [];
		for (const document of documents) {
			for (const language of options.languages) {
				const config = LANGUAGES[language];
				for (const kind of ['audio', 'pdf']) {
					const path = config[kind];
					const sourceUrl = getPath(document, path);
					if (!sourceUrl) continue;
					let source;
					try {
						source = new URL(sourceUrl);
					} catch {
						continue;
					}
					if (source.host === bucketHost) continue;
					assertSource(sourceUrl);
					const key = sermonAssetKey(document, language, kind, sourceUrl);
					if (!key)
						throw new Error(`${document.full_date_code}: cannot build ${language} ${kind} key`);
					jobs.push({
						_id: document._id,
						documentId: String(document._id),
						code: document.full_date_code || document.date_code,
						language,
						kind,
						path,
						sourceUrl,
						key
					});
				}
			}
		}
		const ordered = sortJobs(jobs).slice(0, options.limit);
		const collisions = Map.groupBy(ordered, (job) => job.key);
		for (const [key, matches] of collisions)
			if (matches.length > 1) throw new Error(`Target collision: ${key} (${matches.length} files)`);

		const counts = Object.fromEntries(
			options.languages.map((language) => [
				language,
				ordered.filter((job) => job.language === language).length
			])
		);
		console.log(`${options.write ? 'Migrating' : 'Dry run'} ${ordered.length} files`, counts);
		if (!options.write) return;

		let nextIndex = 0;
		const worker = async () => {
			while (nextIndex < ordered.length) {
				const index = nextIndex++;
				const job = ordered[index];
				const label = `[${index + 1}/${ordered.length}] ${job.code} ${job.language.toUpperCase()} ${job.kind}`;
				try {
					console.log(`${label} → ${job.key}`);
					await uploadWithRetry({ s3, bucket, region, collection, directory, job }, label);
					completed++;
					console.log(`${label} ✓`);
				} catch (error) {
					failed++;
					console.error(`${label} ✗ ${error instanceof Error ? error.message : error}`);
				}
			}
		};
		await Promise.all(
			Array.from({ length: Math.min(options.concurrency, ordered.length) }, () => worker())
		);
	} finally {
		await mongo.close();
		await rm(directory, { recursive: true, force: true });
	}
	console.log(`Finished: ${completed} migrated, ${failed} failed.`);
	if (failed) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
