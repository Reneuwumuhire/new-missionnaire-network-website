import { getDb } from '../../db/mongo';

export async function GET() {
	const db = await getDb();
	const videos = await db
		.collection('videos')
		.find({}, { projection: { id: 1 } })
		.toArray();
	const audios = await db
		.collection('AUDIO_ASSETS')
		.find({}, { projection: { slug: 1 } })
		.toArray();
	const newMusic = await db
		.collection('music_audio')
		.find({}, { projection: { _id: 1, title: 1 } })
		.toArray();

	const baseUrl = 'https://www.missionnaire.net';
	const pages = [
		'',
		'/a-propos',
		'/eglise',
		'/ewald-frank',
		'/galerie',
		'/predications',
		'/musique',
		'/documents',
		'/transcriptions',
		'/william-branham'
	];

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${pages
		.map(
			(page) => `
  <url>
    <loc>${baseUrl}${page}</loc>
    <changefreq>daily</changefreq>
    <priority>${page === '' ? '1.0' : '0.8'}</priority>
  </url>`
		)
		.join('')}
  ${videos
		.map(
			(v) => `
  <url>
    <loc>${baseUrl}/predications/${v.id || v._id}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`
		)
		.join('')}
  ${audios
		.map(
			(a) => `
  <url>
    <loc>${baseUrl}/musique/${a.slug || a._id}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>`
		)
		.join('')}
  ${newMusic
		.map(
			(m) => `
  <url>
    <loc>${baseUrl}/musique?search=${encodeURIComponent(m.title || '')}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>`
		)
		.join('')}
</urlset>`.trim();

	return new Response(sitemap, {
		headers: {
			'Content-Type': 'application/xml'
		}
	});
}
