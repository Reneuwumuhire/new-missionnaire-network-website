#!/usr/bin/env node
/** Backfill missing per-language sermon audio durations with ffprobe.
 * Dry-run by default. --write fills empty values without overwriting existing durations. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { MongoClient } from 'mongodb';

const run = promisify(execFile);
const LANGUAGES = {
	fr: { audio: 'mp3_url', duration: 'duration' },
	en: { audio: 'english_audio_url', duration: 'english_duration' },
	rw: { audio: 'localizations.rw.audio_url', duration: 'localizations.rw.duration' },
	sw: { audio: 'localizations.sw.audio_url', duration: 'localizations.sw.duration' }
};

const getPath = (value, path) => path.split('.').reduce((current, key) => current?.[key], value);
const missingDuration = (value) => !Number.isFinite(value) || value <= 0;

export function parseDuration(value) {
	const seconds = Number.parseFloat(String(value).trim());
	if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 24 * 60 * 60)
		throw new Error(`Invalid duration: ${value}`);
	return Math.round(seconds);
}

function parseArgs(argv) {
	const options = {
		write: false,
		languages: Object.keys(LANGUAGES),
		limit: Infinity,
		concurrency: 4
	};
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
				'node --env-file=admin/.env.local scripts/backfill-sermon-durations.mjs [--languages=fr,en,rw,sw] [--limit=N] [--concurrency=4] [--write]'
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

async function probeDuration(audioUrl, allowedHost) {
	const url = new URL(audioUrl);
	if (url.protocol !== 'https:' || url.username || url.password || url.host !== allowedHost)
		throw new Error(`Untrusted audio URL: ${audioUrl}`);
	const { stdout } = await run(
		'ffprobe',
		['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', url.href],
		{ timeout: 10 * 60 * 1000, maxBuffer: 1024 }
	);
	return parseDuration(stdout);
}

async function probeWithRetry(audioUrl, allowedHost, label) {
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			return await probeDuration(audioUrl, allowedHost);
		} catch (error) {
			if (attempt === 3) throw error;
			console.warn(`${label} retry ${attempt}/2`);
		}
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	for (const name of ['MONGODB_URI', 'AWS_S3_BUCKET', 'AWS_S3_REGION'])
		if (!process.env[name]) throw new Error(`${name} is required`);
	if (options.write) await run('ffprobe', ['-version'], { timeout: 10_000 });

	const mongo = new MongoClient(process.env.MONGODB_URI);
	let completed = 0;
	let failed = 0;
	try {
		await mongo.connect();
		const collection = mongo.db(process.env.MONGODB_DB || 'youtube_data').collection('sermons');
		const documents = await collection.find({}).project({ library_search: 0 }).toArray();
		const jobs = documents
			.flatMap((document) =>
				options.languages.flatMap((language) => {
					const config = LANGUAGES[language];
					const audioUrl = getPath(document, config.audio);
					return audioUrl && missingDuration(getPath(document, config.duration))
						? [{ document, language, audioUrl, ...config }]
						: [];
				})
			)
			.sort(
				(a, b) =>
					String(a.document.full_date_code).localeCompare(String(b.document.full_date_code)) ||
					options.languages.indexOf(a.language) - options.languages.indexOf(b.language)
			)
			.slice(0, options.limit);
		const counts = Object.fromEntries(
			options.languages.map((language) => [
				language,
				jobs.filter((job) => job.language === language).length
			])
		);
		console.log(`${options.write ? 'Backfilling' : 'Dry run'} ${jobs.length} durations`, counts);
		if (!options.write) return;

		const allowedHost = `${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_S3_REGION}.amazonaws.com`;
		let nextIndex = 0;
		const worker = async () => {
			while (nextIndex < jobs.length) {
				const index = nextIndex++;
				const job = jobs[index];
				const label = `[${index + 1}/${jobs.length}] ${job.document.full_date_code} ${job.language.toUpperCase()}`;
				try {
					const duration = await probeWithRetry(job.audioUrl, allowedHost, label);
					const result = await collection.updateOne(
						{
							_id: job.document._id,
							[job.audio]: job.audioUrl,
							$or: [
								{ [job.duration]: { $exists: false } },
								{ [job.duration]: null },
								{ [job.duration]: { $lte: 0 } }
							]
						},
						{ $set: { [job.duration]: duration, updated_at: new Date() } }
					);
					if (result.modifiedCount !== 1) throw new Error('Database audio or duration changed');
					completed++;
					console.log(`${label} ${duration}s ✓`);
				} catch (error) {
					failed++;
					console.error(`${label} ✗ ${error instanceof Error ? error.message : error}`);
				}
			}
		};
		await Promise.all(
			Array.from({ length: Math.min(options.concurrency, jobs.length) }, () => worker())
		);
	} finally {
		await mongo.close();
	}
	console.log(`Finished: ${completed} durations updated, ${failed} failed.`);
	if (failed) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
