import { error, redirect } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import { getDb } from '../../../../db/mongo';
import { pageMeta, shareDescription } from '$lib/seo';
import { publicHymnFilter } from '$lib/server/hymns';
import { objectIdString } from '$lib/server/mongo-input';
import type { MusicAudio } from '$lib/models/music-audio';
import { formatHymnLyrics } from '$lib/utils/hymnLyrics';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch }) => {
	const parsed = objectIdString.safeParse(params.id);
	if (!parsed.success) error(404, 'Cantique introuvable');
	const id = new ObjectId(parsed.data).toHexString();
	const path = `/musique/cantiques/${id}`;
	if (params.id !== id) redirect(301, path);

	const db = await getDb();
	const song = await db
		.collection('music_audio')
		.findOne<Omit<MusicAudio, '_id' | 'title'> & { title: string }>(
			{ ...publicHymnFilter, _id: new ObjectId(id) },
			{
				projection: {
					_id: 0,
					title: 1,
					s3_url: 1,
					s3_key: 1,
					book_full_name: 1,
					book: 1,
					category: 1,
					number: 1,
					artist: 1,
					duration: 1,
					file_size: 1,
					intro_skip_sec: 1,
					format: 1,
					uploaded_at: 1
				}
			}
		);
	if (!song) error(404, 'Cantique introuvable');

	const response = await fetch(`/api/music-audio/${id}/lyrics`);
	const payload = response.ok ? await response.json() : null;
	const title = song.title.trim();
	const lyrics = formatHymnLyrics(payload?.data?.lines, title);
	const collection = song.book_full_name || song.category || song.book;
	const reference = [collection, song.number != null ? `n° ${song.number}` : null]
		.filter(Boolean)
		.join(' · ');
	return {
		title,
		reference,
		song: { ...song, _id: id, title, has_lyrics: lyrics.length > 0 },
		lyrics,
		meta: pageMeta(path, {
			title: `${title}${reference ? ` – ${reference}` : ''} | Missionnaire Network`,
			description: shareDescription(
				`Écoutez le cantique « ${title} »${reference ? ` (${reference})` : ''}.${lyrics.length ? ' Consultez les paroles.' : ''}`
			)
		})
	};
};
