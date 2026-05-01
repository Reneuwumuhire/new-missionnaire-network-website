#!/usr/bin/env node
/* global globalThis */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');

const DEFAULT_SOURCE_URL = 'https://indirimbo-zikundwa.bi/';
const DEFAULT_DB_NAME = 'youtube_data';
const DEFAULT_COLLECTION = 'music_audio';
const DEFAULT_OUT = path.join(ROOT_DIR, 'admin', 'lyrics-matches.csv');
const DEFAULT_CACHE_FILE = path.join(ROOT_DIR, '.lyrics-cache', 'indirimbo-zikundwa-index.json');

const SOURCE_ID = 'indirimbo-zikundwa';
const DEFAULT_MIN_CONFIDENCE = 0.72;

const BOOK_ALIASES = new Map(
	Object.entries({
		agakiza: ['agakiza', "indirimbo z'agakiza", 'indirimbo zagakiza'],
		'chants de victoire': ['chants de victoire'],
		chorus: ['chorus'],
		'coll des cantiques': [
			'c c',
			'cantique collection',
			'cantiques collection',
			'coll des cantiques',
			'coll. des cantiques',
			'collection cantiques',
			'collection des cantiques'
		],
		'crois seulement': ['crois seulement', 'crois seulement branham'],
		gushimisha: ['gushimisha', 'indirimbo zo gushimisha', 'gushimisha imana'],
		ikirundi: ['ikirundi'],
		impimbano: ['impimbano'],
		'izi gisenyi': ["iz'i gisenyi", 'izi gisenyi', 'gisenyi'],
		izindi: ['izindi'],
		'les ailes de la foi': ['les ailes de la foi', 'sur les ailes de la foi', 'ailes de la foi'],
		'nyimbo za mungu': ['nyimbo za mungu', 'n mungu'],
		'nyimbo za wokovu': ['nyimbo za wokovu', 'wokovu'],
		'tenzi za rohoni': ['tenzi za rohoni', 't rohoni'],
		umuco: ['umuco'],
		'umuco 1': ['umuco 1'],
		'umuco 2': ['umuco 2']
	}).flatMap(([canonical, aliases]) => aliases.map((alias) => [normalizeText(alias), canonical]))
);

function printHelp() {
	console.log(`
Create a dry-run lyrics match list for Missionnaire music audio.

Usage:
  node scripts/create-lyrics-match-list.mjs [options]

Options:
  --out <path>                 CSV output path. Default: lyrics-matches.csv
  --limit <number>             Limit music_audio rows for a test run.
  --min-confidence <number>    Confidence threshold for "candidate" status. Default: 0.72
  --db-name <name>             MongoDB database name. Default: youtube_data
  --collection <name>          MongoDB collection name. Default: music_audio
  --source-url <url>           Lyric source home URL. Default: https://indirimbo-zikundwa.bi/
  --source-cache <path>        Source index cache path. Default: .lyrics-cache/indirimbo-zikundwa-index.json
  --refresh-source             Ignore cached source index and fetch again.
  --source-only                Fetch/parse the lyric source index, then exit without MongoDB.
  --help                       Show this message.

The script reads MONGODB_URI from the shell, .env.local, or .env.
`);
}

function parseArgs(argv) {
	const options = {
		collection: DEFAULT_COLLECTION,
		dbName: DEFAULT_DB_NAME,
		limit: undefined,
		minConfidence: DEFAULT_MIN_CONFIDENCE,
		out: DEFAULT_OUT,
		refreshSource: false,
		sourceCache: DEFAULT_CACHE_FILE,
		sourceOnly: false,
		sourceUrl: DEFAULT_SOURCE_URL
	};

	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		const next = () => {
			i += 1;
			if (i >= argv.length) {
				throw new Error(`Missing value for ${arg}`);
			}
			return argv[i];
		};

		switch (arg) {
			case '--':
				break;
			case '--collection':
				options.collection = next();
				break;
			case '--db-name':
				options.dbName = next();
				break;
			case '--help':
			case '-h':
				options.help = true;
				break;
			case '--limit':
				options.limit = parsePositiveInteger(next(), arg);
				break;
			case '--min-confidence':
				options.minConfidence = parseConfidence(next(), arg);
				break;
			case '--out':
				options.out = path.resolve(ROOT_DIR, next());
				break;
			case '--refresh-source':
				options.refreshSource = true;
				break;
			case '--source-cache':
				options.sourceCache = path.resolve(ROOT_DIR, next());
				break;
			case '--source-only':
				options.sourceOnly = true;
				break;
			case '--source-url':
				options.sourceUrl = next();
				break;
			default:
				throw new Error(`Unknown option: ${arg}`);
		}
	}

	return options;
}

