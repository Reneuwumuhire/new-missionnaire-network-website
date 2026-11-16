import { z } from 'zod';

export const pushEndpoint = z
	.url()
	.max(4096)
	.refine((endpoint) => {
		const { protocol, hostname, username, password, port } = new URL(endpoint);
		if (protocol !== 'https:' || username || password || port) return false;
		return (
			hostname === 'fcm.googleapis.com' ||
			hostname === 'android.googleapis.com' ||
			hostname === 'updates.push.services.mozilla.com' ||
			hostname.endsWith('.push.apple.com') ||
			hostname.endsWith('.notify.windows.com')
		);
	});
