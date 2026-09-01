import { describe, expect, it } from 'vitest';
import {
	isLatestStatusRequest,
	restoreStudioAuthorization,
	sessionYouTubeChannelId,
	type YouTubeChannel,
	youtubeChannelsFromStatus
} from './live-session.svelte';

it('ignores an older status response after a newer refresh starts', () => {
	expect(isLatestStatusRequest(4, 5)).toBe(false);
	expect(isLatestStatusRequest(5, 5)).toBe(true);
});

it('restores only a valid saved Studio authorization', () => {
	const storage = { getItem: () => '857c4709-a049-43a9-9fe2-b83c5fce22d3' };
	expect(restoreStudioAuthorization(storage)).toBe('857c4709-a049-43a9-9fe2-b83c5fce22d3');
	expect(restoreStudioAuthorization({ getItem: () => 'not-an-authorization' })).toBeNull();
	expect(
		restoreStudioAuthorization({ getItem: () => '857c4709a049-43a9-9fe2-b83c5fce22d3-' })
	).toBeNull();
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