function parsePositiveInteger(value, label) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new Error(`${label} must be a positive integer`);
	}
	return parsed;
}

function parseConfidence(value, label) {
	const parsed = Number.parseFloat(value);
	if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
		throw new Error(`${label} must be a number between 0 and 1`);
	}
	return parsed;
}

async function loadLocalEnv() {
	const envPaths = [path.join(ROOT_DIR, '.env.local'), path.join(ROOT_DIR, '.env')];

	for (const envPath of envPaths) {
		let text = '';
		try {
			text = await fs.readFile(envPath, 'utf8');
		} catch (error) {
			if (error?.code !== 'ENOENT') throw error;
			continue;
		}

		for (const line of text.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
			if (!match) continue;
			const [, key, rawValue] = match;
			if (process.env[key] !== undefined) continue;
			process.env[key] = stripEnvQuotes(rawValue.trim());
		}
	}
}

function stripEnvQuotes(value) {
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	return value;
}

async function loadSourceIndex(options) {
	if (!options.refreshSource) {
		try {
			const cached = JSON.parse(await fs.readFile(options.sourceCache, 'utf8'));
			if (Array.isArray(cached.songs) && cached.songs.length > 0) {
				console.log(
					`Loaded ${cached.songs.length} lyric source songs from cache: ${relativePath(
						options.sourceCache
					)}`
				);
				return cached.songs.map(prepareSourceSong);
			}
		} catch (error) {
			if (error?.code !== 'ENOENT') {
				console.warn(`Ignoring unreadable source cache: ${error.message}`);
			}
		}
	}

	console.log(`Fetching lyric source index: ${options.sourceUrl}`);
	const response = await globalThis.fetch(options.sourceUrl, {
		headers: {
			accept: 'text/html,application/xhtml+xml',
			'user-agent': 'MissionnaireNetworkLyricsMatcher/0.1 (+https://missionnaire.net)'
		}
	});

	if (!response.ok) {
		throw new Error(
			`Could not fetch lyric source index (${response.status} ${response.statusText})`
		);
	}

	const html = await response.text();
	const songs = parseIndirimboZikundwaIndex(html, options.sourceUrl);

	await fs.mkdir(path.dirname(options.sourceCache), { recursive: true });
	await fs.writeFile(
		options.sourceCache,
		JSON.stringify(
			{
				fetchedAt: new Date().toISOString(),
				sourceUrl: options.sourceUrl,
				songs
			},
			null,
			2
		)
	);

	console.log(
		`Fetched ${songs.length} lyric source songs and cached them at ${relativePath(options.sourceCache)}`
	);
	return songs.map(prepareSourceSong);
}

