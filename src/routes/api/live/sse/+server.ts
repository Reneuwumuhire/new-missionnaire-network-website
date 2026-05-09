import { json } from '@sveltejs/kit';

/**
 * SSE endpoint — deprecated. Live status is now push-driven (Web Push +
 * Service Worker broadcast); read the current snapshot from /api/live/radio-state.
 */
export function GET() {
	return json({ deprecated: true, message: 'Use /api/live/radio-state instead' }, { status: 410 });
}
