import { browser } from '$app/environment';

export type PlaybackKind = 'live' | 'sermon' | 'song' | 'song_video' | 'recording';

const recorded = new Map<string, number>();

export function recordPlayback(kind: PlaybackKind, id: string, title: string): void {
	if (!browser || navigator.webdriver || navigator.doNotTrack === '1') return;
	if (!id || !title) return;
	const key = `${kind}:${id}`;
	const now = Date.now();
	if (now - (recorded.get(key) ?? 0) < 5 * 60_000) return;
	recorded.set(key, now);
	void fetch('/api/analytics', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ event: 'playback', kind, id, title }),
		keepalive: true
	})
		.then((response) => {
			if (!response.ok) recorded.delete(key);
		})
		.catch(() => recorded.delete(key));
}
