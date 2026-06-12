import { error } from '@sveltejs/kit';
import { getDb } from '../../../../db/mongo';

// Serves a broadcast's SRT transcript to the player. Proxying (instead of a
// direct browser→S3 fetch) avoids any S3 CORS configuration and normalizes
// the charset. The key is resolved against scheduled_lives, so only files
// actually attached to a broadcast can be fetched — this is not an open
// proxy onto the bucket. Keys are unique per upload (timestamp+uuid), so the
// response is immutable and can be cached aggressively at the edge.
export async function GET({ url, fetch, setHeaders }) {
	const key = url.searchParams.get('key') ?? '';
	if (!key.startsWith('subtitles/') || !key.endsWith('.srt') || key.includes('..')) {
		throw error(400, 'Invalid subtitle key');
	}

	let srtUrl: string | null = null;
	try {
		const db = await getDb();
		const doc = await db
			.collection('scheduled_lives')
			.findOne({ subtitle_srt_s3_key: key }, { projection: { subtitle_srt_url: 1 } });
		srtUrl = (doc?.subtitle_srt_url as string | undefined) ?? null;
	} catch (e) {
		console.error('[subtitles/file] lookup error:', e);
	}
	if (!srtUrl || !srtUrl.startsWith('https://')) throw error(404, 'Subtitle not found');

	const upstream = await fetch(srtUrl);
	if (!upstream.ok) throw error(502, 'Subtitle file unavailable');
	const body = await upstream.text();

	setHeaders({
		'Content-Type': 'text/plain; charset=utf-8',
		'Cache-Control': 'public, max-age=31536000, immutable'
	});
	return new Response(body);
}