function parseIndirimboZikundwaIndex(html, sourceUrl) {
	const marker = 'const books = {';
	const start = html.indexOf(marker);
	if (start === -1) {
		throw new Error('Could not find "const books" in lyric source HTML');
	}

	const bodyStart = html.indexOf('{', start);
	const bodyEnd = html.indexOf('\n};', bodyStart);
	if (bodyStart === -1 || bodyEnd === -1) {
		throw new Error('Could not isolate the lyric source books object');
	}

	const objectBody = html.slice(bodyStart + 1, bodyEnd);
	const songs = [];
	const bookRegex = /"([^"]+)"\s*:\s*\[([\s\S]*?)\]\s*,?/g;
	const songRegex =
		/\{\s*number:\s*(\d+)\s*,\s*title:\s*"((?:\\.|[^"\\])*)"\s*,\s*link:\s*"([^"]+)"\s*\}/g;

	let bookMatch;
	while ((bookMatch = bookRegex.exec(objectBody)) !== null) {
		const [, book, block] = bookMatch;
		let songMatch;

		while ((songMatch = songRegex.exec(block)) !== null) {
			const [, rawNumber, rawTitle, link] = songMatch;
			const number = Number.parseInt(rawNumber, 10);
			const title = parseJsString(rawTitle);
			const sourceLink = new URL(link, sourceUrl).href;
			const lyricsTextId = makeLyricsTextId(book, number, title);

			songs.push({
				book,
				lyricsTextId,
				number,
				source: SOURCE_ID,
				title,
				url: sourceLink
			});
		}
	}

	if (songs.length === 0) {
		throw new Error('Found the lyric source books object, but parsed zero songs');
	}

	return songs;
}

function parseJsString(value) {
	try {
		return JSON.parse(`"${value}"`);
	} catch {
		return value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
	}
}

function prepareSourceSong(song) {
	return {
		...song,
		canonicalBook: canonicalBookKey(song.book),
		normalizedBook: normalizeBook(song.book),
		normalizedTitle: normalizeSongTitle(song.title),
		titleTokens: tokenize(normalizeSongTitle(song.title))
	};
}

async function loadMusicAudio(options) {
	await loadLocalEnv();
	const uri = process.env.MONGODB_URI;
	if (!uri) {
		throw new Error('MONGODB_URI is missing. Add it to .env.local or export it before running.');
	}

	const client = new MongoClient(uri, {
		serverSelectionTimeoutMS: 30000
	});

	try {
		await client.connect();
		const collection = client.db(options.dbName).collection(options.collection);
		const cursor = collection
			.find({})
			.project({
				_id: 1,
				artist: 1,
				book: 1,
				book_full_name: 1,
				category: 1,
				duration: 1,
				number: 1,
				s3_key: 1,
				s3_url: 1,
				title: 1
			})
			.sort({ _id: 1 });

		if (options.limit) {
			cursor.limit(options.limit);
		}

		const rows = await cursor.toArray();
		console.log(`Loaded ${rows.length} audio rows from ${options.dbName}.${options.collection}`);
		return rows.map(serializeAudio);
	} finally {
		await client.close();
	}
}

function serializeAudio(audio) {
	return {
		...audio,
		_id: String(audio._id ?? '')
	};
}

function buildMatches(audioRows, sourceSongs, options) {
	const sourceLookup = buildSourceLookup(sourceSongs);

	return audioRows.map((audio) => {
		const candidatePool = collectCandidatePool(audio, sourceLookup, sourceSongs);
		const best = candidatePool
			.map((sourceSong) => scoreCandidate(audio, sourceSong))
			.reduce((currentBest, candidate) => {
				if (!currentBest || candidate.confidence > currentBest.confidence) return candidate;
				return currentBest;
			}, null);

		return buildCsvRow(audio, best, options);
	});
}

function buildSourceLookup(sourceSongs) {
	const lookup = {
		byBook: new Map(),
		byBookAndNumber: new Map(),
		byNumber: new Map(),
		byToken: new Map()
	};

	for (const sourceSong of sourceSongs) {
		addLookupValue(lookup.byBook, sourceSong.canonicalBook, sourceSong);
		addLookupValue(
			lookup.byBookAndNumber,
			bookNumberKey(sourceSong.canonicalBook, sourceSong.number),
			sourceSong
		);
		addLookupValue(lookup.byNumber, String(sourceSong.number), sourceSong);

		for (const token of sourceSong.titleTokens) {
			if (token.length < 4) continue;
			addLookupValue(lookup.byToken, token, sourceSong);
		}
	}

	return lookup;
}

