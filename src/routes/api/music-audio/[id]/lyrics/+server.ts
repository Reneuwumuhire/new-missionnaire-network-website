import { json } from '@sveltejs/kit';
import { ObjectId, type Filter } from 'mongodb';
import { getDb } from '../../../../../db/mongo';
import type { RequestEvent } from './$types';

type MusicLyricsDoc = {
	audio_id?: string | ObjectId;
	lyrics_status?: string;
	lines?: unknown[];
	timeline_published?: unknown;
	title?: string;
};

type MusicAudioDoc = {
	book?: string | null;
};

export async function GET({ params }: RequestEvent) {
	try {
		const audioId = params.id?.trim();

		if (!audioId) {
			return json({ data: null, error: 'Missing audio id' }, { status: 400 });
		}

		const audioIdMatches: Array<string | ObjectId> = [audioId];
		if (ObjectId.isValid(audioId)) {
			audioIdMatches.push(new ObjectId(audioId));
		}

		const query: Filter<MusicLyricsDoc> = {
			audio_id: { $in: audioIdMatches },
			lyrics_status: 'published'
		};

		const db = await getDb();
		// Lyrics doc + audio doc fetched in parallel — the audio doc gives us
		// the short book name (e.g. "A.F", "JEM") to prefix the title heading.
		// music_audio uses ObjectId _id, so only look it up when the param
		// parses as one. A non-ObjectId audioId just skips the book prefix.
		const audioObjectId = ObjectId.isValid(audioId) ? new ObjectId(audioId) : null;
		const [lyrics, audio] = await Promise.all([
			db.collection<MusicLyricsDoc>('music_lyrics').findOne(query, {
				projection: { _id: 0, lines: 1, timeline_published: 1, title: 1 }
			}),
			audioObjectId
				? db
						.collection<MusicAudioDoc>('music_audio')
						.findOne({ _id: audioObjectId } as Filter<MusicAudioDoc>, {
							projection: { _id: 0, book: 1 }
						})
				: Promise.resolve(null)
		]);

		if (!lyrics || !Array.isArray(lyrics.lines) || lyrics.lines.length === 0) {
			return json({ data: null, error: null });
		}

		const timeline = Array.isArray(lyrics.timeline_published) ? lyrics.timeline_published : [];
		const timingByLineId = new Map(
			timeline
				.map((timing) => {
					if (!timing || typeof timing !== 'object') return null;
					const lineId = String((timing as { line_id?: unknown }).line_id ?? '');
					const startMs = Number((timing as { start_ms?: unknown }).start_ms);
					if (!lineId || !Number.isFinite(startMs)) return null;
					return [lineId, startMs] as const;
				})
				.filter((timing): timing is readonly [string, number] => timing !== null)
		);

		// Prefix the song-title heading with the short book name so listeners
		// know which hymnal/recueil the song comes from at a glance — e.g.
		// "370 - À DE NOUVEAUX COMBATS" → "A.F 370 - À DE NOUVEAUX COMBATS".
		// Only the FIRST heading whose text starts with a song number is
		// prefixed (section labels like "Couplet 1" / "Refrain" are left alone).
		// Idempotent: if the heading already starts with the book, skip.
		const bookShort = audio?.book?.trim() ?? '';
		let titleHeadingPrefixed = false;
		const lines = lyrics.lines.map((line) => {
			if (!line || typeof line !== 'object') return line;

			const lineObj = line as Record<string, unknown>;
			const id = String(lineObj.id ?? '');
			const startMs = id ? timingByLineId.get(id) : undefined;

			let next: Record<string, unknown> = lineObj;

			if (
				bookShort &&
				!titleHeadingPrefixed &&
				lineObj.kind === 'heading' &&
				typeof lineObj.text === 'string'
			) {
				const headingText = lineObj.text.trim();
				const startsWithNumber = /^\d+[\s\-–—.]/.test(headingText);
				const alreadyPrefixed = headingText
					.toLowerCase()
					.startsWith(bookShort.toLowerCase());
				if (startsWithNumber && !alreadyPrefixed) {
					next = { ...lineObj, text: `${bookShort} ${headingText}` };
					titleHeadingPrefixed = true;
				}
			}

			if (startMs !== undefined) {
				next = { ...next, start: startMs / 1000 };
			}

			return next === lineObj ? line : next;
		});

		return json({
			data: {
				lines,
				title: lyrics.title ?? ''
			},
			error: null
		});
	} catch (error) {
		console.error('[API] music-audio lyrics error:', error);
		return json(
			{
				data: null,
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
}
