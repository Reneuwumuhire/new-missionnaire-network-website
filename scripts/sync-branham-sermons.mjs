#!/usr/bin/env node
/** Sync official sermon resources into existing MongoDB sermon documents.
 * Dry-run by default. --write only fills empty fields; it never inserts,
 * overwrites, deletes, or guesses an ambiguous match. */
import fs from 'node:fs/promises';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import fetch from 'node-fetch';
import { MongoClient } from 'mongodb';

export const CATALOGS = {
	ENG: {
		language: 'english',
		titlePath: 'english_title',
		audioPath: 'english_audio_url',
		pdfPath: 'english_pdf_url'
	},
	FRN: { language: 'french', titlePath: 'french_title', audioPath: 'mp3_url', pdfPath: 'pdf_url' },
	KIN: {
		language: 'kinyarwanda',
		titlePath: 'localizations.rw.title',
		audioPath: 'localizations.rw.audio_url',
		pdfPath: 'localizations.rw.pdf_url',
		locale: 'rw'
	},
	SWA: {
		language: 'swahili',
		titlePath: 'localizations.sw.title',
		audioPath: 'localizations.sw.audio_url',
		pdfPath: 'localizations.sw.pdf_url',
		locale: 'sw'
	}
};

const BASE_URL = 'https://branham.org';
const MESSAGE_MARKER = '<div class="large-24 medium-24 small-24 columns end message">';
const SERMON_CODE = /^\d{2}-\d{4}[A-Z]?$/;

function decodeHtml(value = '') {
	const named = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
	return value
		.replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
		.replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
		.replace(/&([a-z]+);/gi, (entity, name) => named[name.toLowerCase()] ?? entity)
		.replace(/\s+/g, ' ')
		.trim();
}

const href = (card, pattern) => decodeHtml(card.match(pattern)?.[1] || '') || null;

