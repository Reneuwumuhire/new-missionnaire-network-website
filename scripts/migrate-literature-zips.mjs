/** Split legacy literature ZIPs into first-class PDF parts in S3 and MongoDB.
 * Dry-run by default; pass --write to upload PDFs and save literature.parts. */
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { MongoClient } from 'mongodb';

const args = new Set(process.argv.slice(2));
const write = args.delete('--write');
const force = args.delete('--force');
if (args.size)
	throw new Error('Usage: node scripts/migrate-literature-zips.mjs [--write] [--force]');

export function partFromFilename(filename) {
	const stem = basename(filename)
		.replace(/\.pdf$/i, '')
		.replace(/\s+VGR$/i, '')
		.replaceAll('_', ' ')
		.trim();
	const match = /^((?:[A-Z]{2,5})?\d{2}-\d{4}[A-Z]?)(?:[\s-]+(.+))?$/i.exec(stem);
	return {
		title: match?.[2] || match?.[1] || stem,
		...(match?.[1] ? { code: match[1].toUpperCase() } : {})
	};
}

const codeOrder = (code = '') => {
	const match = /^(?:[A-Z]{2,5})?(\d{2})-(\d{4})([A-Z]?)$/i.exec(code);
	if (!match) return `99999999-${code}`;
	const session = { M: '0', A: '0', '': '1', E: '2' }[match[3].toUpperCase()] ?? match[3];
	return `${match[1]}${match[2]}${session}`;
};

export function sortParts(parts) {
	return parts
		.toSorted((a, b) =>
			codeOrder(a.code).localeCompare(codeOrder(b.code), 'en', {
				numeric: true,
				sensitivity: 'base'
			})
		)
		.map((part, index) => ({ ...part, position: index + 1 }));
}

const encodedUrl = (bucket, region, key) =>
	`https://${bucket}.s3.${region}.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`;

const disposition = (filename) => {
	const fallback = filename.replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '') || 'book-part.pdf';
	return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
};

const correctedKeys = new Map([
	[
		'literature/english/books/The Revelation of the Seven Seals.zip',
		'literature/english/books/Сontents of a book.zip'
	]
]);

function decodeFilename(bytes) {
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
	} catch {
		return new TextDecoder('windows-1252').decode(bytes);
	}
}

function lines(bytes) {
	const result = [];
	let start = 0;
	for (let index = 0; index <= bytes.length; index++) {
		if (index === bytes.length || bytes[index] === 10) {
			if (index > start) result.push(bytes.subarray(start, index));
			start = index + 1;
		}
	}
	return result;
}

