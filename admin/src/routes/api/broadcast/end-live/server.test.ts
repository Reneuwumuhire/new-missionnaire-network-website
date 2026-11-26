import { beforeEach, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
	getBroadcastAdminState: vi.fn(),
	setBroadcastAdminState: vi.fn(),
	setScheduledLiveStatus: vi.fn(),
	logAudit: vi.fn()
}));
const recorder = vi.hoisted(() => ({ recorderStatus: vi.fn(), recorderStopById: vi.fn() }));

vi.mock('../../../../db/collections', () => db);
vi.mock('$lib/server/admin-session', () => ({
	verifyAdminSession: async () => ({ email: 'operator@example.com' })
}));
vi.mock('$lib/models/admin-user', () => ({
	getPermissions: () => ({ can_manage_recordings: true })
}));
vi.mock('$lib/server/recorder-client', async (load) => ({
	...(await load<typeof import('$lib/server/recorder-client')>()),
	...recorder
}));

import { POST } from './+server';
import { finishLateRecording } from '$lib/server/finish-late-recording';

const live = { is_live: true, scheduled_live_id: 'live-id' };
const call = async () => (await POST({ getClientAddress: () => '127.0.0.1' } as never)).json();

beforeEach(() => {
	vi.resetAllMocks();
	vi.stubEnv('MAIN_SITE_URL', '');
	db.getBroadcastAdminState.mockResolvedValue(live);
	db.logAudit.mockResolvedValue(undefined);
	recorder.recorderStatus.mockResolvedValue({
		recording: true,
		id: 'recording-id',
		startedAt: '2020-01-01T00:00:00Z'
	});
	recorder.recorderStopById.mockResolvedValue({ id: 'recording-id' });
});

it('closes the live gate and stops the exact active recording without waiting for source EOF', async () => {
	await expect(call()).resolves.toMatchObject({
		ok: true,
		recordingId: 'recording-id',
		recordingError: null
	});
	expect(db.setBroadcastAdminState).toHaveBeenCalledWith(
		expect.objectContaining({ is_live: false })
	);
	expect(recorder.recorderStopById).toHaveBeenCalledWith('recording-id', false);
});

it.each([
	{ recording: false },
	{ recording: true, stopping: true },
	{ recording: true, startedAt: '2099-01-01T00:00:00Z' }
])('leaves inactive, finishing, or later recordings alone (%j)', async (status) => {
	recorder.recorderStatus.mockResolvedValue({
		id: 'recording-id',
		startedAt: '2020-01-01T00:00:00Z',
		...status
	});
	await expect(call()).resolves.toMatchObject({ ok: true, recordingId: null });
	expect(recorder.recorderStopById).not.toHaveBeenCalled();
});

it('leaves the recorder alone when the live was already ended or was a private test', async () => {
	db.getBroadcastAdminState
		.mockResolvedValueOnce({ is_live: false })
		.mockResolvedValueOnce({ ...live, is_test: true });
	await expect(call()).resolves.toMatchObject({ alreadyOffline: true });
	await expect(call()).resolves.toMatchObject({ ok: true, recordingId: null });
	expect(recorder.recorderStatus).not.toHaveBeenCalled();
});

it('reports a recording error separately after the live has ended', async () => {
	recorder.recorderStopById.mockRejectedValue(new Error('Recorder unavailable'));
	await expect(call()).resolves.toMatchObject({ ok: true, recordingError: 'Recorder unavailable' });
});

it('finalizes a recording whose start raced with End Live', async () => {
	db.getBroadcastAdminState.mockResolvedValueOnce({ ...live, is_live: false });
	await expect(finishLateRecording(live as never, 'late-id')).resolves.toBe(true);
	expect(recorder.recorderStopById).toHaveBeenCalledWith('late-id', false);
	await expect(finishLateRecording(live as never, 'current-id')).resolves.toBe(false);
	expect(recorder.recorderStopById).toHaveBeenCalledTimes(1);
});