export function parseCatalog(html, catalogCode) {
	if (!html.includes(MESSAGE_MARKER))
		throw new Error(`${catalogCode}: source page has no sermon cards`);
	return html
		.split(MESSAGE_MARKER)
		.slice(1)
		.map((card) => {
			const rawCode = card.match(
				new RegExp(`<div class="prodtext">\\s*(?:${catalogCode}\\s+)?([^<]+)`)
			)?.[1];
			if (!rawCode) return null;
			const code = decodeHtml(rawCode).toUpperCase();
			const details = [...card.matchAll(/<div class="prodtext2">\s*([^<]*)<\/div>/g)].map((match) =>
				decodeHtml(match[1])
			);
			const streamPath = href(card, /href="([^"]*messagestream[^"]*)"/i);
			return {
				catalog: catalogCode,
				code,
				isSermon: SERMON_CODE.test(code),
				title: decodeHtml(card.match(/prodtexttitle">([^<]*)/i)?.[1]),
				location: details[0] || null,
				durationMinutes:
					Number.parseInt(details.find((value) => /\d+\s+min/i.test(value)) || '') || null,
				releaseDate: details.find((value) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)) || null,
				pdfUrl: href(card, /href="([^"]+\.pdf(?:\?[^\"]*)?)"/i),
				audioUrl: href(card, /href="([^"]+\.(?:m4a|mp3)(?:\?[^\"]*)?)"/i),
				sourceUrl: streamPath
					? new URL(streamPath, BASE_URL).toString()
					: `${BASE_URL}/MessageAudio/${catalogCode}`
			};
		})
		.filter(Boolean);
}

export function normalizeTitle(value = '') {
	return value
		.normalize('NFKD')
		.replace(/\p{M}/gu, '')
		.toLocaleLowerCase('en')
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

const baseDateCode = (code = '') => code.slice(0, 7).toUpperCase();
const documentCodes = (document) =>
	[document.date_code, document.full_date_code]
		.filter(Boolean)
		.map((code) => String(code).toUpperCase());

function titlesFor(document, catalogCode) {
	if (catalogCode === 'ENG') return [document.english_title];
	if (catalogCode === 'FRN') return [document.french_title];
	if (catalogCode === 'KIN') return [document.localizations?.rw?.title];
	return [document.localizations?.sw?.title];
}

export function resolveCatalog(entries, documents, canonicalMatches = new Map()) {
	const exact = new Map();
	for (const document of documents) {
		for (const code of new Set(documentCodes(document))) {
			const matches = exact.get(code) || [];
			matches.push(document);
			exact.set(code, matches);
		}
	}

	const matched = [];
	const ambiguous = [];
	const unmatched = [];
	const nonSermons = [];
	for (const entry of entries) {
		if (!entry.isSermon) {
			nonSermons.push(entry);
			continue;
		}
		let candidates = exact.get(entry.code) || [];
		let reason = 'code';
		if (candidates.length === 0 && canonicalMatches.has(entry.code)) {
			candidates = [canonicalMatches.get(entry.code)];
			reason = 'english-alias';
		}
		if (candidates.length === 0) {
			const wantedTitle = normalizeTitle(entry.title);
			candidates = documents.filter(
				(document) =>
					documentCodes(document).some((code) => baseDateCode(code) === baseDateCode(entry.code)) &&
					titlesFor(document, entry.catalog).some(
						(title) => title && normalizeTitle(title) === wantedTitle
					)
			);
			reason = 'date-title';
		}
		if (candidates.length === 1) matched.push({ entry, document: candidates[0], reason });
		else if (candidates.length > 1)
			ambiguous.push({ entry, candidateIds: candidates.map(({ _id }) => String(_id)) });
		else unmatched.push(entry);
	}
	return { matched, ambiguous, unmatched, nonSermons };
}

function getPath(object, path) {
	return path.split('.').reduce((value, key) => value?.[key], object);
}

function equalValue(current, incoming, path) {
	if (path.endsWith('title')) return normalizeTitle(current) === normalizeTitle(incoming);
	return current === incoming;
}

export function patchForMatch(document, entry) {
	const config = CATALOGS[entry.catalog];
	const candidates = [
		[config.titlePath, entry.title],
		[config.audioPath, entry.audioUrl],
		[config.pdfPath, entry.pdfUrl]
	];
	if (config.locale) {
		candidates.push(
			[`localizations.${config.locale}.source_code`, `${entry.catalog}=${entry.code}`],
			[`localizations.${config.locale}.source_url`, entry.sourceUrl]
		);
	}
	const set = {};
	const conflicts = [];
	for (const [path, incoming] of candidates) {
		if (!incoming) continue;
		const current = getPath(document, path);
		if (current === undefined || current === null || current === '') set[path] = incoming;
		else if (!equalValue(current, incoming, path)) conflicts.push({ path, current, incoming });
	}
	return { set, conflicts };
}

async function fetchCatalog(code) {
	const response = await fetch(`${BASE_URL}/MessageAudio/${code}`, {
		headers: {
			accept: 'text/html',
			'user-agent': 'MissionnaireNetwork/1.0 (+https://missionnaire.net)'
		}
	});
	if (!response.ok) throw new Error(`${code}: source returned HTTP ${response.status}`);
	return parseCatalog(await response.text(), code);
}

function parseArgs(argv) {
	const options = { write: false, report: '', catalogs: Object.keys(CATALOGS) };
	for (const arg of argv) {
		if (arg === '--') continue;
		if (arg === '--write') options.write = true;
		else if (arg.startsWith('--report=')) options.report = arg.slice('--report='.length);
		else if (arg.startsWith('--catalogs=')) {
			options.catalogs = arg
				.slice('--catalogs='.length)
				.split(',')
				.map((value) => value.trim().toUpperCase())
				.filter(Boolean);
		} else if (arg === '--help') {
			console.log(
				'node --env-file=.env.local scripts/sync-branham-sermons.mjs [--catalogs=ENG,FRN,KIN,SWA] [--report=path.json] [--write]'
			);
			process.exit(0);
		} else throw new Error(`Unknown argument: ${arg}`);
	}
	for (const code of options.catalogs)
		if (!CATALOGS[code]) throw new Error(`Unknown catalog: ${code}`);
	return options;
}

export async function syncSermons({ uri, database = 'youtube_data', catalogs, write = false }) {
	const requested = [...new Set(['ENG', ...catalogs])];
	const fetched = Object.fromEntries(
		await Promise.all(requested.map(async (code) => [code, await fetchCatalog(code)]))
	);
	const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15000 });
	try {
		await client.connect();
		const collection = client.db(database).collection('sermons');
		const documents = await collection.find({}).project({ library_search: 0 }).toArray();
		const english = resolveCatalog(fetched.ENG, documents);
		const canonicalMatches = new Map(
			english.matched.map(({ entry, document }) => [entry.code, document])
		);
		const report = {
			mode: write ? 'write' : 'dry-run',
			generatedAt: new Date().toISOString(),
			catalogs: {}
		};
		const operations = [];
		for (const code of catalogs) {
			const resolved =
				code === 'ENG' ? english : resolveCatalog(fetched[code], documents, canonicalMatches);
			const changes = [];
			const conflicts = [];
			let unchanged = 0;
			for (const match of resolved.matched) {
				const patch = patchForMatch(match.document, match.entry);
				if (patch.conflicts.length)
					conflicts.push({
						code: match.entry.code,
						documentId: String(match.document._id),
						fields: patch.conflicts
					});
				if (Object.keys(patch.set).length === 0) {
					unchanged++;
					continue;
				}
				changes.push({
					code: match.entry.code,
					documentId: String(match.document._id),
					reason: match.reason,
					set: patch.set
				});
				operations.push({
					updateOne: {
						filter: { _id: match.document._id },
						update: { $set: { ...patch.set, updated_at: new Date() } }
					}
				});
			}
			report.catalogs[code] = {
				sourceItems: fetched[code].length,
				matched: resolved.matched.length,
				unchanged,
				changes,
				conflicts,
				ambiguous: resolved.ambiguous,
				unmatched: resolved.unmatched,
				nonSermons: resolved.nonSermons
			};
		}
		if (write && operations.length) await collection.bulkWrite(operations, { ordered: false });
		report.updatedDocuments = write ? operations.length : 0;
		report.pendingUpdates = operations.length;
		return report;
	} finally {
		await client.close();
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
	const report = await syncSermons({
		uri: process.env.MONGODB_URI,
		database: process.env.MONGODB_DB || 'youtube_data',
		catalogs: options.catalogs,
		write: options.write
	});
	if (options.report) await fs.writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`);
	for (const [code, result] of Object.entries(report.catalogs)) {
		console.log(
			`${code}: ${result.matched} matched, ${result.changes.length} to fill, ${result.unchanged} unchanged, ${result.conflicts.length} conflicts, ${result.ambiguous.length} ambiguous, ${result.unmatched.length} unmatched`
		);
		if (result.ambiguous.length || result.unmatched.length)
			console.log(
				`  review: ${[...result.ambiguous, ...result.unmatched].map((item) => item.entry?.code || item.code).join(', ')}`
			);
	}
	console.log(
		`${options.write ? 'Updated' : 'Would update'} ${report.pendingUpdates} matched language versions.`
	);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