function collectCandidatePool(audio, lookup, sourceSongs) {
	const collected = new Map();
	const addMany = (items = []) => {
		for (const item of items) {
			collected.set(item.url, item);
		}
	};

	const audioBooks = [audio.book, audio.book_full_name, audio.category]
		.filter(Boolean)
		.map((value) => canonicalBookKey(String(value)));
	const audioNumber = Number(audio.number);
	const hasAudioNumber = Number.isFinite(audioNumber);

	if (hasAudioNumber) {
		for (const audioBook of audioBooks) {
			addMany(lookup.byBookAndNumber.get(bookNumberKey(audioBook, audioNumber)));
		}
	}

	for (const audioBook of audioBooks) {
		addMany(lookup.byBook.get(audioBook));
	}

	if (hasAudioNumber) {
		addMany(lookup.byNumber.get(String(audioNumber)));
	}

	for (const token of tokenize(normalizeSongTitle(getAudioTitle(audio)))) {
		if (token.length < 4) continue;
		addMany(lookup.byToken.get(token));
	}

	return collected.size > 0 ? [...collected.values()] : sourceSongs;
}

function addLookupValue(map, key, value) {
	if (!key) return;
	const values = map.get(key);
	if (values) {
		values.push(value);
		return;
	}
	map.set(key, [value]);
}

function bookNumberKey(book, number) {
	return `${book}:${number}`;
}

function scoreCandidate(audio, sourceSong) {
	const audioTitle = getAudioTitle(audio);
	const normalizedAudioTitle = normalizeSongTitle(audioTitle);
	const titleScore = scoreTitle(normalizedAudioTitle, sourceSong.normalizedTitle);
	const bookScore = scoreBook(audio, sourceSong);
	const numberScore = scoreNumber(audio.number, sourceSong.number);
	const hasStrongBookAndNumber = numberScore === 1 && bookScore >= 0.9;

	let confidence = titleScore * 0.78 + bookScore * 0.14 + numberScore * 0.08;

	if (hasStrongBookAndNumber) {
		const bookNumberFloor =
			titleScore >= 0.35 ? 0.86 + titleScore * 0.09 : 0.62 + titleScore * 0.65;
		confidence = Math.max(confidence, bookNumberFloor);
	}

	if (titleScore >= 0.98) {
		confidence = Math.max(confidence, 0.93 + bookScore * 0.04 + numberScore * 0.03);
	}

	if (titleScore >= 0.82 && numberScore === 1) {
		confidence = Math.max(confidence, 0.88);
	}

	if (titleScore < 0.45 && !hasStrongBookAndNumber) {
		confidence = Math.min(confidence, 0.68);
	}

	return {
		...sourceSong,
		bookScore,
		confidence: clamp(confidence, 0, 1),
		numberScore,
		reason: buildReason({ bookScore, numberScore, titleScore }),
		titleScore
	};
}

function buildCsvRow(audio, best, options) {
	const confidence = best?.confidence ?? 0;
	const matchStatus =
		confidence >= 0.9
			? 'likely'
			: confidence >= options.minConfidence
				? 'candidate'
				: 'needs_review';

	return {
		review_status: '',
		reviewed_by: '',
		review_notes: '',
		reviewed_at: '',
		match_status: matchStatus,
		audio_id: audio._id,
		audio_title: getAudioTitle(audio),
		audio_artist: audio.artist ?? '',
		audio_book: audio.book ?? '',
		audio_book_full_name: audio.book_full_name ?? '',
		audio_category: audio.category ?? '',
		audio_number: audio.number ?? '',
		audio_duration_seconds: audio.duration ?? '',
		audio_s3_key: audio.s3_key ?? '',
		audio_url: audio.s3_url ?? '',
		lyrics_text_id: best?.lyricsTextId ?? '',
		confidence: confidence.toFixed(3),
		reason: best?.reason ?? '',
		source_book: best?.book ?? '',
		source_number: best?.number ?? '',
		source_title: best?.title ?? '',
		source_url: best?.url ?? ''
	};
}

