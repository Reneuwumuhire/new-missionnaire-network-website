import { error } from '@sveltejs/kit';

// Same limits as the broadcast metadata endpoint — a scheduled live's
// title/description flow into the gate doc at go-live time.
export const MAX_TITLE_LEN = 120;
export const MAX_DESCRIPTION_LEN = 2000;

export function parseTitle(value: unknown, { required = false } = {}): string | null {
	if (value === null || value === '' || value === undefined) {
		if (required) throw error(400, 'Titre requis');
		return null;
	}
	if (typeof value !== 'string') throw error(400, 'Titre invalide');
	const trimmed = value.trim();
	if (!trimmed && required) throw error(400, 'Titre requis');
	if (trimmed.length > MAX_TITLE_LEN) {
		throw error(400, `Titre trop long (max ${MAX_TITLE_LEN} caractères)`);
	}
	return trimmed || null;
}

export function parseDescription(value: unknown): string | null {
	if (value === null || value === '' || value === undefined) return null;
	if (typeof value !== 'string') throw error(400, 'Description invalide');
	const normalized = value.replaceAll('\r\n', '\n').trim();
	if (normalized.length > MAX_DESCRIPTION_LEN) {
		throw error(400, `Description trop longue (max ${MAX_DESCRIPTION_LEN} caractères)`);
	}
	return normalized || null;
}

/** Thumbnail url + s3 key must come as a pair (both set or both null) —
 *  mirrors the broadcast metadata endpoint contract. */
export function parseThumbnailPair(
	thumbnailUrl: unknown,
	thumbnailS3Key: unknown
): { thumbnail_url: string | null; thumbnail_s3_key: string | null } {
	if ((thumbnailUrl ?? null) === null && (thumbnailS3Key ?? null) === null) {
		return { thumbnail_url: null, thumbnail_s3_key: null };
	}
	if (
		typeof thumbnailUrl === 'string' &&
		typeof thumbnailS3Key === 'string' &&
		thumbnailUrl.startsWith('https://') &&
		thumbnailS3Key.startsWith('broadcast-thumbnails/')
	) {
		return { thumbnail_url: thumbnailUrl, thumbnail_s3_key: thumbnailS3Key };
	}
	throw error(400, 'Données de vignette invalides');
}

/** Subtitle url + s3 key + filename must come as a triple (all set or all
 *  null) — same contract as parseThumbnailPair. */
export function parseSubtitleTriple(
	srtUrl: unknown,
	srtS3Key: unknown,
	srtFilename: unknown
): {
	subtitle_srt_url: string | null;
	subtitle_srt_s3_key: string | null;
	subtitle_filename: string | null;
} {
	if ((srtUrl ?? null) === null && (srtS3Key ?? null) === null && (srtFilename ?? null) === null) {
		return { subtitle_srt_url: null, subtitle_srt_s3_key: null, subtitle_filename: null };
	}
	if (
		typeof srtUrl === 'string' &&
		typeof srtS3Key === 'string' &&
		typeof srtFilename === 'string' &&
		srtUrl.startsWith('https://') &&
		srtS3Key.startsWith('subtitles/') &&
		srtS3Key.endsWith('.srt') &&
		srtFilename.trim().length > 0 &&
		srtFilename.length <= 300
	) {
		return {
			subtitle_srt_url: srtUrl,
			subtitle_srt_s3_key: srtS3Key,
			subtitle_filename: srtFilename.trim()
		};
	}
	throw error(400, 'Données de sous-titres invalides');
}

/** Optional YouTube link. Accepts an empty value (returns null) or a valid
 *  http(s) YouTube URL (youtube.com / youtu.be). Stored as-is for display. */
export function parseYoutubeUrl(value: unknown): string | null {
	if (value === null || value === '' || value === undefined) return null;
	if (typeof value !== 'string') throw error(400, 'Lien YouTube invalide');
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.length > 500) throw error(400, 'Lien YouTube trop long');
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw error(400, 'Lien YouTube invalide');
	}
	const host = url.hostname.replace(/^www\./, '').toLowerCase();
	const isYoutube =
		host === 'youtube.com' ||
		host === 'm.youtube.com' ||
		host === 'youtu.be' ||
		host.endsWith('.youtube.com');
	if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !isYoutube) {
		throw error(400, 'Lien YouTube invalide');
	}
	return trimmed;
}

/** ISO datetime (UTC from the client's datetime-local conversion). Rejects
 *  past dates with a small grace window so "now-ish" scheduling works. */
export function parseScheduledAt(value: unknown, { allowPastMs = 5 * 60 * 1000 } = {}): Date {
	if (typeof value !== 'string') throw error(400, 'Date invalide');
	const ms = Date.parse(value);
	if (Number.isNaN(ms)) throw error(400, 'Date invalide');
	if (ms < Date.now() - allowPastMs) {
		throw error(400, 'La date programmée est déjà passée');
	}
	return new Date(ms);
}
