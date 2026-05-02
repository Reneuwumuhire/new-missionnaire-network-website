import { env } from '$env/dynamic/private';
import { ObjectId } from 'mongodb';
import { getDb } from '../../db/mongo';

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

type Thumbnail = {
	id?: string;
	url: string;
	width?: number;
	height?: number;
};

type VideoMetadata = {
	title: string;
	description: string;
	publishedAt: Date;
	thumbnail: string;
	thumbnails: Thumbnail[];
	duration: number;
	viewCount: number;
	tags: string[];
	liveStatus: string;
};

export type RecordingVideoSource = {
	videoId: string;
	title?: string | null;
	description?: string | null;
	thumbnailUrl?: string | null;
	startedAt?: string | Date | null;
	durationSec?: number | null;
};

export type LinkedTranscriptPdf = {
	_id: string;
	url: string;
	filename: string;
	size: number;
	s3Key?: string;
	publishedOn?: string;
};

export function extractYoutubeVideoId(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	if (YOUTUBE_ID_RE.test(trimmed)) return trimmed;

	try {
		const url = new URL(trimmed);
		const host = url.hostname.replace(/^www\./, '');
		if (host === 'youtu.be') {
			const id = url.pathname.slice(1).split('/')[0];
			return YOUTUBE_ID_RE.test(id) ? id : null;
		}
		if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
			const watchId = url.searchParams.get('v');
			if (watchId && YOUTUBE_ID_RE.test(watchId)) return watchId;
			const pathMatch = url.pathname.match(/^\/(?:live|shorts|embed|v)\/([A-Za-z0-9_-]{11})/);
			return pathMatch ? pathMatch[1] : null;
		}
	} catch {
		return null;
	}

	return null;
}

function parseISO8601Duration(duration: string | undefined): number {
	if (!duration) return 0;
	const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
	if (!match) return 0;
	const hours = Number.parseInt(match[1] || '0', 10);
	const minutes = Number.parseInt(match[2] || '0', 10);
	const seconds = Number.parseInt(match[3] || '0', 10);
	return hours * 3600 + minutes * 60 + seconds;
}

function formatDuration(seconds: number): string {
	if (!seconds) return '0:00';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	return h > 0
		? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
		: `${m}:${String(s).padStart(2, '0')}`;
}

function bestThumbnail(thumbnails: Record<string, { url: string; width?: number; height?: number }> = {}) {
	return (
		thumbnails.maxres?.url ||
		thumbnails.standard?.url ||
		thumbnails.high?.url ||
		thumbnails.medium?.url ||
		thumbnails.default?.url
	);
}

function normalizeDate(value: string | Date | null | undefined): Date | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeTags(rawTags: string[] | undefined, title: string, description: string): string[] {
	const tags = new Set(
		(rawTags || [])
			.map((tag) => tag.trim().toLowerCase())
			.filter(Boolean)
	);
	const text = `${title} ${description}`.toLowerCase();

	if (
		[
			'frank',
			'krefeld',
			'retransmission',
			'reunion de krefeld',
			'réunion de krefeld',
			'mensuelle',
			'ewald'
		].some((keyword) => text.includes(keyword))
	) {
		tags.add('frank');
		tags.add('retransmission');
	}
	if (text.includes('branham')) {
		tags.add('branham');
		tags.add('william');
	}
	if (['letter', 'lettre', 'ibaruwa', 'circulaire'].some((keyword) => text.includes(keyword))) {
		tags.add('lettre');
		tags.add('letter');
		tags.add('ibaruwa');
	}
	if (tags.size === 0) tags.add('local');

	return [...tags];
}

async function fetchFromYouTubeApi(videoId: string): Promise<VideoMetadata | null> {
	const apiKey = env.YOUTUBE_API_KEY?.trim();
	if (!apiKey) return null;

	try {
		const apiUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
		apiUrl.searchParams.set('id', videoId);
		apiUrl.searchParams.set('key', apiKey);
		apiUrl.searchParams.set('part', 'snippet,contentDetails,statistics');

		const response = await fetch(apiUrl);
		if (!response.ok) return null;
		const payload = await response.json();
		const item = payload.items?.[0];
		if (!item) return null;

		const snippet = item.snippet ?? {};
		const publishedAt = normalizeDate(snippet.publishedAt) ?? new Date();
		const duration = parseISO8601Duration(item.contentDetails?.duration);
		const thumbs = Object.entries(
			(snippet.thumbnails ?? {}) as Record<string, { url: string; width?: number; height?: number }>
		).map(([id, value]) => ({ id, ...value }));

		return {
			title: snippet.title || `YouTube ${videoId}`,
			description: snippet.description || '',
			publishedAt,
			thumbnail: bestThumbnail(snippet.thumbnails) || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
			thumbnails: thumbs,
			duration,
			viewCount: Number.parseInt(item.statistics?.viewCount || '0', 10) || 0,
			tags: snippet.tags || [],
			liveStatus: snippet.liveBroadcastContent === 'live' ? 'live' : 'none'
		};
	} catch (err) {
		console.error('[video-sync] YouTube API metadata fetch failed:', err);
		return null;
	}
}

async function fetchFromOEmbed(videoId: string): Promise<Partial<VideoMetadata> | null> {
	try {
		const url = new URL('https://www.youtube.com/oembed');
		url.searchParams.set('url', `https://www.youtube.com/watch?v=${videoId}`);
		url.searchParams.set('format', 'json');
		const response = await fetch(url);
		if (!response.ok) return null;
		const payload = await response.json();
		return {
			title: payload.title || `YouTube ${videoId}`,
			description: '',
			thumbnail: payload.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
			thumbnails: payload.thumbnail_url
				? [
						{
							id: 'oembed',
							url: payload.thumbnail_url,
							width: payload.thumbnail_width,
							height: payload.thumbnail_height
						}
					]
				: []
		};
	} catch (err) {
		console.error('[video-sync] YouTube oEmbed metadata fetch failed:', err);
		return null;
	}
}

