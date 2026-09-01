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
	last_seen_at?: unknown;
	revoked_at?: unknown;
	device?: unknown;
	missionnaire_ingest?: unknown;
};

export type StudioDeviceMetadata = {
	os: string | null;
	architecture: string | null;
	username: string | null;
	deviceName: string | null;
	appVersion: string | null;
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

function safeLabel(value: unknown, limit: number): string | null {
	if (typeof value !== 'string') return null;
	const label = value
		.replace(/[\u0000-\u001f\u007f]/g, '')
		.trim()
		.slice(0, limit);
	return label || null;
}

export function studioDeviceMetadata(value: unknown): StudioDeviceMetadata | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const device = value as Record<string, unknown>;
	const result = {
		os: safeLabel(device.os, 80),
		architecture: safeLabel(device.architecture, 32),
		username: safeLabel(device.username, 80),
		deviceName: safeLabel(device.deviceName, 80),
		appVersion: safeLabel(device.appVersion, 32)
	};
	return Object.values(result).some(Boolean) ? result : null;
}

export async function updateStudioAuthorizationActivity(code: string, value: unknown) {
	const device = studioDeviceMetadata(value);
	const update: Record<string, unknown> = { last_seen_at: new Date() };
	if (device) update.device = device;
	await (await getDb())
		.collection<Authorization>('studio_authorizations')
		.updateOne(
			{ code, revoked_at: { $exists: false }, expires_at: { $gt: new Date() } },
			{ $set: update }
		);
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
	code: string
): Promise<MissionnaireIngest> {
	const db = await getDb();
	const collection = db.collection<Authorization>('studio_authorizations');
	// Always load the current document. A status request started just before
	// re-approval must never return the credential that re-approval revoked.
	const doc = await collection.findOne({
		code,
		revoked_at: { $exists: false },
		expires_at: { $gt: new Date() }
	});
	if (!doc) throw new Error('Studio authorization not found');
	const existing = cachedIngest(doc.missionnaire_ingest);
	if (existing) {
		const active = await collection.updateOne(
			{
				code,
				revoked_at: { $exists: false },
				expires_at: { $gt: new Date() },
				missionnaire_ingest: doc.missionnaire_ingest
			},
			{ $set: { last_used_at: new Date() } }
		);
		if (active.matchedCount === 1) return existing;
		throw new Error('Studio authorization is no longer active');
	}
	const ingest = await recorderIngest();
	const refreshFilter =
		doc.missionnaire_ingest === undefined
			? {
					code,
					revoked_at: { $exists: false },
					expires_at: { $gt: new Date() },
					missionnaire_ingest: { $exists: false }
				}
			: {
					code,
					revoked_at: { $exists: false },
					expires_at: { $gt: new Date() },
					missionnaire_ingest: doc.missionnaire_ingest
				};
	const updated = await collection.updateOne(refreshFilter, {
		$set: { missionnaire_ingest: ingest, last_used_at: new Date() }
	});
	if (updated.modifiedCount === 1) return ingest;

	// Another status request refreshed this pairing first. Revoke this unused
	// credential so only the value stored on the authorization stays valid.
	await revokeIngest(ingest);
	const winner = await collection.findOne({
		code,
		revoked_at: { $exists: false },
		expires_at: { $gt: new Date() }
	});
	const current = cachedIngest(winner?.missionnaire_ingest);
	if (!current) throw new Error('Studio authorization changed while refreshing ingest');
	return current;
}

export async function revokeMissionnaireIngest(code: string) {
	const db = await getDb();
	const collection = db.collection<Authorization>('studio_authorizations');
	const doc = await collection.findOneAndUpdate(
		{ code },
		{ $set: { revoked_at: new Date() }, $unset: { missionnaire_ingest: '' } }
	);
	await revokeIngest(cachedIngest(doc?.missionnaire_ingest, 0));
}

export async function revokeStudioAuthorizationsForUser(email: string) {
	const db = await getDb();
	const collection = db.collection<Authorization>('studio_authorizations');
	const docs = await collection.find({ user_email: email }).toArray();
	await Promise.all(docs.map((doc) => revokeIngest(cachedIngest(doc.missionnaire_ingest, 0))));
	await collection.updateMany(
		{ user_email: email, revoked_at: { $exists: false } },
		{ $set: { revoked_at: new Date() }, $unset: { missionnaire_ingest: '' } }
	);
}

export async function listStudioAuthorizations(email: string) {
	const docs = await (await getDb())
		.collection<Authorization>('studio_authorizations')
		.find({ user_email: email })
		.sort({ approved_at: -1 })
		.limit(50)
		.toArray();
	const now = Date.now();
	return docs.map((doc) => ({
		id: String(doc._id),
		connected:
			!(doc.revoked_at instanceof Date) &&
			doc.expires_at instanceof Date &&
			doc.expires_at.getTime() > now,
		online:
			!(doc.revoked_at instanceof Date) &&
			doc.expires_at instanceof Date &&
			doc.expires_at.getTime() > now &&
			doc.last_seen_at instanceof Date &&
			now - doc.last_seen_at.getTime() < 2 * 60 * 1000,
		approvedAt: doc.approved_at instanceof Date ? doc.approved_at.toISOString() : null,
		lastUsedAt: doc.last_used_at instanceof Date ? doc.last_used_at.toISOString() : null,
		lastSeenAt: doc.last_seen_at instanceof Date ? doc.last_seen_at.toISOString() : null,
		expiresAt: doc.expires_at instanceof Date ? doc.expires_at.toISOString() : null,
		device: studioDeviceMetadata(doc.device)
	}));
}

export async function revokeStudioAuthorizationById(id: string, email: string): Promise<boolean> {
	if (!ObjectId.isValid(id)) return false;
	const db = await getDb();
	const collection = db.collection<Authorization>('studio_authorizations');
	const doc = await collection.findOneAndUpdate(
		{ _id: new ObjectId(id), user_email: email },
		{ $set: { revoked_at: new Date() }, $unset: { missionnaire_ingest: '' } }
	);
	if (!doc) return false;
	await revokeIngest(cachedIngest(doc.missionnaire_ingest, 0));
	return true;
}

export async function deleteDisconnectedStudioAuthorizationById(
	id: string,
	email: string
): Promise<boolean> {
	if (!ObjectId.isValid(id)) return false;
	const collection = (await getDb()).collection<Authorization>('studio_authorizations');
	const doc = await collection.findOne({ _id: new ObjectId(id), user_email: email });
	if (!doc) return false;
	const active =
		!(doc.revoked_at instanceof Date) &&
		doc.expires_at instanceof Date &&
		doc.expires_at > new Date();
	if (active) return false;
	return (
		(
			await collection.deleteOne({
				_id: doc._id,
				user_email: email,
				$or: [{ revoked_at: { $exists: true } }, { expires_at: { $lte: new Date() } }]
			})
		).deletedCount === 1
	);
}
