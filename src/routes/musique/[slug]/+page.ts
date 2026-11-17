import { YoutubeAudioSchema } from '$lib/models/youtube';
import type { AudioAsset } from '$lib/models/media-assets';
import { pageMeta } from '$lib/seo';
import { z } from 'zod';
import type { PageLoad } from './$types';

const responseSchema = z.object({ data: z.array(YoutubeAudioSchema) });

export const load: PageLoad = async ({ params, fetch }) => {
	const { slug } = params;
	const pageTitle = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	const response = await fetch('/api/yt/audios?type=song&maxResults=40').catch(() => null);
	const payload = response?.ok ? await response.json().catch(() => null) : null;
	const songs = responseSchema.safeParse(payload).data?.data ?? [];

	return {
		songs: songs.map((song): AudioAsset => {
			const { url, fileName, durationInSec } = song.audioFiles.default;
			return {
				url,
				fileName,
				duration: durationInSec,
				title: song.title,
				author: song.artist,
				description: song.description,
				shortDescription: '',
				type: 'audio',
				path: url,
				size: 0,
				sampleRate: 0,
				waveform: [],
				languages: [],
				tags: ['song'],
				thumbnails: { default: { url: song.thumbnail, width: 0, height: 0 } },
				transcription: null,
				video: null,
				versions: {}
			};
		}),
		// Rendered by the root layout as the single og:*/twitter:* tag set.
		meta: pageMeta(`/musique/${slug}`, {
			title: `${pageTitle} | Musique - Missionnaire Network`,
			description: `Écoutez les cantiques de ${pageTitle} sur Missionnaire Network.`
		})
	};
};
