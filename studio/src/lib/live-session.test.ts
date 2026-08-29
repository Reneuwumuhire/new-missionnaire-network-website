import { describe, expect, it } from 'vitest';
import { sessionYouTubeChannelId, type YouTubeChannel } from './live-session.svelte';

const channels: YouTubeChannel[] = [
	{ id: 'first', title: 'First', updatedAt: '1' },
	{ id: 'second', title: 'Second', updatedAt: '2' }
];

describe('a scheduled service YouTube channel', () => {
	it('uses the channel stored on the service', () => {
		expect(sessionYouTubeChannelId({ youtube_channel_id: 'second' }, channels)).toBe('second');
	});

	it('only migrates an old service when the choice is unambiguous', () => {
		expect(sessionYouTubeChannelId({}, channels.slice(0, 1))).toBe('first');
		expect(sessionYouTubeChannelId({}, channels)).toBeNull();
	});
});
