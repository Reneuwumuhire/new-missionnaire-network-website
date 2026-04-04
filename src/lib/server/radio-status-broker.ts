/**
 * Radio Status Broker (Simplified)
 *
 * Thin wrapper around the MongoDB radio status cache.
 * The actual probing is now done by the /api/live/radio-poll endpoint,
 * triggered by client polling and deduplicated via DB locks.
 */

import { getRadioCachedStatus, countActiveListeners } from '../../db/collections';

export type RadioStatusEvent = {
	isLive: boolean;
	checkedAt: string;
	listeners: number;
	streamUrl?: string;
};

export async function getLastStatus(): Promise<RadioStatusEvent | null> {
	const cached = await getRadioCachedStatus();
	if (!cached) return null;
	let listeners = 0;
	try {
		listeners = await countActiveListeners();
	} catch { /* fallback to 0 */ }
	return { ...cached, listeners };
}
