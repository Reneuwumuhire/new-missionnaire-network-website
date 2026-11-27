import { SITE_URL } from '$lib/seo';
import { publicHymnFilter } from '$lib/server/hymns';
import { publicLiteratureFilter } from '$lib/server/literature';
import { getTranscriptionSitemapEntries } from '$lib/server/transcriptions';
import { getDb } from '../../db/mongo';
import { buildSermonSlug, type SermonSlugInput } from '../../utils/sermonSlug';

type SitemapDoc = Record<string, unknown>;

function formatLastmod(value: unknown): string | null {
	if (value == null) return null;

	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		return value.toISOString();
	}

	if (typeof value === 'number' && Number.isFinite(value)) {
		const millis = value > 1e12 ? value : value * 1000;
		const date = new Date(millis);
		return Number.isNaN(date.getTime()) ? null : date.toISOString();
	}

	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return null;

		// Supports upload_date formats like "20240221"
		if (/^\d{8}$/.test(trimmed)) {
			const normalized = `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
			const date = new Date(`${normalized}T00:00:00.000Z`);
			return Number.isNaN(date.getTime()) ? null : date.toISOString();
		}

		// Supports numeric timestamps serialized as strings
		if (/^\d{10,13}$/.test(trimmed)) {
			const num = Number(trimmed);
			return formatLastmod(num);
		}

		const date = new Date(trimmed);
		return Number.isNaN(date.getTime()) ? null : date.toISOString();
	}

	return null;
}

function pickLastmod(doc: SitemapDoc, keys: string[]): string | null {
	for (const key of keys) {
		const iso = formatLastmod(doc[key]);
		if (iso) return iso;
	}
	return null;
}

export async function GET() {
	const db = await getDb();
	const [sermons, hymns, transcripts, books, recordings, questions] = await Promise.all([
		db
			.collection('sermons')
			.find(
				{},
				{
					projection: {
						_id: 1,
						french_title: 1,
						english_title: 1,
						date_code: 1,
						full_date_code: 1,
						iso_date: 1,
						updated_at: 1
					}
				}
			)
			.toArray(),
		db
			.collection('music_audio')
			.find(publicHymnFilter, {
				projection: {
					_id: 1,
					updatedAt: 1,
					updated_at: 1,
					uploaded_at: 1
				}
			})
			.toArray(),
		getTranscriptionSitemapEntries(db),
		db
			.collection('literature')
			.find(publicLiteratureFilter, {
				projection: {
					_id: 1,
					updatedAt: 1,
					updated_at: 1
				}
			})
			.toArray(),
		db
			.collection('recordings')
			.find(
				{ published: true, status: 'ready' },
				{ projection: { _id: 1, started_at: 1, updated_at: 1, updatedAt: 1 } }
			)
			.toArray(),
		db
			.collection('questions')
			.find(
				{
					status: { $in: ['approved', 'answered'] },
					deletedAt: null,
					slug: { $type: 'string', $ne: '' }
				},
				{ projection: { slug: 1, updatedAt: 1, answeredAt: 1, createdAt: 1 } }
			)
			.toArray()
	]);

	const pages = [
		'/',
		'/a-propos',
		'/studio',
		'/privacy',
		'/terms',
		'/eglise',
		'/ewald-frank',
		'/ewald-frank/predications',
		'/predications',
		'/predications?author=Retransmissions',
		'/musique',
		'/musique/instrumental',
		'/musique/videos',
		'/transcriptions',
		'/publications',
		'/william-branham/biographie',
		'/videos',
		'/live',
		'/questions',
		'/literature'
	];
	const entries = new Map<string, string | null>(pages.map((path) => [path, null]));
	for (const sermon of sermons) {
		const slug = buildSermonSlug(sermon as SermonSlugInput);
		if (slug) entries.set(`/predications/${slug}`, pickLastmod(sermon, ['updated_at']));
	}
	for (const hymn of hymns) {
		entries.set(
			`/musique/cantiques/${hymn._id}`,
			pickLastmod(hymn, ['updatedAt', 'updated_at', 'uploaded_at'])
		);
	}
	for (const transcript of transcripts) {
		entries.set(
			`/transcriptions/${transcript._id}`,
			pickLastmod(transcript, ['updatedAt', 'uploadDate'])
		);
	}
	for (const book of books) {
		entries.set(`/literature/${book._id}`, pickLastmod(book, ['updatedAt', 'updated_at']));
	}
	for (const recording of recordings) {
		entries.set(
			`/live/rediffusions/${recording._id}`,
			pickLastmod(recording, ['updated_at', 'updatedAt', 'started_at'])
		);
	}
	for (const question of questions) {
		entries.set(
			`/questions/${encodeURIComponent(question.slug)}`,
			pickLastmod(question, ['updatedAt', 'answeredAt', 'createdAt'])
		);
	}

	const urls = Array.from(entries, ([path, lastmod]) => {
		const loc = new URL(path, SITE_URL).href.replaceAll('&', '&amp;');
		return `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`;
	}).join('\n');

	return new Response(
		`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
		{
			headers: {
				'Content-Type': 'application/xml; charset=utf-8',
				'Cache-Control': 'public, max-age=300'
			}
		}
	);
}
