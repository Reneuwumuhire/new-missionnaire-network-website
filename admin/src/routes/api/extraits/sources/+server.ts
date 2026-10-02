import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { getTranscriptPdfForRecording } from '$lib/server/video-sync';
import { sourcePublicUrl, sourceSermonSlug } from '$lib/extrait-source';
import { getDb } from '../../../../db/mongo';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function dateLabel(value: unknown): string {
	const date = new Date(String(value || ''));
	return Number.isNaN(date.getTime())
		? ''
		: new Intl.DateTimeFormat('fr-FR', {
				day: 'numeric',
				month: 'long',
				year: 'numeric',
				timeZone: 'UTC'
			}).format(date);
}

export const GET: RequestHandler = async ({ locals, url }) => {
	const permissions = getPermissions(locals.user);
	if (!permissions.can_manage_extraits) throw error(403, 'Accès refusé');

	const query = url.searchParams.get('q')?.trim() ?? '';
	if (query.length < 2) return json({ suggestions: [] });
	if (query.length > 100) throw error(400, 'Recherche trop longue');

	const db = await getDb();
	const regex = { $regex: escapeRegex(query), $options: 'i' };
	const [recordings, sermons] = await Promise.all([
		db
			.collection('recordings')
			.find(
				{
					published: true,
					status: 'ready',
					$or: [{ title: regex }, { description: regex }]
				},
				{
					projection: {
						title: 1,
						started_at: 1,
						source_video_id: 1,
						transcript_pdf_id: 1
					}
				}
			)
			.sort({ started_at: -1 })
			.limit(6)
			.toArray(),
		db
			.collection('sermons')
			.find(
				{
					published: { $ne: false },
					status: { $nin: ['draft', 'scheduled', 'archived', 'private'] },
					$or: [
						{ french_title: regex },
						{ english_title: regex },
						{ full_date_code: regex },
						{ date_code: regex },
						{ author: regex }
					]
				},
				{
					projection: {
						french_title: 1,
						english_title: 1,
						full_date_code: 1,
						date_code: 1,
						iso_date: 1,
						author: 1,
						pdf_url: 1,
						mp3_url: 1
					}
				}
			)
			.sort({ iso_date: -1 })
			.limit(6)
			.toArray()
	]);

	const recordingSuggestions = await Promise.all(
		recordings.map(async (recording) => {
			const id = recording._id.toString();
			const transcript = await getTranscriptPdfForRecording({
				transcript_pdf_id: recording.transcript_pdf_id as string | null | undefined,
				source_video_id: recording.source_video_id as string | null | undefined,
				started_at: recording.started_at as Date | string | null | undefined
			});
			return {
				id,
				kind: 'recording',
				title: String(recording.title || 'Retransmission'),
				subtitle: ['Retransmission', dateLabel(recording.started_at)].filter(Boolean).join(' · '),
				links: [
					{ kind: 'live', label: 'Écouter la retransmission', href: `/live/rediffusions/${id}` },
					...(recording.source_video_id
						? [
								{
									kind: 'video',
									label: 'Voir la vidéo',
									href: `/videos?v=${encodeURIComponent(String(recording.source_video_id))}`
								}
							]
						: []),
					...(transcript ? [{ kind: 'pdf', label: 'Lire le PDF', href: transcript.url }] : [])
				]
			};
		})
	);

	const sermonSuggestions = sermons.map((sermon) => {
		const title = String(
			sermon.french_title || sermon.english_title || sermon.full_date_code || 'Prédication'
		);
		const date = dateLabel(sermon.iso_date);
		const pdf = sourcePublicUrl(sermon.pdf_url);
		const audio = sourcePublicUrl(sermon.mp3_url);
		return {
			id: sermon._id.toString(),
			kind: 'sermon',
			title: date ? `${title} — ${date}` : title,
			subtitle: ['Prédication', String(sermon.author || ''), String(sermon.full_date_code || '')]
				.filter(Boolean)
				.join(' · '),
			links: [
				{
					kind: 'sermon',
					label: 'Voir la prédication',
					href: `/predications/${sourceSermonSlug(sermon)}`
				},
				...(pdf ? [{ kind: 'pdf', label: 'Lire le PDF', href: pdf }] : []),
				...(audio ? [{ kind: 'audio', label: 'Écouter l’audio', href: audio }] : [])
			]
		};
	});

	return json({ suggestions: [...recordingSuggestions, ...sermonSuggestions] });
};
