export function scheduledNotificationBody(
	payload: {
		body: string;
		event?: string;
		scheduledAtIso?: string;
		scheduledTitle?: string;
	},
	timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
): string {
	if (!payload.scheduledAtIso || !payload.scheduledTitle) return payload.body;
	const start = new Date(payload.scheduledAtIso);
	if (Number.isNaN(start.getTime())) return payload.body;
	const title = `« ${payload.scheduledTitle} »`;
	if (payload.event === 'live-scheduled') {
		const when = new Intl.DateTimeFormat('fr-FR', {
			timeZone,
			dateStyle: 'full',
			timeStyle: 'short'
		}).format(start);
		return `${title} — ${when}`.slice(0, 160);
	}
	if (payload.event === 'live-reminder') {
		const when = new Intl.DateTimeFormat('fr-FR', {
			timeZone,
			hour: '2-digit',
			minute: '2-digit'
		}).format(start);
		return `${title} commence à ${when}.`.slice(0, 160);
	}
	return payload.body;
}
