import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { savePushSubscription, removePushSubscription } from '../../../../db/collections';

const subscriptionSchema = z.object({
	endpoint: z.string().url(),
	keys: z.object({
		p256dh: z.string().min(1),
		auth: z.string().min(1)
	})
});

export async function POST({ request }) {
	try {
		const body = await request.json();
		const subscription = subscriptionSchema.parse(body);
		const userAgent = request.headers.get('user-agent') ?? undefined;

		await savePushSubscription(subscription, userAgent);

		return json({ success: true });
	} catch (error) {
		if (error instanceof z.ZodError) {
			return json({ error: 'Invalid subscription object', details: error.errors }, { status: 400 });
		}
		console.error('[Push] Error saving subscription:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function DELETE({ request }) {
	try {
		const body = await request.json();
		const { endpoint } = z.object({ endpoint: z.string().url() }).parse(body);

		await removePushSubscription(endpoint);

		return json({ success: true });
	} catch (error) {
		if (error instanceof z.ZodError) {
			return json({ error: 'Invalid request', details: error.errors }, { status: 400 });
		}
		console.error('[Push] Error removing subscription:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}