async function migrate() {
	for (const name of ['MONGODB_URI', 'AWS_S3_BUCKET', 'AWS_S3_REGION'])
		if (!process.env[name]) throw new Error(`${name} is required`);
	if (write)
		for (const name of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'])
			if (!process.env[name]) throw new Error(`${name} is required with --write`);

	const bucket = process.env.AWS_S3_BUCKET;
	const region = process.env.AWS_S3_REGION;
	const credentials =
		process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
			? {
					accessKeyId: process.env.AWS_ACCESS_KEY_ID,
					secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
				}
			: undefined;
	const s3 = new S3Client({ region, credentials, requestChecksumCalculation: 'WHEN_REQUIRED' });
	const mongo = new MongoClient(process.env.MONGODB_URI);
	const directory = await mkdtemp(join(tmpdir(), 'literature-zips-'));
	let books = 0,
		files = 0,
		failed = 0,
		skippedFiles = 0;
	try {
		await mongo.connect();
		const collection = mongo.db(process.env.MONGODB_DB || 'youtube_data').collection('literature');
		for await (const book of collection.find({ pdf_url: /\.zip(?:$|\?)/i })) {
			if (book.parts?.length && !force) {
				console.log(`${book.title}: already has ${book.parts.length} parts`);
				continue;
			}
			try {
				const source = new URL(book.pdf_url);
				const sourceKey = decodeURIComponent(source.pathname.replace(/^\//, ''));
				const key = correctedKeys.get(sourceKey) || sourceKey;
				if (key !== sourceKey)
					console.log(`${book.title}: repairing missing archive key to ${key}`);
				const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
				if (!object.Body) throw new Error(`${book.title}: ZIP body is empty`);
				if (Number(object.ContentLength) > 500 * 1024 * 1024)
					throw new Error(`${book.title}: ZIP exceeds 500 MB`);
				let archive = join(directory, `${book._id}.zip`);
				await writeFile(archive, await object.Body.transformToByteArray());
				let rawEntries;
				try {
					rawEntries = execFileSync('unzip', ['-Z1', archive], {
						maxBuffer: 10 * 1024 * 1024
					});
				} catch {
					const repaired = join(directory, `${book._id}-repaired.zip`);
					execFileSync('zip', [archive, '-FF', '--out', repaired], {
						input: Buffer.from('y\n'),
						stdio: ['pipe', 'ignore', 'ignore']
					});
					archive = repaired;
					rawEntries = execFileSync('unzip', ['-Z1', archive], {
						maxBuffer: 10 * 1024 * 1024
					});
					console.log(`${book.title}: repaired a damaged ZIP directory`);
				}
				for (const entry of lines(rawEntries).map((value) => value.toString('latin1'))) {
					if (entry.startsWith('/') || entry.split('/').includes('..'))
						throw new Error(`${book.title}: ZIP contains an unsafe path`);
				}
				const entries = lines(rawEntries)
					.filter((entry) => /\.pdf$/i.test(entry.toString('latin1')))
					.map((entry) => {
						const filename = decodeFilename(entry.subarray(entry.lastIndexOf(47) + 1)).normalize(
							'NFC'
						);
						const code = /(?:[A-Z]{2,5})?\d{2}-\d{4}[A-Z]?/i.exec(entry.toString('latin1'))?.[0];
						if (!code) throw new Error(`${book.title}/${filename}: PDF has no unique sermon code`);
						return { filename, selector: `*${code}*.pdf` };
					});
				if (!entries.length) throw new Error(`${book.title}: ZIP contains no PDFs`);
				if (new Set(entries.map(({ filename }) => filename.toLowerCase())).size !== entries.length)
					throw new Error(`${book.title}: ZIP contains duplicate PDF filenames`);
				if (new Set(entries.map(({ selector }) => selector)).size !== entries.length)
					throw new Error(`${book.title}: ZIP contains duplicate sermon codes`);

				const prefix = key.replace(/\.zip$/i, '');
				const parts = sortParts(
					entries.map(({ filename, selector }) => ({
						...partFromFilename(filename),
						selector,
						filename,
						key: `${prefix}/${filename}`
					}))
				);
				console.log(`\n${book.title} (${parts.length})`);
				for (const part of parts)
					console.log(`  ${part.position}. ${part.code || ''} ${part.title}`.trimEnd());
				let savedPartCount = parts.length;

				if (write) {
					const uploadParts = [];
					for (const part of parts) {
						let body;
						try {
							body = execFileSync('unzip', ['-p', archive, part.selector], {
								maxBuffer: 50 * 1024 * 1024,
								stdio: ['ignore', 'pipe', 'ignore']
							});
						} catch {
							skippedFiles++;
							console.error(`  Skipped damaged PDF: ${part.filename}`);
							continue;
						}
						if (body.length > 30 * 1024 * 1024)
							throw new Error(`${book.title}/${part.filename}: PDF exceeds searchable 30 MB limit`);
						uploadParts.push({ ...part, body, position: uploadParts.length + 1 });
					}
					if (!uploadParts.length) throw new Error(`${book.title}: ZIP has no readable PDFs`);
					savedPartCount = uploadParts.length;
					for (const part of uploadParts) {
						await s3.send(
							new PutObjectCommand({
								Bucket: bucket,
								Key: part.key,
								Body: part.body,
								ContentType: 'application/pdf',
								ContentDisposition: disposition(part.filename)
							})
						);
					}
					await collection.updateOne(
						{ _id: book._id, pdf_url: book.pdf_url },
						{
							$set: {
								pdf_url: encodedUrl(bucket, region, key),
								parts: uploadParts.map(({ title, code, key: partKey, position }) => ({
									title,
									...(code ? { code } : {}),
									url: encodedUrl(bucket, region, partKey),
									position
								})),
								updated_at: new Date().toISOString()
							}
						}
					);
				}
				books++;
				files += savedPartCount;
			} catch (error) {
				failed++;
				console.error(`\n${book.title}: ${error.message}`);
			}
		}
	} finally {
		await mongo.close();
		await rm(directory, { recursive: true, force: true });
	}
	console.log(
		`\n${write ? 'Migrated' : 'Dry run'}: ${books} books, ${files} PDF parts, ${skippedFiles} damaged PDFs skipped, ${failed} books failed.`
	);
	if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await migrate();
