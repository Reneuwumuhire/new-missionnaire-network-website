import { expect, it, vi } from 'vitest';
import { getLiveDiscovery } from './live-discovery';

const { gate, radio, next, recordings, refreshRadioSnapshot } = vi.hoisted(() => ({
	gate: vi.fn(),
	radio: vi.fn(),
	next: vi.fn(),
	recordings: vi.fn(),
	refreshRadioSnapshot: vi.fn()
}));

vi.mock('../../db/collections', () => ({
	getBroadcastAdminState: gate,
	getRadioCachedStatus: radio,
	getNextPublicScheduledLive: next
}));
vi.mock('./recordings', () => ({ getRecentPublished: recordings }));
vi.mock('./icecast', () => ({ refreshRadioSnapshot }));

it('only promotes an on-air public service while audio is flowing', async () => {
	gate.mockResolvedValue({ is_live: true, is_test: true, scheduled_live_slug: 'private-test' });
	radio.mockResolvedValue({ isLive: true });
	next.mockResolvedValue(null);
	recordings.mockResolvedValue([{ id: 'published' }]);
	expect(await getLiveDiscovery({ fetchFn: fetch })).toEqual({
		kind: 'replay',
		href: '/live/rediffusions/published'
	});
	expect(refreshRadioSnapshot).not.toHaveBeenCalled();

	gate.mockResolvedValue({ is_live: true, is_test: false, scheduled_live_slug: 'sunday' });
	expect(await getLiveDiscovery()).toEqual({ kind: 'live', href: '/live/sunday', upcoming: null });

	radio.mockResolvedValue({ isLive: false });
	expect(await getLiveDiscovery()).toMatchObject({ kind: 'replay' });
	refreshRadioSnapshot.mockResolvedValue({ isLive: true });
	expect(await getLiveDiscovery({ fetchFn: fetch })).toMatchObject({ kind: 'live' });
});

it('returns the next scheduled service independently of the audio on air', async () => {
	gate.mockResolvedValue({ is_live: true, scheduled_live_slug: 'current' });
	radio.mockResolvedValue({ isLive: true });
	next.mockResolvedValue({
		slug: 'next',
		title: 'Next broadcast',
		scheduled_at: '2027-05-09T08:00:00Z'
	});
	expect(await getLiveDiscovery()).toMatchObject({
		kind: 'live',
		href: '/live/current',
		upcoming: { href: '/live/next', title: 'Next broadcast', scheduledAt: '2027-05-09T08:00:00Z' }
	});
});

it('replaces a rescheduled or cancelled service on the next refresh', async () => {
	gate.mockResolvedValue({ is_live: false });
	radio.mockResolvedValue(null);
	recordings.mockResolvedValue([]);
	next.mockResolvedValue({
		slug: 'sunday',
		title: 'Service',
		scheduled_at: '2027-05-09T08:00:00Z'
	});
	expect(await getLiveDiscovery()).toMatchObject({
		kind: 'scheduled',
		scheduledAt: '2027-05-09T08:00:00Z'
	});
	next.mockResolvedValue({
		slug: 'sunday',
		title: 'Service',
		scheduled_at: '2027-05-09T10:00:00Z'
	});
	expect(await getLiveDiscovery()).toMatchObject({
		kind: 'scheduled',
		scheduledAt: '2027-05-09T10:00:00Z'
	});
	next.mockResolvedValue(null);
	expect(await getLiveDiscovery()).toEqual({ kind: 'library', href: '/recherche' });
});
