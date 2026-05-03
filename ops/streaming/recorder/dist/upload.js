import { createReadStream, promises as fs } from 'node:fs';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ENV } from './env.js';
const s3 = new S3Client({
    region: ENV.AWS_S3_REGION,
    credentials: {
        accessKeyId: ENV.AWS_ACCESS_KEY_ID,
        secretAccessKey: ENV.AWS_SECRET_ACCESS_KEY
    }
});
export function buildS3Key(id) {
    return `recordings/${id}.mp3`;
}
export function buildS3Url(key) {
    return `https://${ENV.AWS_S3_BUCKET}.s3.${ENV.AWS_S3_REGION}.amazonaws.com/${key}`;
}
export function formatBerlinDate(d) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(d);
    const y = parts.find((p) => p.type === 'year').value;
    const m = parts.find((p) => p.type === 'month').value;
    const day = parts.find((p) => p.type === 'day').value;
    return `${y}-${m}-${day}`;
}
function sanitizeFilenameBase(input) {
    return input
        .replace(/[\\/:*?"<>|\x00-\x1F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
export function buildDownloadFilename(startedAt, title) {
    const safe = title ? sanitizeFilenameBase(title) : '';
    if (safe)
        return `${safe}.mp3`;
    return `${formatBerlinDate(startedAt)} Live recording.mp3`;
}
/** Build an RFC 5987-compliant Content-Disposition header that survives both
 *  ASCII-only clients (via `filename=`) and UTF-8 clients (via `filename*=`). */
function buildContentDisposition(filename) {
    // eslint-disable-next-line no-control-regex
    const asciiFallback = filename.replace(/[^\x20-\x7E]/g, '').trim() || 'recording.mp3';
    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
export async function uploadRecording(params) {
    const stat = await fs.stat(params.filePath);
    const key = buildS3Key(params.id);
    const filename = buildDownloadFilename(params.startedAt, params.title);
    await s3.send(new PutObjectCommand({
        Bucket: ENV.AWS_S3_BUCKET,
        Key: key,
        Body: createReadStream(params.filePath),
        ContentType: 'audio/mpeg',
        ContentLength: stat.size,
        ContentDisposition: buildContentDisposition(filename),
        CacheControl: 'public, max-age=31536000, immutable'
    }));
    return { s3Key: key, s3Url: buildS3Url(key), sizeBytes: stat.size };
}
