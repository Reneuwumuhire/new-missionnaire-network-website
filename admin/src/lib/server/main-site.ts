/** Public watch URL for a scheduled live slug — built on the main site origin. */
export function buildWatchUrl(slug: string): string {
	const base = (process.env.MAIN_SITE_URL || 'https://missionnaire.net').replace(/\/$/, '');
	return `${base}/live/${slug}`;
}

/** Fire-and-forget ping to the main site's internal broadcast-event endpoint
 *  so pushes fire within ~1s of the admin action instead of waiting for the
 *  cron backstop. Same cross-service contract as the go-live handler. */
export function pingBroadcastEvent(body: Record<string, unknown>): void {
	const internalSecret = process.env.INTERNAL_API_SECRET;
	if (!process.env.MAIN_SITE_URL || !internalSecret) {
		console.warn(
			'[main-site] MAIN_SITE_URL or INTERNAL_API_SECRET not set — push delayed until the main-site cron fires'
		);
		return;
	}
	fetch(`${process.env.MAIN_SITE_URL.replace(/\/$/, '')}/api/internal/broadcast-event`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${internalSecret}`
		},
		body: JSON.stringify(body)
	}).catch((err) => {
		console.error('[main-site] broadcast-event ping failed:', err);
	});
}
