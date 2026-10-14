// One-time, resumable correction of ended scheduled-live SRTs.
// Dry run: node --env-file=admin/.env.local --experimental-strip-types admin/scripts/apply-past-subtitle-corrections.mjs
// Apply:   node --env-file=admin/.env.local --experimental-strip-types admin/scripts/apply-past-subtitle-corrections.mjs --apply
// Each changed SRT gets a new S3 object. The original object remains available.
import { randomUUID } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { MongoClient, ObjectId } from 'mongodb';
import {
	S3Client,
	GetObjectCommand,
	PutObjectCommand,
	DeleteObjectCommand
} from '@aws-sdk/client-s3';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { correctSubtitleSrt } from '../src/lib/utils/subtitleCorrections.ts';
import { parseSrt } from '../src/lib/utils/srt.ts';

const apply = process.argv.includes('--apply');
const limitArgument = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = limitArgument ? Number(limitArgument.slice('--limit='.length)) : 0;
if (limitArgument && (!Number.isSafeInteger(limit) || limit < 1))
	throw new Error('Invalid --limit');
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
const s3 = new S3Client({
	region: process.env.AWS_S3_REGION,
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
	},
	requestChecksumCalculation: 'WHEN_REQUIRED'
});
const bucket = process.env.AWS_S3_BUCKET;
const pdfCache = new Map();

async function objectBytes(key, maxBytes) {
	const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
		abortSignal: AbortSignal.timeout(45_000)
	});
	if (!object.Body) throw new Error(`Empty S3 object: ${key}`);
	const bytes = await object.Body.transformToByteArray();
	if (bytes.byteLength > maxBytes) throw new Error(`Object too large: ${key}`);
	return bytes;
}

