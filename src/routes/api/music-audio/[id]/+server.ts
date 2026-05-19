import { json } from '@sveltejs/kit';
import { ObjectId, type Filter } from 'mongodb';
import { getDb } from '../../../../db/mongo';
import type { RequestEvent } from './$types';

type MusicAudioDoc = Record<string, unknown> & { _id?: ObjectId };

// Returns a single music_audio doc by `_id`. Drives the shared-link
// landing flow on /musique: when a recipient opens ?play=<id> and the
// song isn't in the current filtered view, the page falls back to this
// endpoint so playback still resolves.
export async function GET({ params, setHeaders }: RequestEvent) {
	try {
		const audioId = params.id?.trim();

		if (!audioId || !ObjectId.isValid(audioId)) {
			return json({ data: null, error: 'Invalid audio id' }, { status: 400 });
		}

		const db = await getDb();
		const doc = await db
			.collection<MusicAudioDoc>('music_audio')
			.findOne({ _id: new ObjectId(audioId) } as Filter<MusicAudioDoc>);

		if (!doc) {
			return json({ data: null, error: 'Not found' }, { status: 404 });
		}

		// Mirror the shape returned by /api/music-audio so callers can
		// treat the row identically to a list entry. Dates serialise to
		// ISO strings; _id flattens to a string.
		const serialised: Record<string, unknown> = {};
		for (const key in doc) {
			if (!Object.hasOwn(doc, key)) continue;
			const value = (doc as Record<string, unknown>)[key];
			if (value instanceof ObjectId) serialised[key] = value.toString();
			else if (value instanceof Date) serialised[key] = value.toISOString();
			else serialised[key] = value;
		}

		setHeaders({
			'cache-control': 'public, s-maxage=60, stale-while-revalidate=300'
		});

		return json({ data: serialised, error: null });
	} catch (error) {
		console.error('[API] music-audio by-id error:', error);
		return json(
			{
				data: null,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
}