function buildReason(scores) {
	const parts = [
		`title:${scores.titleScore.toFixed(2)}`,
		`book:${scores.bookScore.toFixed(2)}`,
		`number:${scores.numberScore.toFixed(2)}`
	];
	return parts.join(' ');
}

function getAudioTitle(audio) {
	if (audio.title && String(audio.title).trim()) {
		return String(audio.title).trim();
	}

	if (audio.s3_key && String(audio.s3_key).trim()) {
		const filename = path.basename(String(audio.s3_key));
		try {
			return decodeURIComponent(filename).replace(/\.[A-Za-z0-9]+$/, '');
		} catch {
			return filename.replace(/\.[A-Za-z0-9]+$/, '');
		}
	}

	return '';
}

function scoreTitle(left, right) {
	if (!left || !right) return 0;
	if (left === right) return 1;

	const editScore = normalizedLevenshteinSimilarity(left, right);
	const tokenScore = diceCoefficient(tokenize(left), tokenize(right));
	const containmentScore = scoreContainment(left, right);

	return Math.max(editScore, tokenScore, containmentScore);
}

function scoreBook(audio, sourceSong) {
	const sourceBook = normalizeBook(sourceSong.book);
	const sourceCanonical = canonicalBookKey(sourceSong.book);
	const audioBooks = [audio.book, audio.book_full_name, audio.category]
		.filter(Boolean)
		.map((value) => String(value));

	let best = 0;
	for (const audioBook of audioBooks) {
		const normalizedAudioBook = normalizeBook(audioBook);
		const audioCanonical = canonicalBookKey(audioBook);

		if (audioCanonical && sourceCanonical && audioCanonical === sourceCanonical) {
			best = Math.max(best, 1);
			continue;
		}

		if (normalizedAudioBook === sourceBook) {
			best = Math.max(best, 1);
			continue;
		}

		if (
			normalizedAudioBook.length >= 4 &&
			sourceBook.length >= 4 &&
			(normalizedAudioBook.includes(sourceBook) || sourceBook.includes(normalizedAudioBook))
		) {
			best = Math.max(best, 0.82);
			continue;
		}

		best = Math.max(best, diceCoefficient(tokenize(normalizedAudioBook), tokenize(sourceBook)));
	}

	return best;
}

function canonicalBookKey(value) {
	const normalized = normalizeBook(value);
	if (BOOK_ALIASES.has(normalized)) return BOOK_ALIASES.get(normalized);
	return normalized;
}

function scoreNumber(left, right) {
	const leftNumber = Number(left);
	const rightNumber = Number(right);
	if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return 0;
	return leftNumber === rightNumber ? 1 : 0;
}

