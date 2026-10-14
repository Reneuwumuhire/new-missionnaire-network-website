// Audit recent scheduled-live SRTs against their linked PDF text.
// Run from repository root:
// node --env-file=admin/.env.local --experimental-strip-types admin/scripts/audit-subtitle-corrections.mjs 10
// Add --write-candidates to record single-word PDF proposals for later review.
import { MongoClient, ObjectId } from 'mongodb';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { writeFile } from 'node:fs/promises';
import { correctSubtitleSrt } from '../src/lib/utils/subtitleCorrections.ts';

const limit = Math.max(1, Math.min(50, Number(process.argv[2]) || 10));
const offset = Math.max(0, Number(process.argv[3]) || 0);
const writeCandidates = process.argv.includes('--write-candidates');
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
const s3 = new S3Client({
	region: process.env.AWS_S3_REGION,
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
	}
});

async function objectBytes(key) {
	const object = await s3.send(
		new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET, Key: key }),
		{ abortSignal: AbortSignal.timeout(45_000) }
	);
	if (!object.Body) throw new Error(`Empty S3 object: ${key}`);
	return await object.Body.transformToByteArray();
}

async function pdfText(key) {
	const task = getDocument({
		data: await objectBytes(key),
		useSystemFonts: true,
		disableFontFace: true
	});
	const document = await task.promise;
	try {
		const pages = [];
		for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
			const page = await document.getPage(pageNumber);
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
		return pages.join(' ');
	} finally {
		await task.destroy();
	}
}

const words = (value) => value.match(/[\p{L}\p{N}]+/gu) || [];

try {
	await client.connect();
	const db = client.db('youtube_data');
	const scheduled = await db
		.collection('scheduled_lives')
		.find({ status: 'ended', subtitle_srt_s3_key: { $type: 'string' } })
		.sort({ scheduled_at: -1 })
		.skip(offset)
		.limit(limit)
		.toArray();
	const rows = [];
	const recurring = new Map();
	const wordCandidates = new Map();
	for (const live of scheduled) {
		const date = live.scheduled_at.toISOString().slice(0, 10);
		console.error(`${date}: loading linked files`);
		try {
			let recording =
				live.recording_id && ObjectId.isValid(String(live.recording_id))
					? await db
							.collection('recordings')
							.findOne({ _id: new ObjectId(String(live.recording_id)) })
					: null;
			if (!recording) recording = await db.collection('recordings').findOne({ title: live.title });
			const pdf =
				recording?.transcript_pdf_id && ObjectId.isValid(recording.transcript_pdf_id)
					? await db.collection('pdfs').findOne({ _id: new ObjectId(recording.transcript_pdf_id) })
					: null;
			const raw = new TextDecoder().decode(await objectBytes(live.subtitle_srt_s3_key));
			const result = correctSubtitleSrt(raw, pdf?.s3Key ? await pdfText(pdf.s3Key) : undefined);
			const before = words(raw),
				after = words(result.text);
			for (const change of result.changes) {
				const pair = `${change.from} → ${change.to}`;
				recurring.set(pair, (recurring.get(pair) || 0) + 1);
				if (
					change.source === 'pdf' &&
					/^[\p{L}]+$/u.test(change.from) &&
					/^[\p{L}]+$/u.test(change.to)
				) {
					const candidate = wordCandidates.get(pair) || {
						from: change.from,
						to: change.to,
						count: 0,
						broadcasts: new Set()
					};
					candidate.count++;
					candidate.broadcasts.add(date);
					wordCandidates.set(pair, candidate);
				}
			}
			rows.push({
				date,
				title: live.title,
				pdf: Boolean(pdf?.s3Key),
				cues: (raw.match(/^\d+\s*$/gm) || []).length,
				edits: result.changes.length,
				pdfEdits: result.changes.filter((change) => change.source === 'pdf').length,
				wordsBefore: before.length,
				wordsAfter: after.length,
				pdfComparedWords: result.comparedWords,
				pdfDifferentWords: result.differingWords,
				samples: result.changes.filter((change) => change.source === 'pdf').slice(0, 30)
			});
			console.error(`${date}: ${result.changes.length} proposed edits`);
		} catch (error) {
			rows.push({ date, title: live.title, error: error.message });
			console.error(`${date}: ${error.message}`);
		}
	}
	const candidates = [...wordCandidates.values()]
		.map(({ from, to, count, broadcasts }) => ({
			from,
			to,
			count,
			broadcasts: [...broadcasts].sort()
		}))
		.sort((a, b) => b.broadcasts.length - a.broadcasts.length || b.count - a.count);
	if (writeCandidates) {
		await writeFile(
			new URL('../../docs/subtitle-correction-candidates.json', import.meta.url),
			JSON.stringify(
				{
					generatedAt: new Date().toISOString(),
					audited: rows.length,
					pairedWithPdf: rows.filter((row) => row.pdf).length,
					candidates
				},
				null,
				2
			) + '\n'
		);
	}
	console.log(
		JSON.stringify(
			{
				audited: rows.length,
				pairedWithPdf: rows.filter((row) => row.pdf).length,
				totalEdits: rows.reduce((sum, row) => sum + (row.edits || 0), 0),
				pdfEdits: rows.reduce((sum, row) => sum + (row.pdfEdits || 0), 0),
				pdfComparedWords: rows.reduce((sum, row) => sum + (row.pdfComparedWords || 0), 0),
				pdfDifferentWords: rows.reduce((sum, row) => sum + (row.pdfDifferentWords || 0), 0),
				candidateRules: candidates.filter((rule) => rule.broadcasts.length >= 2).slice(0, 30),
				topCorrections: [...recurring].sort((a, b) => b[1] - a[1]).slice(0, 20),
				rows
			},
			null,
			2
		)
	);
} finally {
	await client.close();
}
