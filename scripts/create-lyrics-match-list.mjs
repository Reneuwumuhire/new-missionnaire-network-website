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
		'chants de victoire': ['chants de victoire', 'c v', 'C.V'],
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
		'crois seulement': ['crois seulement', 'crois seulement branham', 'c s'],
		gushimisha: ['gushimisha', 'indirimbo zo gushimisha', 'gushimisha imana'],
		ikirundi: ['ikirundi'],
		impimbano: ['impimbano'],
		'izi gisenyi': ["iz'i gisenyi", 'izi gisenyi', 'i gisenyi', 'gisenyi'],
		izindi: ['izindi'],
		'les ailes de la foi': [
			'les ailes de la foi',
			'sur les ailes de la foi',
			'ailes de la foi',
			'a f'
		],
		'nyimbo za mungu': ['nyimbo za mungu', 'n mungu', 'n m'],
		'nyimbo za wokovu': ['nyimbo za wokovu', 'wokovu', 'n w'],
		'tenzi za rohoni': ['tenzi za rohoni', 't rohoni', 't r'],
		umuco: ['umuco'],
		'umuco 1': ['umuco 1'],
		'umuco 2': ['umuco 2']
	}).flatMap(([canonical, aliases]) => aliases.map((alias) => [normalizeText(alias), canonical]))
);

const SOURCE_BOOK_DEFINITIONS = new Map(
	Object.entries({
		agakiza: { book: 'Agakiza', linkPrefix: 'Agakiza' },
		'chants de victoire': { book: 'Chants de Victoire', linkPrefix: 'C-Victoire' },
		chorus: { book: 'Chorus', linkPrefix: 'Chorus' },
		'coll des cantiques': { book: 'Coll. des Cantiques', linkPrefix: 'C-Cantiques' },
		'crois seulement': { book: 'Crois Seulement', linkPrefix: 'Crois-Seulement' },
		gushimisha: { book: 'Gushimisha', linkPrefix: 'Gushimisha' },
		ikirundi: { book: 'Ikirundi', linkPrefix: 'Ikirundi' },
		impimbano: { book: 'Impimbano', linkPrefix: 'Impimbano' },
		'izi gisenyi': { book: "Iz'i Gisenyi", linkPrefix: 'Izigisenyi' },
		izindi: { book: 'Izindi', linkPrefix: 'Izindi' },
		'les ailes de la foi': { book: 'Les Ailes de la Foi', linkPrefix: 'A-Foi' },
		'nyimbo za mungu': { book: 'Nyimbo za Mungu', linkPrefix: 'N-Mungu' },
		'nyimbo za wokovu': { book: 'Wokovu', linkPrefix: 'Wokovu' },
		'tenzi za rohoni': { book: 'Tenzi za Rohoni', linkPrefix: 'T-Rohoni' },
		umuco: { book: 'Umuco', linkPrefix: 'Umuco' },
		'umuco 1': { book: 'Umuco-1', linkPrefix: 'Umuco-1' },
		'umuco 2': { book: 'Umuco-2', linkPrefix: 'Umuco-2' }
	})
);

const BOOK_PREFIX_ALIASES = [...BOOK_ALIASES.entries()]
	.map(([alias, canonicalBook]) => ({ alias, canonicalBook }))
	.sort((left, right) => right.alias.length - left.alias.length);

const IGNORED_AUDIO_BOOK_VALUES = new Set(['', 'all', 'autres', 'other', 'unknown']);

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
		const metadata = getAudioMatchMetadata(audio);
		const candidatePool = collectCandidatePool(metadata, sourceLookup, sourceSongs);
		const best = candidatePool
			.map((sourceSong) => scoreCandidate(metadata, sourceSong))
			.reduce((currentBest, candidate) => {
				if (!currentBest || candidate.confidence > currentBest.confidence) return candidate;
				return currentBest;
			}, null);

		return buildCsvRow(audio, metadata, best, options);
	});
}