function normalizeSongTitle(value) {
	return normalizeText(value)
		.replace(/\b(mp3|audio|chant|cantiques?)\b/g, ' ')
		.replace(/^\d{1,4}\s+/, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function normalizeBook(value) {
	return normalizeText(value)
		.replace(/\bindirimbo\b/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function normalizeText(value) {
	return String(value ?? '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[‘’‚‛`´]/g, "'")
		.replace(/[“”„‟]/g, '"')
		.replace(/&/g, ' and ')
		.replace(/[№#]/g, ' ')
		.toLowerCase()
		.replace(/\b(n|no|num|numero)\b/g, ' ')
		.replace(/[^a-z0-9' ]+/g, ' ')
		.replace(/'/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function tokenize(value) {
	return new Set(
		String(value)
			.split(/\s+/)
			.map((token) => token.trim())
			.filter((token) => token.length > 1)
	);
}

function diceCoefficient(leftTokens, rightTokens) {
	if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

	let intersection = 0;
	for (const token of leftTokens) {
		if (rightTokens.has(token)) intersection += 1;
	}

	return (2 * intersection) / (leftTokens.size + rightTokens.size);
}

function scoreContainment(left, right) {
	const shorter = left.length <= right.length ? left : right;
	const longer = left.length > right.length ? left : right;
	if (shorter.length < 8 || !longer.includes(shorter)) return 0;

	const lengthRatio = shorter.length / longer.length;
	return Math.min(0.92, 0.55 + lengthRatio * 0.37);
}

function normalizedLevenshteinSimilarity(left, right) {
	const maxLength = Math.max(left.length, right.length);
	if (maxLength === 0) return 1;
	return 1 - levenshteinDistance(left, right) / maxLength;
}

function levenshteinDistance(left, right) {
	if (left === right) return 0;
	if (left.length === 0) return right.length;
	if (right.length === 0) return left.length;

	let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
	let current = new Array(right.length + 1);

	for (let i = 1; i <= left.length; i += 1) {
		current[0] = i;
		for (let j = 1; j <= right.length; j += 1) {
			const substitutionCost = left[i - 1] === right[j - 1] ? 0 : 1;
			current[j] = Math.min(
				current[j - 1] + 1,
				previous[j] + 1,
				previous[j - 1] + substitutionCost
			);
		}
		[previous, current] = [current, previous];
	}

	return previous[right.length];
}

function makeLyricsTextId(book, number, title) {
	return [SOURCE_ID, slugify(book), String(number).padStart(3, '0'), slugify(title)]
		.filter(Boolean)
		.join(':');
}

function slugify(value) {
	return normalizeText(value).replace(/\s+/g, '-').replace(/^-|-$/g, '');
}

function clamp(value, min, max) {
	return Math.max(min, Math.min(max, value));
}

async function writeCsv(rows, outPath) {
	const sortedRows = [...rows].sort(compareRowsForReview);
	const headers = [
		'review_status',
		'reviewed_by',
		'review_notes',
		'reviewed_at',
		'match_status',
		'audio_id',
		'audio_title',
		'audio_artist',
		'audio_book',
		'audio_book_full_name',
		'audio_category',
		'audio_number',
		'audio_duration_seconds',
		'audio_s3_key',
		'audio_url',
		'lyrics_text_id',
		'confidence',
		'reason',
		'source_book',
		'source_number',
		'source_title',
		'source_url'
	];

	const csv = [
		headers.join(','),
		...sortedRows.map((row) => headers.map((header) => csvCell(row[header])).join(','))
	].join('\n');

	await fs.mkdir(path.dirname(outPath), { recursive: true });
	await fs.writeFile(outPath, `${csv}\n`);
}

function compareRowsForReview(left, right) {
	const confidenceDelta = Number(right.confidence) - Number(left.confidence);
	if (confidenceDelta !== 0) return confidenceDelta;

	const statusDelta = statusRank(left.match_status) - statusRank(right.match_status);
	if (statusDelta !== 0) return statusDelta;

	return String(left.audio_title).localeCompare(String(right.audio_title), 'fr');
}

function statusRank(status) {
	switch (status) {
		case 'likely':
			return 0;
		case 'candidate':
			return 1;
		case 'needs_review':
			return 2;
		default:
			return 3;
	}
}

function csvCell(value) {
	const text = String(value ?? '');
	if (!/[",\r\n]/.test(text)) return text;
	return `"${text.replace(/"/g, '""')}"`;
}

function summarize(rows) {
	const summary = new Map();
	for (const row of rows) {
		summary.set(row.match_status, (summary.get(row.match_status) ?? 0) + 1);
	}
	return [...summary.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([status, count]) => `${status}: ${count}`)
		.join(', ');
}

function relativePath(filePath) {
	return path.relative(ROOT_DIR, filePath) || '.';
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		printHelp();
		return;
	}

	const sourceSongs = await loadSourceIndex(options);
	if (options.sourceOnly) {
		console.log(`Parsed ${sourceSongs.length} songs from ${options.sourceUrl}`);
		return;
	}

	const audioRows = await loadMusicAudio(options);
	const matches = buildMatches(audioRows, sourceSongs, options);

	await writeCsv(matches, options.out);
	console.log(`Wrote ${matches.length} rows to ${relativePath(options.out)}`);
	console.log(`Match summary: ${summarize(matches)}`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
