import { ObjectId, type Document } from 'mongodb';
import { getDb } from '../../db/mongo';
import { recorderIngest, type MissionnaireIngest } from './recorder-client';

const REFRESH_BEFORE_MS = 30 * 60 * 1000;

type Authorization = Document & {
	code?: unknown;
	user_email?: unknown;
	user_name?: unknown;
	approved_at?: unknown;
	expires_at?: unknown;
	last_used_at?: unknown;
	missionnaire_ingest?: unknown;
};

type IngestRevocation = {
	_id: string;
	revoked_at: Date;
	expires_at: Date;
};

export function cachedIngest(value: unknown, now = Date.now()): MissionnaireIngest | null {
	if (!value || typeof value !== 'object') return null;
	const item = value as Record<string, unknown>;
	if (
		typeof item.url !== 'string' ||
		!/^rtmps?:\/\//.test(item.url) ||
		typeof item.key !== 'string' ||
		!item.key ||
		typeof item.expiresAt !== 'string' ||
		Date.parse(item.expiresAt) - now <= REFRESH_BEFORE_MS
	)
		return null;
	return { url: item.url, key: item.key, expiresAt: item.expiresAt };
}

function ingestPath(ingest: MissionnaireIngest): string | null {
	const id = ingest.key.split('?', 1)[0];
	if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
	try {
		const base = new URL(ingest.url).pathname.replace(/^\/+|\/+$/g, '');
		return base ? `${base}/${id}` : id;
	} catch {
		return null;
	}
}

async function revokeIngest(ingest: MissionnaireIngest | null) {
	if (!ingest || Date.parse(ingest.expiresAt) <= Date.now()) return;
	const path = ingestPath(ingest);
	if (!path) return;
	const db = await getDb();
	const collection = db.collection<IngestRevocation>('studio_ingest_revocations');
	await collection.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
	await collection.updateOne(
		{ _id: path },
		{
			$set: { revoked_at: new Date(), expires_at: new Date(ingest.expiresAt) }
		},
		{ upsert: true }
	);
}

export async function missionnaireIngestForAuthorization(
	code: string,
	authorization?: Authorization
): Promise<MissionnaireIngest> {
	const db = await getDb();
	const collection = db.collection<Authorization>('studio_authorizations');
	const doc = authorization ?? (await collection.findOne({ code }));
	if (!doc) throw new Error('Studio authorization not found');
	const existing = cachedIngest(doc.missionnaire_ingest);
	if (existing) {
		await collection.updateOne({ code }, { $set: { last_used_at: new Date() } });
		return existing;
	}
	const ingest = await recorderIngest();
	const refreshFilter =
		doc.missionnaire_ingest === undefined
			? { code, missionnaire_ingest: { $exists: false } }
			: { code, missionnaire_ingest: doc.missionnaire_ingest };
	const updated = await collection.updateOne(refreshFilter, {
		$set: { missionnaire_ingest: ingest, last_used_at: new Date() }
	});
	if (updated.modifiedCount === 1) return ingest;

	// Another status request refreshed this pairing first. Revoke this unused
	// credential so only the value stored on the authorization stays valid.
	await revokeIngest(ingest);
	const winner = await collection.findOne({ code });
	const current = cachedIngest(winner?.missionnaire_ingest);
	if (!current) throw new Error('Studio authorization changed while refreshing ingest');
	return current;
}

export async function revokeMissionnaireIngest(code: string) {
	const db = await getDb();
	const collection = db.collection<Authorization>('studio_authorizations');
	const doc = await collection.findOne({ code });
	await revokeIngest(cachedIngest(doc?.missionnaire_ingest, 0));
	await collection.deleteOne({ code });
}

export async function revokeStudioAuthorizationsForUser(email: string) {
	const db = await getDb();
	const collection = db.collection<Authorization>('studio_authorizations');
	const docs = await collection.find({ user_email: email }).toArray();
	await Promise.all(docs.map((doc) => revokeIngest(cachedIngest(doc.missionnaire_ingest, 0))));
	await collection.deleteMany({ user_email: email });
}

export async function listStudioAuthorizations(email: string) {
	const docs = await (
		await getDb()
	)
		.collection<Authorization>('studio_authorizations')
		.find({ user_email: email, expires_at: { $gt: new Date() } })
		.sort({ approved_at: -1 })
		.toArray();
	return docs.map((doc) => ({
		id: String(doc._id),
		approvedAt: doc.approved_at instanceof Date ? doc.approved_at.toISOString() : null,
		lastUsedAt: doc.last_used_at instanceof Date ? doc.last_used_at.toISOString() : null,
		expiresAt: doc.expires_at instanceof Date ? doc.expires_at.toISOString() : null
	}));
}

export async function revokeStudioAuthorizationById(id: string, email: string): Promise<boolean> {
	if (!ObjectId.isValid(id)) return false;
	const db = await getDb();
	const collection = db.collection<Authorization>('studio_authorizations');
	const doc = await collection.findOne({ _id: new ObjectId(id), user_email: email });
	if (!doc) return false;
	await revokeIngest(cachedIngest(doc.missionnaire_ingest, 0));
	await collection.deleteOne({ _id: doc._id });
	return true;
}
