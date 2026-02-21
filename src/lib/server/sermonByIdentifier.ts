import { ObjectId } from 'mongodb';
import { getDb } from '../../db/mongo';
import { extractDateCodeFromSlug } from '../../utils/sermonSlug';

export type SermonDoc = {
	_id: ObjectId | string;
	author?: string;
	date_code?: string;
	full_date_code?: string;
	french_title?: string;
	english_title?: string;
	iso_date?: string;
	mp3_url?: string | null;
	pdf_url?: string | null;
	english_audio_url?: string | null;
	english_pdf_url?: string | null;
	[field: string]: unknown;
};

const LEGACY_ID_FIELDS = ['id', 'videoId', 'display_id', 'youtube_id', 'yt_id'] as const;

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractDateCodeFromText(value: string): string | null {
	const match = value.match(/\b(\d{2}-\d{4}[a-z]?)\b/i);
	if (!match) return null;
	return match[1].toUpperCase();
}

export function normalizeSermon(doc: SermonDoc): Record<string, unknown> {
	return {
		...doc,
		_id: doc._id?.toString()
	};
}

export async function findSermonByIdentifier(identifier: string): Promise<SermonDoc | null> {
	const db = await getDb();
	const sermons = db.collection<SermonDoc>('sermons');

	let doc = await sermons.findOne({ slug: identifier } as unknown as Record<string, unknown>);
	if (doc) return doc;

	if (ObjectId.isValid(identifier)) {
		doc = await sermons.findOne({ _id: new ObjectId(identifier) } as unknown as Record<
			string,
			unknown
		>);
		if (doc) return doc;
	}

	for (const field of LEGACY_ID_FIELDS) {
		doc = await sermons.findOne({ [field]: identifier } as unknown as Record<string, unknown>);
		if (doc) return doc;
	}

	const legacyVideo = await db
		.collection<{ title?: string; fulltitle?: string }>('videos')
		.findOne({ id: identifier } as unknown as Record<string, unknown>, {
			projection: { title: 1, fulltitle: 1 }
		});
	if (legacyVideo) {
		const videoDateCode = extractDateCodeFromText(
			String(legacyVideo.title || legacyVideo.fulltitle || '')
		);
		if (videoDateCode) {
			const dateRegex = new RegExp(`^${escapeRegex(videoDateCode)}$`, 'i');
			doc = await sermons.findOne({
				$or: [{ date_code: dateRegex }, { full_date_code: dateRegex }]
			} as unknown as Record<string, unknown>);
			if (doc) return doc;
		}
	}

	const dateCode = extractDateCodeFromSlug(identifier);
	if (dateCode) {
		const dateRegex = new RegExp(`^${escapeRegex(dateCode)}$`, 'i');
		doc = await sermons.findOne({
			$or: [{ date_code: dateRegex }, { full_date_code: dateRegex }]
		} as unknown as Record<string, unknown>);
		if (doc) return doc;
	}

	const titleCandidate = identifier
		.replace(/-\d{2}-\d{4}[a-z]?$/i, '')
		.replace(/-/g, ' ')
		.trim();
	if (titleCandidate) {
		const titleRegex = new RegExp(`^${escapeRegex(titleCandidate)}$`, 'i');
		doc = await sermons.findOne({
			$or: [{ french_title: titleRegex }, { english_title: titleRegex }]
		} as unknown as Record<string, unknown>);
		if (doc) return doc;
	}

	return null;
}
