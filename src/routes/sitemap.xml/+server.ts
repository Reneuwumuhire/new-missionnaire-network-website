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

function pickLastmod(doc: SitemapDoc, keys: string[], fallbackIso: string): string {
	for (const key of keys) {
		const iso = formatLastmod(doc[key]);
		if (iso) return iso;
	}
	return fallbackIso;
}

function buildUrlEntry({
	loc,
	lastmod,
	changefreq,
	priority
}: {
	loc: string;
	lastmod: string;
	changefreq: 'daily' | 'weekly' | 'monthly';
	priority: string;
}) {
	return `
  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export async function GET() {
	const db = await getDb();
	const sermons = await db
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
		.toArray();
	const audios = await db
		.collection('AUDIO_ASSETS')
		.find(
			{},
			{
				projection: {
					slug: 1,
					_id: 1,
					releaseDate: 1,
					publishedAt: 1,
					timestamp: 1,
					upload_date: 1,
					updatedAt: 1,
					updated_at: 1
				}
			}
		)
		.toArray();
	const recordings = await db
		.collection('recordings')
		.find(
			{ published: true, status: 'ready' },
			{ projection: { _id: 1, started_at: 1, updated_at: 1, updatedAt: 1 } }
		)
		.toArray();

	const generatedAt = new Date().toISOString().split('T')[0];
	const baseUrl = 'https://missionnaire.net';
	const pages = [
		'',
		'/a-propos',
		'/eglise',
		'/ewald-frank',
		'/predications',
		'/musique',
		'/documents',
		'/transcriptions',
		'/william-branham/biographie',
		'/videos',
		'/live',
		'/literature'
	];

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${pages
		.map(
			(page) => `
${buildUrlEntry({
	loc: `${baseUrl}${page}`,
	lastmod: generatedAt,
	changefreq: 'daily',
	priority: page === '' ? '1.0' : '0.8'
})}`
		)
		.join('')}
  ${sermons
		.map(
			(s) => `
${buildUrlEntry({
	loc: `${baseUrl}/predications/${buildSermonSlug(s as SermonSlugInput)}`,
	lastmod: pickLastmod(s as SitemapDoc, ['updated_at', 'iso_date'], generatedAt),
	changefreq: 'weekly',
	priority: '0.7'
})}`
		)
		.join('')}
  ${audios
		.map(
			(a) => `
${buildUrlEntry({
	loc: `${baseUrl}/musique/${String(a.slug || a._id)}`,
	lastmod: pickLastmod(
		a as SitemapDoc,
		['updatedAt', 'updated_at', 'releaseDate', 'publishedAt', 'upload_date', 'timestamp'],
		generatedAt
	),
	changefreq: 'weekly',
	priority: '0.5'
})}`
		)
		.join('')}
  ${recordings
		.map(
			(r) => `
${buildUrlEntry({
	loc: `${baseUrl}/live/rediffusions/${String(r._id)}`,
	lastmod: pickLastmod(
		r as SitemapDoc,
		['updated_at', 'updatedAt', 'started_at'],
		generatedAt
	),
	changefreq: 'weekly',
	priority: '0.6'
})}`
		)
		.join('')}

</urlset>`.trim();

	return new Response(sitemap, {
		headers: {
			'Content-Type': 'application/xml'
		}
	});
}
