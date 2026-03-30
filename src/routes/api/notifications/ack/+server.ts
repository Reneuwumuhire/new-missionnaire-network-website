import { json } from '@sveltejs/kit';
import { trackNotificationEvent } from '../../../../db/collections';

export async function POST({ request }) {
	try {
		const body = await request.json();
		const { action, tag, timestamp } = body;

		if (!action || !tag) {
			return json({ error: 'Missing action or tag' }, { status: 400 });
		}

		await trackNotificationEvent({ action, tag, timestamp: timestamp || Date.now() });

		return json({ success: true });
	} catch (error) {
		console.error('[Notification Ack] Error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
