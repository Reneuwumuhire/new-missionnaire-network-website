import { describe, expect, it } from 'vitest';
import {
	isLatestStatusRequest,
	reusableSessionDraft,
	restoreStudioAuthorization,
	sessionYouTubeChannelId,
	subtitleNeedsAttach,
	subtitleSyncAction,
	type YouTubeChannel,
	youtubeChannelsFromStatus
} from './live-session.svelte';

it('reuses stream settings without reusing its schedule or transcript', () => {
	const draft = reusableSessionDraft({
		_id: 'previous',
		slug: 'previous-live',
		title: 'Sunday service',
		scheduled_at: '2026-09-20T08:00:00.000Z',
		status: 'ended',
		description: 'Service description',
		thumbnail_url: 'https://example.com/thumbnail.jpg',
		thumbnail_s3_key: 'broadcast-thumbnails/thumbnail.jpg',
		privacy_status: 'unlisted',
		made_for_kids: true,
		reminder_enabled: true,
		notify_on_start: true,
		youtube_channel_id: 'channel-1',
		service_type: 'live'
	});

	expect(draft).toMatchObject({
		title: 'Sunday service',
		scheduledAt: '',
		description: 'Service description',
		privacyStatus: 'unlisted',
		madeForKids: true,
		thumbnailUrl: 'https://example.com/thumbnail.jpg',
		thumbnailKey: 'broadcast-thumbnails/thumbnail.jpg',
		reminderEnabled: true,
		notifyOnStart: true,
		youtubeChannelId: 'channel-1',
		serviceType: 'live'
	});
	expect(draft.subtitle).toBeNull();
	expect(draft.announce).toBe(false);
});

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

it('reattaches a subtitle loaded later in the same live session', () => {
	expect(subtitleNeedsAttach('live-1', 'subtitles/new.srt', 'live-1', 'subtitles/old.srt')).toBe(
		true
	);
	expect(subtitleNeedsAttach('live-1', 'subtitles/new.srt', 'live-1', 'subtitles/new.srt')).toBe(
		false
	);
});

it('attaches a live subtitle before its timing source is ready', () => {
	expect(subtitleSyncAction(true, false)).toBe('attach');
	expect(subtitleSyncAction(false, false)).toBeNull();
	expect(subtitleSyncAction(true, true)).toBe('sync');
});
