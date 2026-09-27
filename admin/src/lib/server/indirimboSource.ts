import { gunzipSync } from 'node:zlib';

const APP_HOST = 'indirimbo-zikundwa.github.io';
const APP_PATH = '/app';
const SONGS_PATH = '/songs';
const DATA_URL = `https://${APP_HOST}/data/hymns.json.gz`;

export type IndirimboSong = {
	id: string;
	label: string;
	stanzas: Array<{ text: string; type: 'chorus' | 'verse' }>;
	title: string;
};

type SongMatchOptions = { audioTitle?: string; versionLabel?: string };

let libraryPromise: Promise<IndirimboSong[]> | undefined;

export function isIndirimboSourceUrl(url: URL) {
	return (
		(url.hostname === APP_HOST &&
			(url.pathname === APP_PATH ||
				url.pathname.startsWith(`${APP_PATH}/`) ||
				url.pathname.startsWith(`${SONGS_PATH}/`))) ||
		url.hostname === 'indirimbo-zikundwa.bi'
	);
}

export function findIndirimboSongs(
	sourceUrl: string,
	songs: IndirimboSong[],
	options: SongMatchOptions = {}
) {
	const url = new URL(sourceUrl);
	if (!isIndirimboSourceUrl(url)) throw new Error('Unsupported lyrics source');

	const href = url.href.toLowerCase();
	const exactMatch = songs.reduce<IndirimboSong | undefined>((match, song) => {
		if (!href.includes(song.id.toLowerCase())) return match;
		return !match || song.id.length > match.id.length ? song : match;
	}, undefined);
	if (exactMatch) return [exactMatch];

	const legacyId = url.pathname
		.split('/')
		.pop()
		?.replace(/\.html$/i, '')
		.toLowerCase();
	const candidates = songs.filter((song) => song.id.toLowerCase().startsWith(`${legacyId}-`));
	if (candidates.length === 1) return candidates;

	const versions = options.versionLabel?.toUpperCase().match(/[A-Z]/g) ?? [];
	if (versions.length > 0) {
		const versionMatches = candidates.filter((song) =>
			versions.some((version) => song.id.toUpperCase().endsWith(`-${version}`))
		);
		if (versionMatches.length > 0) return versionMatches;
	}

	const audioTitle = normalize(options.audioTitle);
	const titleMatch = candidates.find((song) => audioTitle.includes(normalize(song.title)));
	return titleMatch ? [titleMatch] : [];
}

export async function loadIndirimboSongs(sourceUrl: string, options: SongMatchOptions = {}) {
	const songs = await loadLibrary();
	const matches = findIndirimboSongs(sourceUrl, songs, options);
	if (matches.length === 0) throw new Error('Could not identify a song from this URL');
	return matches;
}

function normalize(value?: string) {
	return String(value ?? '')
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

async function loadLibrary() {
	if (!libraryPromise) {
		libraryPromise = fetch(DATA_URL, {
			headers: {
				accept: 'application/gzip,application/octet-stream',
				'user-agent': 'MissionnaireNetworkLyricsReview/0.1 (+https://missionnaire.net)'
			}
		})
			.then(async (response) => {
				if (!response.ok) throw new Error(`Could not fetch lyrics catalog (${response.status})`);
				const data = JSON.parse(
					gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8')
				);
				if (
					!Array.isArray(data.songs) ||
					!data.songs.every(
						(song: Partial<IndirimboSong>) =>
							typeof song.id === 'string' &&
							typeof song.label === 'string' &&
							typeof song.title === 'string' &&
							Array.isArray(song.stanzas) &&
							song.stanzas.every(
								(stanza) =>
									typeof stanza.text === 'string' &&
									(stanza.type === 'chorus' || stanza.type === 'verse')
							)
					)
				) {
					throw new Error('The lyrics catalog is invalid');
				}
				return data.songs as IndirimboSong[];
			})
			.catch((error) => {
				libraryPromise = undefined;
				throw error;
			});
	}

	return libraryPromise;
}
