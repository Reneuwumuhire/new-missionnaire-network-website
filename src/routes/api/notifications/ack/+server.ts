import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { trackNotificationEvent } from '../../../../db/collections';

const notificationEvent = z.object({
	action: z.string().min(1).max(64),
	tag: z.string().min(1).max(256),
	timestamp: z.number().int().positive().optional()
});

export async function POST({ request }) {
	const parsed = notificationEvent.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ error: 'Invalid notification event' }, { status: 400 });

	try {
		const { action, tag, timestamp = Date.now() } = parsed.data;
		await trackNotificationEvent({ action, tag, timestamp });
		return json({ success: true });
	} catch (error) {
		console.error('[Notification Ack] Error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
