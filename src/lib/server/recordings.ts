import { getDb } from '../../db/mongo';

export interface PublishedRecording {
	id: string;
	title: string;
	started_at: string; // ISO
	duration_sec: number | null;
	s3_url: string;
	size_bytes: number | null;
	thumbnail_url: string | null;
}

interface RecordingRow {
	_id: { toString(): string };
	title: string;
	started_at: Date | string;
	duration_sec?: number | null;
	s3_url?: string | null;
	size_bytes?: number | null;
	thumbnail_url?: string | null;
}

function toPublic(doc: RecordingRow): PublishedRecording {
	return {
		id: doc._id.toString(),
		title: doc.title,
		started_at:
			doc.started_at instanceof Date ? doc.started_at.toISOString() : String(doc.started_at),
		duration_sec: doc.duration_sec ?? null,
		s3_url: doc.s3_url ?? '',
		size_bytes: doc.size_bytes ?? null,
		thumbnail_url: doc.thumbnail_url ?? null
	};
}

export async function getRecentPublished(limit = 5): Promise<PublishedRecording[]> {
	try {
		const db = await getDb();
		const rows = (await db
			.collection('recordings')
			.find({ published: true, status: 'ready' })
			.sort({ started_at: -1 })
			.limit(limit)
			.toArray()) as unknown as RecordingRow[];
		return rows.map(toPublic);
	} catch (err) {
		console.error('[recordings] getRecentPublished failed', err);
		return [];
	}
}

export async function listPublished(options: {
	limit?: number;
	pageNumber?: number;
} = {}): Promise<{ data: PublishedRecording[]; total: number }> {
	const { limit = 20, pageNumber = 1 } = options;
	try {
		const db = await getDb();
		const query = { published: true, status: 'ready' };
		const skip = (pageNumber - 1) * limit;
		const [rows, total] = await Promise.all([
			db.collection('recordings').find(query).sort({ started_at: -1 }).skip(skip).limit(limit).toArray(),
			db.collection('recordings').countDocuments(query)
		]);
		return { data: (rows as unknown as RecordingRow[]).map(toPublic), total };
	} catch (err) {
		console.error('[recordings] listPublished failed', err);
		return { data: [], total: 0 };
	}
}

export async function getPublishedById(id: string): Promise<PublishedRecording | null> {
	try {
		const { ObjectId } = await import('mongodb');
		if (!ObjectId.isValid(id)) return null;
		const db = await getDb();
		const row = (await db
			.collection('recordings')
			.findOne({ _id: new ObjectId(id), published: true, status: 'ready' })) as unknown as RecordingRow | null;
		return row ? toPublic(row) : null;
	} catch (err) {
		console.error('[recordings] getPublishedById failed', err);
		return null;
	}
}
