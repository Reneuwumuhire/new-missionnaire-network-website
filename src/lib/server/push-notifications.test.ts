import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/push-endpoint', () => ({ pushEndpoint: {} }));
vi.mock('$app/env/public', () => ({ PUBLIC_VAPID_KEY: '' }));
vi.mock('$app/env/private', () => ({ PUSH_NOTIFICATIONS_ENABLED: 'false', VAPID_PRIVATE_KEY: '' }));
vi.mock('../../db/collections', () => ({
	getAllPushSubscriptions: vi.fn(),
	removePushSubscription: vi.fn()
}));

import { liveReminderPayload, liveScheduledPayload } from './push-notifications';

describe('scheduled live notifications', () => {
	it('shows the Rwanda broadcast time in announcements and reminders', () => {
		const live = {
			title: 'Retransmission',
			scheduledAtIso: '2026-11-25T18:30:00.000Z',
			slug: 'retransmission'
		};
		expect(liveScheduledPayload(live).body).toContain('20:30');
		expect(liveReminderPayload(live).body).toContain('20:30');
	});
});
