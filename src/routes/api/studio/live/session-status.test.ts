import { beforeEach, expect, it, vi } from 'vitest';
import { POST } from './+server';

const { getGate, updateGate, getSession, setSessionStatus } = vi.hoisted(() => ({
	getGate: vi.fn(),
	updateGate: vi.fn(),
	getSession: vi.fn(),
	setSessionStatus: vi.fn()
}));

vi.mock('../../../../db/collections', () => ({
	getStudioAuthorization: async () => ({ email: 'operator@example.com', name: 'Operator' }),
	getBroadcastAdminState: getGate,
	setBroadcastAdminState: updateGate,
	getScheduledLiveById: getSession,
	setStudioScheduledLiveStatus: setSessionStatus
}));
vi.mock('$lib/server/s3', () => ({}));

const sessionId = '0123456789abcdef01234567';
const startedAt = '2026-10-04T08:00:00Z';

function request(action: string) {
	const url = new URL('https://missionnaire.example/api/studio/live');
	return POST({
		url,
		request: new Request(url, {
			method: 'POST',
			headers: { authorization: 'Bearer 857c4709-a049-43a9-9fe2-b83c5fce22d3' },
			body: JSON.stringify({ action, sessionId })
		})
	} as Parameters<typeof POST>[0]);
}

beforeEach(() => {
	vi.clearAllMocks();
	getSession.mockResolvedValue({ _id: sessionId, slug: 'sunday', status: 'live' });
	getGate.mockResolvedValue({ is_live: true, scheduled_live_id: sessionId, started_at: startedAt });
	updateGate.mockResolvedValue(true);
	setSessionStatus.mockResolvedValue(true);
});

it('verifies or resumes a start without reopening a confirmed gate', async () => {
	expect(await (await request('session-status')).json()).toEqual({
		active: true,
		startedAt,
		status: 'live'
	});
	expect(await (await request('start')).json()).toMatchObject({ startedAt });
	expect(updateGate).not.toHaveBeenCalled();
	expect(setSessionStatus).not.toHaveBeenCalled();
});

it('retries a partial end without closing a different broadcast', async () => {
	getGate.mockResolvedValue({ is_live: true, scheduled_live_id: 'different-service' });
	await request('end');
	expect(updateGate).not.toHaveBeenCalled();
	expect(setSessionStatus).toHaveBeenCalledWith(sessionId, 'ended', expect.any(String));
});

it('cannot report the status of another operator’s private test', async () => {
	getSession.mockResolvedValue({ _id: sessionId, is_test: true, created_by: 'other@example.com' });
	await expect(request('session-status')).rejects.toMatchObject({ status: 404 });
	expect(getGate).not.toHaveBeenCalled();
});
