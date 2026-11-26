import { expect, it } from 'vitest';
import { scheduledNotificationBody } from './scheduled-notification-body';

it('formats the same scheduled instant for each recipient timezone', () => {
	const payload = {
		body: 'fallback',
		event: 'live-reminder',
		scheduledAtIso: '2026-11-25T18:30:00.000Z',
		scheduledTitle: 'Retransmission'
	};
	expect(scheduledNotificationBody(payload, 'Africa/Kigali')).toContain('20:30');
	expect(scheduledNotificationBody(payload, 'Asia/Shanghai')).toContain('02:30');
	expect(
		scheduledNotificationBody({ ...payload, event: 'live-scheduled' }, 'Asia/Shanghai')
	).toContain('jeudi 26 novembre 2026');
	expect(scheduledNotificationBody({ ...payload, scheduledAtIso: undefined })).toBe('fallback');
});
