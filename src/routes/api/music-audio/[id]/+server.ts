import { json } from '@sveltejs/kit';
import { ObjectId, type Collection, type Filter } from 'mongodb';
import { getDb } from '../../../../db/mongo';
import { looksLikeObjectId, songSlug } from '$lib/utils/songSlug';
import type { RequestEvent } from './$types';

type MusicAudioDoc = Record<string, unknown> & { _id?: ObjectId; title?: string | null };

// Returns a single music_audio doc by either its MongoDB ObjectId or
// its title slug (e.g. /api/music-audio/zitakuwa-nyota-tajini). Drives
// the shared-link landing flow on /musique?play=<id-or-slug>:
//
//   - Slugs are what the share button generates today — easier to read
//     in WhatsApp, easier to recognise in an address bar.
//   - ObjectIds remain supported so links shared before this change
//     keep resolving, and so renamed titles don't break old shares
//     entirely (an ObjectId is durable; a slug is title-derived).
//
// Slug ambiguity (two songs sharing a title) returns the first match —
// listeners who hit that case can still get a non-ambiguous URL by
// sharing via the player's ObjectId fallback when no title is set.
export async function GET({ params, setHeaders }: RequestEvent) {
	try {
		const param = params.id?.trim();
		if (!param) return json({ data: null, error: 'Missing audio id' }, { status: 400 });

		const db = await getDb();
		const collection = db.collection<MusicAudioDoc>('music_audio');

		const doc = (await findById(collection, param)) ?? (await findBySlug(collection, param));
		if (!doc) return json({ data: null, error: 'Not found' }, { status: 404 });

		setHeaders({
			'cache-control': 'public, s-maxage=60, stale-while-revalidate=300'
		});

		return json({ data: serialise(doc), error: null });
	} catch (error) {
		console.error('[API] music-audio by-id error:', error);
		return json(
			{ data: null, error: error instanceof Error ? error.message : 'Unknown error' },
			{ status: 500 }
		);
	}
}

async function findById(
	collection: Collection<MusicAudioDoc>,
	param: string
): Promise<MusicAudioDoc | null> {
	if (!looksLikeObjectId(param) || !ObjectId.isValid(param)) return null;
	return collection.findOne({ _id: new ObjectId(param) } as Filter<MusicAudioDoc>);
}

// Slug fallback: prefix-narrow on the first slug segment with
// case+diacritic-insensitive collation, then JS-slug match exactly.
// `limit(200)` caps the worst-case bandwidth in the unlikely event a
// single first-letter group has hundreds of titles; the candidate set
// for "zitakuwa-…" is single digits in practice.
async function findBySlug(
	collection: Collection<MusicAudioDoc>,
	slug: string
): Promise<MusicAudioDoc | null> {
	const firstSegment = slug.split('-')[0] ?? '';
	if (!firstSegment) return null;
	const escaped = firstSegment.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
	const candidates = await collection
		.find(
			{ title: { $type: 'string', $ne: '', $regex: `^${escaped}`, $options: 'i' } },
			{ projection: { _id: 1, title: 1 } }
		)
		.collation({ locale: 'fr', strength: 1 })
		.limit(200)
		.toArray();
	const matchId = candidates.find((row) => songSlug(row.title ?? '') === slug)?._id;
	if (!matchId) return null;
	return collection.findOne({ _id: matchId } as Filter<MusicAudioDoc>);
}

// Mirror the shape returned by /api/music-audio so callers can treat
// the row identically to a list entry. Dates serialise to ISO strings;
// _id flattens to a string.
function serialise(doc: MusicAudioDoc): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const key in doc) {
		if (!Object.hasOwn(doc, key)) continue;
		const value = (doc as Record<string, unknown>)[key];
		if (value instanceof ObjectId) out[key] = value.toString();
		else if (value instanceof Date) out[key] = value.toISOString();
		else out[key] = value;
	}
	return out;
}