async function fetchVideoMetadata(videoId: string): Promise<Partial<VideoMetadata> | null> {
	return (await fetchFromYouTubeApi(videoId)) ?? (await fetchFromOEmbed(videoId));
}

export async function ensureVideoForRecording(source: RecordingVideoSource): Promise<{
	videoObjectId: ObjectId;
	created: boolean;
}> {
	const db = await getDb();
	const videos = db.collection('videos');
	const existing = await videos.findOne({ id: source.videoId }, { projection: { _id: 1 } });
	if (existing?._id instanceof ObjectId) {
		return { videoObjectId: existing._id, created: false };
	}

	const metadata = await fetchVideoMetadata(source.videoId);
	const fallbackDate = normalizeDate(source.startedAt) ?? new Date();
	const publishedAt = normalizeDate(metadata?.publishedAt as Date | string | undefined) ?? fallbackDate;
	const timestamp = Math.floor(publishedAt.getTime() / 1000);
	const title = metadata?.title || source.title || `YouTube ${source.videoId}`;
	const description = metadata?.description || source.description || '';
	const duration = metadata?.duration && metadata.duration > 0 ? metadata.duration : source.durationSec ?? 0;
	const thumbnail =
		metadata?.thumbnail || source.thumbnailUrl || `https://i.ytimg.com/vi/${source.videoId}/hqdefault.jpg`;
	const url = `https://www.youtube.com/watch?v=${source.videoId}`;

	await videos.updateOne(
		{ id: source.videoId },
		{
			$setOnInsert: {
				id: source.videoId,
				display_id: source.videoId,
				title,
				fulltitle: title,
				description,
				duration,
				view_count: metadata?.viewCount ?? 0,
				webpage_url: url,
				original_url: url,
				thumbnail,
				thumbnails: metadata?.thumbnails ?? [],
				tags: normalizeTags(metadata?.tags, title, description),
				upload_date: publishedAt.toISOString(),
				publishedAt,
				timestamp,
				release_timestamp: timestamp,
				live_status: metadata?.liveStatus ?? 'none',
				availability: 'public',
				duration_string: formatDuration(duration),
				release_year: publishedAt.getUTCFullYear(),
				epoch: Math.floor(Date.now() / 1000),
				aspect_ratio: 1.777,
				pdfInfo: [],
				created_from: 'live_recording_link',
				created_at: new Date()
			}
		},
		{ upsert: true }
	);

	const synced = await videos.findOne({ id: source.videoId }, { projection: { _id: 1 } });
	if (!(synced?._id instanceof ObjectId)) {
		throw new Error('Impossible de créer la vidéo liée');
	}

	return { videoObjectId: synced._id, created: true };
}

function serializeTranscriptPdf(pdf: Record<string, unknown>): LinkedTranscriptPdf | null {
	if (!pdf.url) return null;
	const publishedOn = pdf.publishedOn instanceof Date
		? pdf.publishedOn.toISOString()
		: typeof pdf.publishedOn === 'string'
			? pdf.publishedOn
			: undefined;
	return {
		_id: String(pdf._id),
		url: String(pdf.url),
		filename: typeof pdf.filename === 'string' ? pdf.filename : 'transcription.pdf',
		size: typeof pdf.size === 'number' ? pdf.size : 0,
		s3Key: typeof pdf.s3Key === 'string' ? pdf.s3Key : undefined,
		publishedOn
	};
}

export async function getFirstTranscriptPdfForVideo(
	videoObjectId: ObjectId
): Promise<LinkedTranscriptPdf | null> {
	const db = await getDb();
	const pdf = await db
		.collection('pdfs')
		.findOne(
			{ $or: [{ videoId: videoObjectId }, { videoId: String(videoObjectId) }] },
			{ sort: { publishedOn: -1, uploadDate: -1, _id: -1 } }
		);
	return pdf ? serializeTranscriptPdf(pdf) : null;
}

export async function getTranscriptPdfForRecording(recording: {
	transcript_pdf_id?: string | null;
	source_video_id?: string | null;
	started_at?: string | Date | null;
}): Promise<LinkedTranscriptPdf | null> {
	const db = await getDb();

	if (recording.transcript_pdf_id && ObjectId.isValid(recording.transcript_pdf_id)) {
		const attached = await db
			.collection('pdfs')
			.findOne({ _id: new ObjectId(recording.transcript_pdf_id) });
		const serialized = attached ? serializeTranscriptPdf(attached) : null;
		if (serialized) return serialized;
	}

	let videoObjectId: ObjectId | null = null;
	if (recording.source_video_id) {
		const video = await db
			.collection('videos')
			.findOne({ id: recording.source_video_id }, { projection: { _id: 1 } });
		if (video?._id instanceof ObjectId) videoObjectId = video._id;
	}

	if (!videoObjectId && recording.started_at) {
		const startedAt = recording.started_at instanceof Date
			? recording.started_at.toISOString()
			: recording.started_at;
		const day = startedAt.slice(0, 10);
		if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
			const [year, month, date] = day.split('-');
			const flexibleDate = String.raw`${year}\s*-\s*${month}\s*-\s*${date}`;
			const video = await db
				.collection('videos')
				.findOne({ title: { $regex: flexibleDate } }, { projection: { _id: 1 } });
			if (video?._id instanceof ObjectId) videoObjectId = video._id;
		}
	}

	return videoObjectId ? getFirstTranscriptPdfForVideo(videoObjectId) : null;
}
