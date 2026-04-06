import { json } from '@sveltejs/kit';
import { getDashboardStats, getRecentAuditLogs } from '../../../db/collections';
import type { RequestEvent } from './$types';

export async function GET(_event: RequestEvent) {
	try {
		const [stats, auditLogs] = await Promise.all([
			getDashboardStats(),
			getRecentAuditLogs(10)
		]);

		return json({
			data: { ...stats, recentActivity: auditLogs },
			error: null
		});
	} catch (error) {
		console.error('Stats API Error:', error);
		return json({ data: null, error: 'Failed to fetch stats' }, { status: 500 });
	}
}
