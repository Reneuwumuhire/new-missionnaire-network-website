import { error, fail } from '@sveltejs/kit';
import { getDb } from '../../db/mongo';
import { logAudit } from '../../db/collections';
import { getPermissions } from '$lib/models/admin-user';
import type { Actions, PageServerLoad } from './$types';

const statuses = ['pending', 'processing', 'ready', 'failed', 'no_text'] as const;
type Job = {
	_id: string;
	title: string;
	url: string;
	collection: string;
	status: (typeof statuses)[number];
	attempts: number;
	error: string | null;
	updatedAt: Date;
};

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user || !getPermissions(locals.user).can_manage_recordings)
		error(403, 'Accès refusé');
	const status = statuses.find((value) => value === url.searchParams.get('status')) ?? 'pending';
	const page = Math.max(
		1,
		Math.min(10000, Number.parseInt(url.searchParams.get('page') || '1') || 1)
	);
	const db = await getDb();
	const [jobs, counts, worker] = await Promise.all([
		db
			.collection<Job>('library_index_jobs')
			.find(
				{ status },
				{
					projection: {
						_id: 1,
						title: 1,
						url: 1,
						collection: 1,
						status: 1,
						attempts: 1,
						error: 1,
						updatedAt: 1
					}
				}
			)
			.sort({ updatedAt: -1, _id: 1 })
			.skip((page - 1) * 50)
			.limit(50)
			.toArray(),
		db
			.collection('library_index_jobs')
			.aggregate<{ _id: string; count: number }>([
				{ $group: { _id: '$status', count: { $sum: 1 } } }
			])
			.toArray(),
		db
			.collection<{ _id: string; heartbeat: Date }>('library_index_workers')
			.findOne({ _id: 'worker' })
	]);
	return {
		jobs: jobs.map(({ url, ...job }) => ({
			...job,
			fileName: url.split('/').at(-1)?.split('?')[0] || '',
			updatedAt: job.updatedAt.toISOString()
		})),
		status,
		page,
		counts: Object.fromEntries(
			statuses.map((status) => [status, counts.find((row) => row._id === status)?.count ?? 0])
		),
		workerOnline: !!worker && Date.now() - new Date(worker.heartbeat).getTime() < 180_000
	};
};

export const actions: Actions = {
	retry: async ({ locals, request }) => {
		if (!locals.user || !getPermissions(locals.user).can_manage_recordings)
			error(403, 'Accès refusé');
		const id = (await request.formData()).get('id');
		if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id))
			return fail(400, { retryFailed: true });
		const db = await getDb();
		const result = await db.collection<Job>('library_index_jobs').updateOne(
			{ _id: id, status: { $in: ['failed', 'no_text'] } },
			{
				$set: {
					status: 'pending',
					attempts: 0,
					error: null,
					availableAt: new Date(),
					updatedAt: new Date()
				}
			}
		);
		if (!result.matchedCount) return fail(409, { retryFailed: true });
		await logAudit({
			user_id: locals.user._id!,
			user_email: locals.user.email,
			action: 'update',
			target_collection: 'library_index_jobs',
			target_id: id,
			ip_address: null,
			changes: { status: { old: 'failed/no_text', new: 'pending' } }
		});
		return { retried: true };
	}
};
