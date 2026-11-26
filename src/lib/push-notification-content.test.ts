import { expect, it } from 'vitest';
import { pushNotificationContent } from './push-notification-content';

it('uses the selected language and the recipient timezone for a scheduled reminder', () => {
	const payload = {
		title: 'Le direct commence bientôt',
		body: 'fallback',
		event: 'live-reminder',
		scheduledAtIso: '2026-11-25T18:30:00.000Z',
		scheduledTitle: 'Retransmission'
	};
	expect(pushNotificationContent(payload, 'en').title).toBe('The live broadcast starts soon');
	expect(pushNotificationContent(payload, 'en').body).toContain('starts at');
	expect(pushNotificationContent(payload, 'fr').body).toContain('commence à');
});

it('translates standard live text while keeping the broadcast description', () => {
	const content = pushNotificationContent(
		{
			title: 'En direct',
			body: 'Description',
			event: 'radio-live',
			broadcastTitle: 'Service',
			broadcastDescription: 'Description'
		},
		'en'
	);
	expect(content.title).toBe('🔴 Live: Service');
	expect(content.body).toBe('Description');
	expect(content.open).toBe('Open');
});
