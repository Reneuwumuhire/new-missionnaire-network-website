import { getDashboardStats, getRecentAuditLogs } from '../db/collections';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [stats, recentActivity] = await Promise.all([
		getDashboardStats(),
		getRecentAuditLogs(10)
	]);

	return { stats, recentActivity };
};