function addDirectSourceCandidates(sourceSongs, audioRows, sourceUrl) {
	const songs = [...sourceSongs];
	const knownBookNumbers = new Set(
		sourceSongs.map((song) => bookNumberKey(song.canonicalBook, song.number))
	);
	let addedCount = 0;

	for (const audio of audioRows) {
		const metadata = getAudioMatchMetadata(audio);
		if (!metadata.number) continue;

		for (const canonicalBook of metadata.canonicalBooks) {
			const definition = SOURCE_BOOK_DEFINITIONS.get(canonicalBook);
			if (!definition) continue;

			const key = bookNumberKey(canonicalBook, metadata.number);
			if (knownBookNumbers.has(key)) continue;

			const title = getSyntheticSourceTitle(metadata, definition);
			const numberPath = String(metadata.number).padStart(3, '0');
			const url = new URL(`Indirimbo/${definition.linkPrefix}-${numberPath}.html`, sourceUrl).href;
			const sourceSong = prepareSourceSong({
				book: definition.book,
				lyricsTextId: makeLyricsTextId(definition.book, metadata.number, title),
				number: metadata.number,
				source: SOURCE_ID,
				title,
				url
			});

			sourceSong.synthetic = true;
			sourceSong.syntheticReason = metadata.hasExplicitBookNumberPrefix
				? 'audio-title-prefix'
				: 'audio-metadata';

			songs.push(sourceSong);
			knownBookNumbers.add(key);
			addedCount += 1;
		}
	}

	return { addedCount, songs };
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

function collectCandidatePool(metadata, lookup, sourceSongs) {
	const collected = new Map();
	const addMany = (items = []) => {
		for (const item of items) {
			collected.set(item.url, item);
		}
	};

	const audioNumber = metadata.number;
	const hasAudioNumber = Number.isFinite(audioNumber);

	if (hasAudioNumber) {
		for (const audioBook of metadata.canonicalBooks) {
			addMany(lookup.byBookAndNumber.get(bookNumberKey(audioBook, audioNumber)));
		}
	}

	for (const audioBook of metadata.canonicalBooks) {
		addMany(lookup.byBook.get(audioBook));
	}

	if (hasAudioNumber) {
		addMany(lookup.byNumber.get(String(audioNumber)));
	}

	for (const token of tokenize(normalizeSongTitle(metadata.titleForMatching))) {
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

function scoreCandidate(metadata, sourceSong) {
	const normalizedAudioTitle = normalizeSongTitle(metadata.titleForMatching);
	const titleScore = scoreTitle(normalizedAudioTitle, sourceSong.normalizedTitle);
	const bookScore = scoreBook(metadata, sourceSong);
	const numberScore = scoreNumber(metadata.number, sourceSong.number);
	const hasStrongBookAndNumber = numberScore === 1 && bookScore >= 0.9;
	const prefixScore =
		metadata.hasExplicitBookNumberPrefix &&
		metadata.prefix?.canonicalBook === sourceSong.canonicalBook &&
		metadata.prefix?.number === sourceSong.number
			? 1
			: 0;

	let confidence = titleScore * 0.78 + bookScore * 0.14 + numberScore * 0.08;

	if (hasStrongBookAndNumber) {
		const bookNumberFloor =
			titleScore >= 0.35 ? 0.86 + titleScore * 0.09 : 0.62 + titleScore * 0.65;
		confidence = Math.max(confidence, bookNumberFloor);
	}

	if (hasStrongBookAndNumber && prefixScore === 1) {
		confidence = Math.max(confidence, titleScore >= 0.35 ? 0.95 : 0.9);
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
		reason: buildReason({
			bookScore,
			numberScore,
			prefixScore,
			titleScore,
			versionLabel: metadata.versionLabel
		}),
		titleScore
	};
}

function buildCsvRow(audio, metadata, best, options) {
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
		audio_title: metadata.originalTitle,
		audio_artist: audio.artist ?? '',
		audio_book: displayAudioValue(audio.book, metadata.bookDisplay),
		audio_book_full_name: displayAudioValue(audio.book_full_name, metadata.bookDisplay),
		audio_category: audio.category ?? '',
		audio_number: displayAudioNumber(audio.number, metadata.number),
		audio_version: metadata.versionLabel,
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
	if (scores.prefixScore > 0) {
		parts.push(`prefix:${scores.prefixScore.toFixed(2)}`);
	}
	if (scores.versionLabel) {
		parts.push(`version:${scores.versionLabel}`);
	}
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

function getAudioMatchMetadata(audio) {
	const originalTitle = getAudioTitle(audio);
	const titlePrefix = parseAudioBookNumberPrefix(originalTitle);
	const filenamePrefix = parseAudioBookNumberPrefix(getAudioFilenameStem(audio));
	const prefix = titlePrefix ?? filenamePrefix;
	const rawBookValues = collectRawBookValues(audio);
	const canonicalBooks = [];
	const addCanonicalBook = (value) => {
		if (!value || canonicalBooks.includes(value)) return;
		canonicalBooks.push(value);
	};

	if (prefix) {
		addCanonicalBook(prefix.canonicalBook);
	}

	for (const value of rawBookValues) {
		addCanonicalBook(canonicalBookKey(value));
	}

	const dbNumber = parseAudioNumber(audio.number);
	const number = prefix?.number ?? dbNumber;
	const definition = prefix ? SOURCE_BOOK_DEFINITIONS.get(prefix.canonicalBook) : undefined;
	const bookDisplay = definition?.book ?? firstMeaningfulAudioValue(rawBookValues);
	const titleForMatching =
		titlePrefix !== null && titlePrefix !== undefined
			? titlePrefix.normalizedTitleAfterPrefix
			: originalTitle || filenamePrefix?.normalizedTitleAfterPrefix || '';
	const titleForDisplay =
		titlePrefix?.titleAfterPrefix ||
		(titlePrefix ? titlePrefix.normalizedTitleAfterPrefix : '') ||
		originalTitle ||
		filenamePrefix?.titleAfterPrefix ||
		filenamePrefix?.normalizedTitleAfterPrefix ||
		'';

	return {
		bookDisplay,
		bookValues: rawBookValues,
		canonicalBooks,
		hasExplicitBookNumberPrefix: Boolean(prefix),
		number,
		originalTitle,
		prefix,
		titleForDisplay,
		titleForMatching,
		versionLabel: prefix?.versionLabel ?? '',
		versionLabels: prefix?.versionLabels ?? []
	};
}

function parseAudioBookNumberPrefix(value) {
	const normalized = normalizeText(value);
	if (!normalized) return null;

	for (const { alias, canonicalBook } of BOOK_PREFIX_ALIASES) {
		if (!alias || (normalized !== alias && !normalized.startsWith(`${alias} `))) continue;

		const afterAlias = normalized.slice(alias.length).trim();
		const match = /^(\d{1,4})([a-z]{0,4})(?:\s+(.*)|$)/.exec(afterAlias);
		if (!match) continue;

		const number = Number.parseInt(match[1], 10);
		if (!Number.isInteger(number)) continue;
		const versionLabels = splitVersionLetters(match[2]);
		let normalizedTitleAfterPrefix = (match[3] ?? '').trim();

		if (versionLabels.length > 0) {
			let separateSuffixMatch = /^([a-z])(?:\s+(.*)|$)/.exec(normalizedTitleAfterPrefix);
			while (separateSuffixMatch && versionLabels.length < 4) {
				versionLabels.push(separateSuffixMatch[1].toUpperCase());
				normalizedTitleAfterPrefix = (separateSuffixMatch[2] ?? '').trim();
				separateSuffixMatch = /^([a-z])(?:\s+(.*)|$)/.exec(normalizedTitleAfterPrefix);
			}
		}

		const titleAfterPrefix =
			stripDisplayBookNumberPrefix(value, alias, number, versionLabels) ||
			normalizedTitleAfterPrefix;

		return {
			canonicalBook,
			number,
			normalizedTitleAfterPrefix,
			titleAfterPrefix,
			versionLabel: formatVersionLabel(versionLabels),
			versionLabels
		};
	}

	return null;
}

function splitVersionLetters(value) {
	return String(value ?? '')
		.split('')
		.filter(Boolean)
		.map((letter) => letter.toUpperCase());
}

function formatVersionLabel(versionLabels) {
	return versionLabels.length > 0 ? versionLabels.join('-') : '';
}

function stripDisplayBookNumberPrefix(value, alias, number, versionLabels = []) {
	const text = String(value ?? '');
	const chunks = [...text.matchAll(/\S+/g)];
	const lowerVersionLabels = versionLabels.map((label) => label.toLowerCase());
	const targets = new Set([`${alias} ${number}`]);

	if (lowerVersionLabels.length > 0) {
		const compactSuffix = lowerVersionLabels.join('');
		const spacedSuffix = lowerVersionLabels.join(' ');
		targets.add(`${alias} ${number}${compactSuffix}`);
		targets.add(`${alias} ${number} ${spacedSuffix}`);

		const [firstSuffix, ...remainingSuffixes] = lowerVersionLabels;
		if (firstSuffix) {
			targets.add(
				[`${alias} ${number}${firstSuffix}`, ...remainingSuffixes].filter(Boolean).join(' ')
			);
		}
	}

	const longestTargetLength = Math.max(...[...targets].map((target) => target.length));

	for (let index = 0; index < chunks.length; index += 1) {
		const candidate = chunks
			.slice(0, index + 1)
			.map((chunk) => chunk[0])
			.join(' ');
		const normalizedCandidate = normalizeText(candidate);

		if (targets.has(normalizedCandidate)) {
			return text
				.slice(chunks[index].index + chunks[index][0].length)
				.replace(/^[\s._-]+/, '')
				.trim();
		}

		if (normalizedCandidate.length > longestTargetLength + 8) break;
	}

	return '';
}

function collectRawBookValues(audio) {
	return [audio.book, audio.book_full_name, audio.category]
		.map((value) => String(value ?? '').trim())
		.filter((value) => value && !isIgnoredAudioBookValue(value));
}

function firstMeaningfulAudioValue(values) {
	return values.find((value) => value && !isIgnoredAudioBookValue(value)) ?? '';
}

function displayAudioValue(value, fallback) {
	const text = String(value ?? '').trim();
	if (text && !isIgnoredAudioBookValue(text)) return text;
	return fallback ?? '';
}

function displayAudioNumber(value, fallback) {
	const text = String(value ?? '').trim();
	if (text) return text;
	return fallback ?? '';
}

function isIgnoredAudioBookValue(value) {
	const normalized = normalizeBook(value);
	const canonical = canonicalBookKey(value);
	return IGNORED_AUDIO_BOOK_VALUES.has(normalized) || IGNORED_AUDIO_BOOK_VALUES.has(canonical);
}

function parseAudioNumber(value) {
	if (value === null || value === undefined || value === '') return undefined;
	const parsed = Number.parseInt(String(value), 10);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function getAudioFilenameStem(audio) {
	if (!audio.s3_key || !String(audio.s3_key).trim()) return '';
	const filename = path.basename(String(audio.s3_key));
	try {
		return decodeURIComponent(filename).replace(/\.[A-Za-z0-9]+$/, '');
	} catch {
		return filename.replace(/\.[A-Za-z0-9]+$/, '');
	}
}

function getSyntheticSourceTitle(metadata, definition) {
	const title = metadata.titleForDisplay || metadata.titleForMatching || metadata.originalTitle;
	if (title) return title;
	return `${definition.book} ${metadata.number}`;
}

function scoreTitle(left, right) {
	if (!left || !right) return 0;
	if (left === right) return 1;

	const editScore = normalizedLevenshteinSimilarity(left, right);
	const tokenScore = diceCoefficient(tokenize(left), tokenize(right));
	const containmentScore = scoreContainment(left, right);

	return Math.max(editScore, tokenScore, containmentScore);
}

function scoreBook(metadata, sourceSong) {
	const sourceBook = normalizeBook(sourceSong.book);
	const sourceCanonical = canonicalBookKey(sourceSong.book);

	let best = 0;
	for (const audioBook of metadata.bookValues) {
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

	if (metadata.canonicalBooks.includes(sourceCanonical)) {
		best = Math.max(best, 1);
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
		.replace(/\b(no|num|numero)\b/g, ' ')
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
		'audio_version',
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
	const expandedSourceSongs = addDirectSourceCandidates(sourceSongs, audioRows, options.sourceUrl);
	if (expandedSourceSongs.addedCount > 0) {
		console.log(
			`Added ${expandedSourceSongs.addedCount} direct lyric source candidates from audio metadata`
		);
	}

	const matches = buildMatches(audioRows, expandedSourceSongs.songs, options);

	await writeCsv(matches, options.out);
	console.log(`Wrote ${matches.length} rows to ${relativePath(options.out)}`);
	console.log(`Match summary: ${summarize(matches)}`);
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
