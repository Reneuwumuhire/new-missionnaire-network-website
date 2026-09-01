import { describe, expect, it } from 'vitest';
import {
	isLatestStatusRequest,
	sessionYouTubeChannelId,
	type YouTubeChannel,
	youtubeChannelsFromStatus
} from './live-session.svelte';

it('ignores an older status response after a newer refresh starts', () => {
	expect(isLatestStatusRequest(4, 5)).toBe(false);
	expect(isLatestStatusRequest(5, 5)).toBe(true);
});

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

it('accepts the older single-channel admin response', () => {
	expect(youtubeChannelsFromStatus({ connected: true, channelTitle: 'Missionnaire TV' })).toEqual([
		{ id: 'legacy:Missionnaire TV', title: 'Missionnaire TV', updatedAt: '' }
	]);
	expect(youtubeChannelsFromStatus({ connected: false, channelTitle: null })).toEqual([]);
});
