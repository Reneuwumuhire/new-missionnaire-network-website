import { error } from '@sveltejs/kit';
import { getPublishedById, getTranscriptForRecording } from '$lib/server/recordings';
import { getScheduledLiveByRecordingId } from '../../../../db/collections';
import type { PageServerLoad } from './$types';
import { pageMeta, shareTitle, shareDescription } from '$lib/seo';

function formatDateFr(iso: string | null): string {
	if (!iso) return '';
	try {
		return new Intl.DateTimeFormat('fr-FR', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		}).format(new Date(iso));
	} catch {
		return '';
	}
}

const ALLOWED_BACK_PARAMS = new Set(['page', 'q', 'year', 'month', 'type']);

// Rebuild a safe back-URL from the `from` query string. We only whitelist
// the params the list page actually uses, so someone can't craft a link
// like `?from=foo=bar` to inject arbitrary state.
function sanitizeFrom(from: string | null): string {
	if (!from) return '/live/rediffusions';
	try {
		const parsed = new URLSearchParams(from);
		const clean = new URLSearchParams();
		for (const [key, value] of parsed) {
			if (ALLOWED_BACK_PARAMS.has(key) && value) clean.set(key, value);
		}
		const qs = clean.toString();
		return qs ? `/live/rediffusions?${qs}` : '/live/rediffusions';
	} catch {
		return '/live/rediffusions';
	}
}

export const load: PageServerLoad = async ({ params, url }) => {
	const recording = await getPublishedById(params.id);
	if (!recording) throw error(404, 'Enregistrement introuvable');
	const backHref = sanitizeFrom(url.searchParams.get('from'));
	const transcript = await getTranscriptForRecording({
		transcript_pdf_id: recording.transcript_pdf_id,
		source_video_id: recording.source_video_id,
		started_at: recording.started_at
	});

	// Synced SRT transcript: if this recording's broadcast had subtitles AND
	// the admin anchored them during the live, translate that wall-clock anchor
	// into an offset from the recording start. The recorder captures the same
	// Icecast output listeners heard, so recording position t was on air at
	// started_at + t — hence SRT 00:00 sits at (anchor + offset − started_at)
	// into the file.
	let subtitles: { url: string; offsetIntoRecordingMs: number } | null = null;
	const scheduled = await getScheduledLiveByRecordingId(recording.id);
	if (
		scheduled?.subtitle_srt_s3_key &&
		typeof scheduled.subtitle_anchor_epoch_ms === 'number' &&
		recording.started_at
	) {
		const startedMs = Date.parse(recording.started_at);
		if (Number.isFinite(startedMs)) {
			subtitles = {
				url: `/api/subtitles/file?key=${encodeURIComponent(scheduled.subtitle_srt_s3_key)}`,
				offsetIntoRecordingMs:
					scheduled.subtitle_anchor_epoch_ms + (scheduled.subtitle_offset_ms ?? 0) - startedMs
			};
		}
	}

	// ── Share preview (og:*/twitter:*) ──────────────────────────────────
	// Rendered by the root layout as the single canonical tag set. Use the
	// recording's real title/description/thumbnail so a shared replay link
	// previews as that broadcast, not as the generic site card.
	const dateFr = formatDateFr(recording.started_at);
	const rawThumb = recording.thumbnail_url;
	const absoluteThumb = rawThumb
		? rawThumb.startsWith('http')
			? rawThumb
			: new URL(rawThumb, url.origin).toString()
		: null;
	// Same trick as /live: route the (often ~700 KB) S3 PNG through Vercel
	// Image Optimization — WhatsApp silently drops og:images over ~300 KB.
	// w=1080 is in svelte.config's images.sizes; crawler Accept headers get
	// the original format back, so previews stay compatible.
	const ogImage = absoluteThumb
		? `${url.origin}/_vercel/image?url=${encodeURIComponent(absoluteThumb)}&w=1080&q=50`
		: undefined;
	const meta = pageMeta(`/live/rediffusions/${recording.id}`, {
		title: shareTitle(recording.title || 'Rediffusion'),
		description:
			shareDescription(recording.description ?? '') ||
			(dateFr
				? `Réécoutez le direct audio du ${dateFr} sur Missionnaire Network.`
				: 'Réécoutez ce direct audio sur Missionnaire Network.'),
		...(ogImage ? { image: ogImage } : {}),
		type: 'article',
		// Search Console reported these archive pages under "Crawled —
		// currently not indexed" — keep them noindex (the /live/rediffusions
		// index is the indexable entry point). OG scrapers ignore robots meta,
		// so share previews still work.
		noindex: true
	});

	return { recording, backHref, transcript, subtitles, meta };
};
