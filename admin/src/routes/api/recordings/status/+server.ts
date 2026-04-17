import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPermissions } from '$lib/models/admin-user';
import { RecorderError, recorderStatus, type RecorderStatus } from '$lib/server/recorder-client';
import { getIcecastSnapshot, type IcecastSnapshot } from '$lib/server/icecast';

export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	if (!getPermissions(locals.user).can_manage_recordings) throw error(403, 'Accès refusé');

	setHeaders({ 'Cache-Control': 'no-store' });

	const [recorderResult, icecast] = await Promise.all([
		recorderStatus().catch((err: unknown) => {
			if (err instanceof RecorderError) {
				return { error: err.message, status: err.status } as const;
			}
			return { error: (err as Error).message, status: 502 } as const;
		}),
		getIcecastSnapshot()
	]);

	const isRecorderResult = (value: unknown): value is RecorderStatus =>
		typeof value === 'object' && value !== null && 'recording' in value;

	const recorder: (RecorderStatus & { available: true }) | { available: false; error: string } =
		isRecorderResult(recorderResult)
			? { ...recorderResult, available: true }
			: { available: false, error: recorderResult.error };

	return json({ recorder, icecast: icecast satisfies IcecastSnapshot });
};
