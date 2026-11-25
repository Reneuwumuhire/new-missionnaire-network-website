import { expect, it, vi } from 'vitest';
import { GET } from './+server';

const { getBroadcastAdminState, getRadioCachedStatus, refreshRadioSnapshot } = vi.hoisted(() => ({
	getBroadcastAdminState: vi.fn(),
	getRadioCachedStatus: vi.fn(),
	refreshRadioSnapshot: vi.fn()
}));

vi.mock('../../../../db/collections', () => ({
	getBroadcastAdminState,
	getRadioCachedStatus
}));
vi.mock('$lib/server/icecast', () => ({ refreshRadioSnapshot }));

vi.mock('$lib/server/live-audio', () => ({
	getLiveAudioSourceUrl: () => 'https://radio.example.com/live',
	getLiveAudioHlsUrl: () => 'https://radio.example.com/live.m3u8'
}));

it('serves the current subtitle file through one URL and preserves earlier DVR sources', async () => {
	const historical = {
		fromEpochMs: 1_000,
		toEpochMs: 10_000,
		url: 'https://example.s3.amazonaws.com/subtitles/earlier.srt',
		anchorEpochMs: 1_000,
		offsetMs: 0,
		pausedPositionMs: null
	};
	const current = {
		...historical,
		fromEpochMs: 10_000,
		toEpochMs: null,
		url: 'https://example.s3.amazonaws.com/subtitles/current.srt',
		anchorEpochMs: 10_000
	};
	getBroadcastAdminState.mockResolvedValue({
		is_live: true,
		subtitle_srt_url: current.url,
		subtitle_srt_s3_key: 'subtitles/current.srt',
		subtitle_anchor_epoch_ms: current.anchorEpochMs,
		subtitle_timeline: [historical, current]
	});
	refreshRadioSnapshot.mockResolvedValue({ isLive: true, checkedAt: new Date().toISOString() });

	const response = await GET({ setHeaders: vi.fn() } as never);
	const { subtitles } = await response.json();
	const proxyUrl = '/api/subtitles/file?key=subtitles%2Fcurrent.srt';
	expect(subtitles.url).toBe(proxyUrl);
	expect(subtitles.timeline).toEqual([historical, { ...current, url: proxyUrl }]);
});

it('returns off air without presenting an old audio check as current', async () => {
	refreshRadioSnapshot.mockClear();
	getBroadcastAdminState.mockResolvedValue({ is_live: false });
	getRadioCachedStatus.mockResolvedValue({
		isLive: true,
		checkedAt: '2026-11-25T10:20:28Z',
		listeners: 1
	});
	const response = await GET({ setHeaders: vi.fn() } as never);
	expect(await response.json()).toMatchObject({
		broadcastOpen: false,
		isLive: false,
		checkedAt: null,
		listeners: 0
	});
	expect(refreshRadioSnapshot).not.toHaveBeenCalled();
});
