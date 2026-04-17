import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { ObjectId } from 'mongodb';
import { ENV } from './env.js';
import { currentStatus, isRecording, retryUpload, startRecording, stopRecording } from './ffmpeg.js';
import { isRecovering, pendingOrphans, recoverOrphans } from './recover.js';
import { findRecording } from './mongo.js';
import { ensureRecordingsDir } from './sidecar.js';

const app = Fastify({ logger: true });

app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
	if (req.url === '/health') return;
	const auth = req.headers.authorization;
	if (!auth || auth !== `Bearer ${ENV.RECORDER_TOKEN}`) {
		reply.code(401).send({ error: 'unauthorized' });
	}
});

app.get('/health', async () => ({ ok: true }));

app.get('/status', async () => ({
	...currentStatus(),
	pendingOrphans: pendingOrphans(),
	recovering: isRecovering()
}));

interface StartBody {
	createdBy?: string;
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
	try {
		const result = await startRecording({ createdBy });
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
