import { scheduledNotificationBody } from './scheduled-notification-body';

type Payload = {
	title: string;
	body: string;
	event?: string;
	scheduledAtIso?: string;
	scheduledTitle?: string;
	broadcastTitle?: string;
	broadcastDescription?: string;
};

export function pushNotificationContent(payload: Payload, locale: 'fr' | 'en') {
	const body = scheduledNotificationBody(payload, undefined, locale);
	if (locale === 'fr') return { title: payload.title, body, open: 'Ouvrir', dismiss: 'Ignorer' };
	const title = payload.broadcastTitle;
	switch (payload.event) {
		case 'radio-live':
			return {
				title: title ? `🔴 Live: ${title.slice(0, 80)}` : 'Live audio',
				body: payload.broadcastDescription || 'Missionnaire Network is live now!',
				open: 'Open',
				dismiss: 'Dismiss'
			};
		case 'radio-end':
			return {
				title: 'Broadcast ended',
				body: title
					? `“${title.slice(0, 80)}” has ended. The replay will be available soon.`
					: 'The live broadcast has ended.',
				open: 'Open',
				dismiss: 'Dismiss'
			};
		case 'live-scheduled':
			return { title: 'Upcoming live broadcast', body, open: 'Open', dismiss: 'Dismiss' };
		case 'live-reminder':
			return { title: 'The live broadcast starts soon', body, open: 'Open', dismiss: 'Dismiss' };
		default:
			return { title: payload.title, body, open: 'Open', dismiss: 'Dismiss' };
	}
}
