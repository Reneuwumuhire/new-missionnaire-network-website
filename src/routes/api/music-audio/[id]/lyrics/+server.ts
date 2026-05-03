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
		const lyrics = await db.collection<MusicLyricsDoc>('music_lyrics').findOne(query, {
			projection: {
				_id: 0,
				lines: 1,
				timeline_published: 1,
				title: 1
			}
		});

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
		const lines = lyrics.lines.map((line) => {
			if (!line || typeof line !== 'object') return line;

			const id = String((line as { id?: unknown }).id ?? '');
			const startMs = id ? timingByLineId.get(id) : undefined;
			if (startMs === undefined) return line;

			return {
				...line,
				start: startMs / 1000
			};
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
