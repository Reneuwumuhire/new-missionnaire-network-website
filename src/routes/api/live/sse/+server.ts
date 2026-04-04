import { json } from '@sveltejs/kit';

/**
 * SSE endpoint — deprecated in favor of /api/live/radio-poll.
 * Returns a redirect hint so any legacy clients know to switch.
 */
export function GET() {
	return json(
		{ deprecated: true, message: 'Use /api/live/radio-poll instead' },
		{ status: 410 }
	);
}
