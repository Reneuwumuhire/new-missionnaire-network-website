import { error, redirect } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import { getDb } from '../../../../db/mongo';
import { pageMeta, shareDescription } from '$lib/seo';
import { publicHymnFilter } from '$lib/server/hymns';
import { objectIdString } from '$lib/server/mongo-input';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch }) => {
	const parsed = objectIdString.safeParse(params.id);
	if (!parsed.success) error(404, 'Cantique introuvable');
	const id = new ObjectId(parsed.data).toHexString();
	const path = `/musique/cantiques/${id}`;
	if (params.id !== id) redirect(301, path);

	const db = await getDb();
	const song = await db.collection('music_audio').findOne<{
		title: string;
		s3_url: string;
		book_full_name?: string;
		book?: string;
		category?: string;
		number?: number;
		artist?: string;
	}>({ ...publicHymnFilter, _id: new ObjectId(id) });
	if (!song) error(404, 'Cantique introuvable');

	const response = await fetch(`/api/music-audio/${id}/lyrics`);
	const payload = response.ok ? await response.json() : null;
	const lyrics: Array<{ text: string; kind?: string }> = Array.isArray(payload?.data?.lines)
		? payload.data.lines.flatMap((line: unknown) => {
				if (typeof line === 'string' && line.trim()) return [{ text: line }];
				if (!line || typeof line !== 'object' || !('text' in line) || typeof line.text !== 'string')
					return [];
				return line.text.trim()
					? [
							{
								text: line.text,
								kind: 'kind' in line && typeof line.kind === 'string' ? line.kind : undefined
							}
						]
					: [];
			})
		: [];
	const title = song.title.trim();
	const collection = song.book_full_name || song.category || song.book;
	const reference = [collection, song.number != null ? `n° ${song.number}` : null]
		.filter(Boolean)
		.join(' · ');
	return {
		title,
		reference,
		artist: song.artist,
		audioUrl: song.s3_url,
		lyrics,
		meta: pageMeta(path, {
			title: `${title}${reference ? ` – ${reference}` : ''} | Missionnaire Network`,
			description: shareDescription(
				`Écoutez le cantique « ${title} »${reference ? ` (${reference})` : ''}.${lyrics.length ? ' Consultez les paroles.' : ''}`
			)
		})
	};
};
