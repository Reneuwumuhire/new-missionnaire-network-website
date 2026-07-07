import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { ObjectId } from 'mongodb';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { ENV } from './env.js';
import { currentStatus, isRecording, retryUpload, startRecording, stopRecording } from './ffmpeg.js';
import { isRecovering, pendingOrphans, recoverOrphans } from './recover.js';
import { findRecording } from './mongo.js';
import { ensureRecordingsDir } from './sidecar.js';

const app = Fastify({ logger: true });

app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
	if (req.url === '/health' || req.url.startsWith('/hls/')) return;
	const auth = req.headers.authorization;
	if (!auth || auth !== `Bearer ${ENV.RECORDER_TOKEN}`) {
		reply.code(401).send({ error: 'unauthorized' });
	}
});

app.get('/health', async () => ({ ok: true }));

// ── Live DVR delivery (public, read-only) ─────────────────────────
// Serves the rolling HLS window the entrypoint's packager writes to HLS_DIR.
// The playlist must never be cached (it changes every segment); segments are
// content-immutable so they can be cached hard. CORS is open — hls.js in the
// public player fetches these cross-origin.
const HLS_CONTENT_TYPES: Record<string, string> = {
	'.m3u8': 'application/vnd.apple.mpegurl',
	'.ts': 'video/mp2t'
};

app.get<{ Params: { file: string } }>('/hls/:file', async (req, reply) => {
	const { file } = req.params;
	// Strict allowlist — this handler must never traverse outside HLS_DIR.
	if (!/^[A-Za-z0-9][A-Za-z0-9_-]*\.(m3u8|ts)$/.test(file)) {
		return reply.code(404).send({ error: 'not_found' });
	}
	const ext = path.extname(file);
	const fullPath = path.join(ENV.HLS_DIR, file);
	try {
		const info = await stat(fullPath);
		if (!info.isFile()) return reply.code(404).send({ error: 'not_found' });
	} catch {
		return reply.code(404).send({ error: 'not_found' });
	}
	reply.header('Access-Control-Allow-Origin', '*');
	reply.header(
		'Cache-Control',
		ext === '.m3u8' ? 'no-store, no-cache' : 'public, max-age=31536000, immutable'
	);
	reply.type(HLS_CONTENT_TYPES[ext]);
	if (ext === '.m3u8') {
		// The playlist is refetched every segment interval and grows with the
		// DVR window (hundreds of KB at a full window) — on slow links the
		// uncompressed playlist alone can outweigh the audio. Text compresses
		// ~20×, so gzip whenever the client accepts it.
		const body = await readFile(fullPath);
		reply.header('Vary', 'Accept-Encoding');
		if (/\bgzip\b/i.test(String(req.headers['accept-encoding'] ?? ''))) {
			reply.header('Content-Encoding', 'gzip');
			return reply.send(gzipSync(body));
		}
		return reply.send(body);
	}
	return reply.send(createReadStream(fullPath));
});

app.get('/status', async () => ({
	...currentStatus(),
	pendingOrphans: pendingOrphans(),
	recovering: isRecovering()
}));

interface StartBody {
	createdBy?: string;
	createdByName?: string | null;
}

app.post('/start', async (req, reply) => {
	if (isRecovering() || pendingOrphans() > 0) {
		return reply.code(503).send({ error: 'orphan_recovery_in_progress' });
	}
	if (isRecording()) {
		return reply.code(409).send({ error: 'already_recording' });
	}
	const body = (req.body ?? {}) as StartBody;
	const createdBy = body.createdBy?.toString().trim() || 'unknown';
	const createdByName = body.createdByName?.toString().trim() || null;
	try {
		const result = await startRecording({ createdBy, createdByName });
		return reply.send(result);
	} catch (err) {
		req.log.error(err, 'start failed');
		return reply.code(500).send({ error: 'start_failed', message: (err as Error).message });
	}
});

app.post('/stop', async (req, reply) => {
	if (!isRecording()) return reply.code(409).send({ error: 'not_recording' });
	try {
		const result = await stopRecording();
		return reply.send(result);
	} catch (err) {
		req.log.error(err, 'stop failed');
		return reply.code(500).send({ error: 'stop_failed', message: (err as Error).message });
	}
});

app.post<{ Params: { id: string } }>('/retry/:id', async (req, reply) => {
	const { id } = req.params;
	if (!ObjectId.isValid(id)) return reply.code(400).send({ error: 'invalid_id' });
	const doc = await findRecording(new ObjectId(id));
	if (!doc) return reply.code(404).send({ error: 'not_found' });
	if (doc.status === 'ready') return reply.code(409).send({ error: 'already_ready' });
	try {
		await retryUpload({ id, startedAt: doc.started_at });
		return reply.send({ ok: true });
	} catch (err) {
		req.log.error(err, 'retry failed');
		return reply.code(500).send({ error: 'retry_failed', message: (err as Error).message });
	}
});

async function main() {
	await ensureRecordingsDir();
	void recoverOrphans().catch((err) => app.log.error(err, 'orphan recovery failed'));
	await app.listen({ host: '0.0.0.0', port: ENV.PORT });
	app.log.info(`Recorder listening on :${ENV.PORT}`);
}

main().catch((err) => {
	console.error('[recorder] fatal', err);
	process.exit(1);
});
