/**
 * Radio Status Broker (Simplified)
 *
 * Thin wrapper around the MongoDB radio status cache.
 * Probing is now driven by the Vercel cron at /api/cron/radio-probe (runs
 * every minute when the admin gate is open). This module is read-only —
 * it just surfaces the latest cached status for SSR consumers.
 */

import { getRadioCachedStatus } from '../../db/collections';

export type RadioStatusEvent = {
	isLive: boolean;
	checkedAt: string;
	listeners: number;
	streamUrl?: string;
};

export async function getLastStatus(): Promise<RadioStatusEvent | null> {
	const cached = await getRadioCachedStatus();
	if (!cached) return null;
	return { ...cached, listeners: cached.isLive ? (cached.listeners ?? 0) : 0 };
}
