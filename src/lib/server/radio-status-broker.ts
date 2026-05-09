/**
 * Radio Status Broker (Simplified)
 *
 * Thin wrapper around the MongoDB radio status cache.
 * Probing is now driven by the Vercel cron at /api/cron/radio-probe (runs
 * every minute when the admin gate is open). This module is read-only —
 * it just surfaces the latest cached status for SSR consumers.
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
	} catch {
		/* fallback to 0 */
	}
	return { ...cached, listeners };
}
