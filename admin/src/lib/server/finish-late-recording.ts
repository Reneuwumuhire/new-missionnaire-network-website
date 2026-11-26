import { getBroadcastAdminState, type BroadcastAdminState } from '../../db/collections';
import { recorderStopById } from './recorder-client';

export async function finishLateRecording(gate: BroadcastAdminState, id: string): Promise<boolean> {
	if (!gate.is_live || gate.is_test) return false;
	const current = await getBroadcastAdminState({ fresh: true });
	if (
		current.is_live &&
		current.scheduled_live_id === gate.scheduled_live_id &&
		current.started_at === gate.started_at
	)
		return false;
	await recorderStopById(id, false);
	return true;
}
