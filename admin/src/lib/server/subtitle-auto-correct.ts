import { ObjectId } from 'mongodb';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { getDb } from '../../db/mongo';
import type { ScheduledLive } from '../../db/collections';
import { getTranscriptPdfForRecording } from './video-sync';
import { getObjectBytes } from './s3';
import { correctSubtitleSrt } from '$lib/utils/subtitleCorrections';
import { parseSrt } from '$lib/utils/srt';

async function pdfForLive(live: ScheduledLive): Promise<{ key: string; id: string } | null> {
	const db = await getDb();
	let recording =
		live.recording_id && ObjectId.isValid(live.recording_id)
			? await db.collection('recordings').findOne({ _id: new ObjectId(live.recording_id) })
			: null;
	// Older entries occasionally lost the link. An exact title is safe; a
	// date-based match can attach another sermon from the same day.
	if (!recording) recording = await db.collection('recordings').findOne({ title: live.title });
	if (!recording || recording.transcript_pdf_id === 'none') return null;
	const pdf = await getTranscriptPdfForRecording({
		transcript_pdf_id: recording.transcript_pdf_id,
		source_video_id: recording.source_video_id,
		started_at: recording.started_at
	});
	return pdf?.s3Key?.startsWith('pdf/') ? { key: pdf.s3Key, id: pdf._id } : null;
}

async function extractPdfText(key: string): Promise<string> {
	const { bytes } = await getObjectBytes(key);
	if (bytes.byteLength > 20 * 1024 * 1024)
		throw new Error('PDF trop volumineux pour la correction');
	const task = getDocument({
		data: new Uint8Array(bytes),
		useSystemFonts: true,
		disableFontFace: true
	});
	const pdf = await task.promise;
	try {
		const pages: string[] = [];
		for (let number = 1; number <= pdf.numPages; number++) {
			const page = await pdf.getPage(number);
			const content = await page.getTextContent();
			pages.push(
				content.items
					.filter((item): item is typeof item & { str: string } => 'str' in item)
					.map((item) => item.str)
					.filter(
						(line) =>
							line &&
							line !== 'FTARD' &&
							!(
								line.length > 90 &&
								/Pr[eé]dication de Fr[eè]re.*(?:Retransmise|Krefeld)/i.test(line)
							)
					)
					.join(' ')
			);
		}
		return pages.join(' ');
	} finally {
		await task.destroy();
	}
}

export async function prepareSubtitleCorrection(live: ScheduledLive) {
	if (!live.subtitle_srt_s3_key?.startsWith('subtitles/'))
		throw new Error('Aucun fichier .srt attaché');
	const { bytes } = await getObjectBytes(live.subtitle_srt_s3_key);
	if (bytes.byteLength > 2 * 1024 * 1024) throw new Error('Fichier .srt trop volumineux');
	const raw = new TextDecoder('utf-8').decode(bytes);
	const originalCues = parseSrt(raw);
	if (!originalCues.length) throw new Error('Fichier .srt vide ou illisible');
	const pdf = await pdfForLive(live);
	const reference = pdf ? await extractPdfText(pdf.key) : undefined;
	const result = correctSubtitleSrt(raw, reference);
	const correctedCues = parseSrt(result.text);
	if (
		correctedCues.length !== originalCues.length ||
		correctedCues.some(
			(cue, i) => cue.startMs !== originalCues[i].startMs || cue.endMs !== originalCues[i].endMs
		)
	) {
		throw new Error('La correction a modifié les repères temporels');
	}
	return {
		...result,
		pdfId: pdf?.id ?? null,
		cueCount: originalCues.length,
		originalKey: live.subtitle_srt_s3_key
	};
}