async function pdfText(key) {
	if (pdfCache.has(key)) return pdfCache.get(key);
	const task = getDocument({
		data: await objectBytes(key, 20 * 1024 * 1024),
		useSystemFonts: true,
		disableFontFace: true
	});
	const pdf = await task.promise;
	try {
		const pages = [];
		for (let number = 1; number <= pdf.numPages; number++) {
			const page = await pdf.getPage(number);
			const content = await page.getTextContent();
			pages.push(
				content.items
					.filter((item) => 'str' in item)
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
		const text = pages.join(' ');
		pdfCache.set(key, text);
		return text;
	} finally {
		await task.destroy();
	}
}

async function linkedPdf(db, live) {
	let recording =
		live.recording_id && ObjectId.isValid(String(live.recording_id))
			? await db.collection('recordings').findOne({ _id: new ObjectId(String(live.recording_id)) })
			: null;
	if (!recording) recording = await db.collection('recordings').findOne({ title: live.title });
	if (!recording || recording.transcript_pdf_id === 'none') return null;
	let pdf =
		recording.transcript_pdf_id && ObjectId.isValid(recording.transcript_pdf_id)
			? await db.collection('pdfs').findOne({ _id: new ObjectId(recording.transcript_pdf_id) })
			: null;
	if (!pdf && recording.source_video_id) {
		const video = await db
			.collection('videos')
			.findOne({ id: recording.source_video_id }, { projection: { _id: 1 } });
		if (video) {
			pdf = await db
				.collection('pdfs')
				.findOne(
					{ $or: [{ videoId: video._id }, { videoId: String(video._id) }] },
					{ sort: { publishedOn: -1, uploadDate: -1, _id: -1 } }
				);
		}
	}
	return typeof pdf?.s3Key === 'string' && pdf.s3Key.startsWith('pdf/')
		? { id: String(pdf._id), key: pdf.s3Key }
		: null;
}

function assertCueTimes(before, after) {
	const original = parseSrt(before);
	const corrected = parseSrt(after);
	if (
		original.length === 0 ||
		corrected.length !== original.length ||
		corrected.some(
			(cue, index) => cue.startMs !== original[index].startMs || cue.endMs !== original[index].endMs
		)
	) {
		throw new Error('Subtitle cue timing changed');
	}
	return original.length;
}

function correctToStable(raw, reference) {
	let text = raw;
	const changes = [];
	const seen = new Set([raw]);
	for (let pass = 1; pass <= 6; pass++) {
		const result = correctSubtitleSrt(text, reference);
		assertCueTimes(text, result.text);
		if (result.changes.length === 0) return { text, changes, passes: pass - 1 };
		if (seen.has(result.text)) throw new Error('Correction cycle detected');
		seen.add(result.text);
		text = result.text;
		changes.push(...result.changes);
	}
	throw new Error('Corrections did not stabilize within six passes');
}

try {
	await client.connect();
	const db = client.db('youtube_data');
	const query = { status: 'ended', subtitle_srt_s3_key: { $regex: '^subtitles/' } };
	let cursor = db.collection('scheduled_lives').find(query).sort({ scheduled_at: -1 });
	if (limit) cursor = cursor.limit(limit);
	const lives = await cursor.toArray();
	const rows = [];
	for (const live of lives) {
		const id = String(live._id);
		const date = new Date(live.scheduled_at).toISOString().slice(0, 10);
		const row = { id, date, title: live.title, status: 'pending' };
		rows.push(row);
		try {
			const oldKey = live.subtitle_srt_s3_key;
			const raw = new TextDecoder().decode(await objectBytes(oldKey, 2 * 1024 * 1024));
			const pdf = await linkedPdf(db, live);
			const corrected = correctToStable(raw, pdf ? await pdfText(pdf.key) : undefined);
			row.cues = assertCueTimes(raw, corrected.text);
			row.passes = corrected.passes;
			row.pdf = Boolean(pdf);
			row.pdfId = pdf?.id ?? null;
			row.edits = corrected.changes.length;
			row.pdfEdits = corrected.changes.filter((change) => change.source === 'pdf').length;
			row.samples = corrected.changes.slice(0, 8);
			if (corrected.changes.length === 0) {
				row.status = 'unchanged';
			} else if (!apply) {
				row.status = 'preview';
			} else {
				const newKey = `subtitles/${Date.now()}-${randomUUID()}.srt`;
				const newBody = Buffer.from(corrected.text, 'utf8');
				if (newBody.byteLength > 2 * 1024 * 1024) throw new Error('Corrected SRT too large');
				await s3.send(
					new PutObjectCommand({
						Bucket: bucket,
						Key: newKey,
						Body: newBody,
						ContentType: 'text/plain; charset=utf-8'
					})
				);
				const url = `https://${bucket}.s3.${process.env.AWS_S3_REGION}.amazonaws.com/${newKey}`;
				const filename = (live.subtitle_filename || 'transcription.srt').replace(
					/(?:\.corrig[eé])?\.srt$/i,
					'.corrigé.srt'
				);
				let updated;
				try {
					updated = await db.collection('scheduled_lives').updateOne(
						{ _id: live._id, status: 'ended', subtitle_srt_s3_key: oldKey },
						{
							$set: {
								subtitle_srt_s3_key: newKey,
								subtitle_srt_url: url,
								subtitle_filename: filename,
								subtitle_auto_corrected_at: new Date(),
								subtitle_auto_correct_pdf_id: pdf?.id ?? null,
								updated_at: new Date().toISOString()
							}
						}
					);
				} catch (error) {
					await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: newKey }));
					throw error;
				}
				if (updated.modifiedCount !== 1) {
					await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: newKey }));
					throw new Error('Scheduled live changed during correction');
				}
				row.status = 'applied';
				row.oldKey = oldKey;
				row.newKey = newKey;
				const audit = {
					user_id: 'codex-bulk-subtitle-correction',
					user_email: 'codex-bulk-subtitle-correction',
					action: 'bulk_update',
					target_collection: 'scheduled_lives',
					target_id: id,
					target_ids: null,
					changes: {
						subtitle_auto_correct: {
							old: oldKey,
							new: { key: newKey, changes: row.edits, pdfId: pdf?.id ?? null }
						}
					},
					ip_address: null,
					timestamp: new Date()
				};
				try {
					await db.collection('audit_log').insertOne(audit);
				} catch (error) {
					row.warning = `Audit log insert failed: ${error instanceof Error ? error.message : String(error)}`;
				}
				try {
					await appendFile(
						'/tmp/subtitle-bulk-applied-2026-10-14.ndjson',
						JSON.stringify({ id, date, oldKey, newKey, pdfId: pdf?.id ?? null, edits: row.edits }) +
							'\n'
					);
				} catch (error) {
					row.warning =
						`${row.warning ?? ''} Local log append failed: ${error instanceof Error ? error.message : String(error)}`.trim();
				}
			}
			console.error(`${date}: ${row.status} (${row.edits} edits, ${row.pdfEdits} PDF)`);
		} catch (error) {
			row.status = 'error';
			row.error = error instanceof Error ? error.message : String(error);
			console.error(`${date}: ${row.error}`);
		}
	}
	console.log(
		JSON.stringify(
			{
				mode: apply ? 'apply' : 'preview',
				processed: rows.length,
				applied: rows.filter((row) => row.status === 'applied').length,
				withChanges: rows.filter((row) => row.edits > 0).length,
				withoutPdf: rows.filter((row) => row.pdf === false).length,
				edits: rows.reduce((sum, row) => sum + (row.edits || 0), 0),
				pdfEdits: rows.reduce((sum, row) => sum + (row.pdfEdits || 0), 0),
				rows
			},
			null,
			2
		)
	);
	if (rows.some((row) => row.status === 'error' || row.warning)) process.exitCode = 1;
} finally {
	await client.close();
}
