import { beforeEach, describe, expect, it, vi } from 'vitest';

const controlCloudRecording = vi.hoisted(() => vi.fn());

vi.mock('./live-session.svelte', () => ({ controlCloudRecording }));
vi.mock('./state.svelte', () => ({
	studio: { settings: { recordingMode: 'cloud' }, service: { type: 'live' } }
}));

import { recording, stopCloudRecording } from './recording.svelte';

describe('cloud recording controls', () => {
	beforeEach(() => {
		controlCloudRecording.mockReset();
		recording.cloud = true;
		recording.cloudPending = false;
		recording.error = null;
		recording.localPath = null;
		recording.savedId = null;
		recording.startedAt = 1;
	});

	it('waits for one stop command and then clears the Studio indicator', async () => {
		let finish!: () => void;
		controlCloudRecording.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));

		const stopping = stopCloudRecording();
		expect(recording.cloudPending).toBe(true);
		void stopCloudRecording();
		expect(controlCloudRecording).toHaveBeenCalledTimes(1);

		finish();
		await stopping;
		expect(recording.cloud).toBe(false);
		expect(recording.cloudPending).toBe(false);
		expect(recording.startedAt).toBeNull();
		expect(recording.error).toBeNull();
	});

	it('cannot record a prepared sermon again', async () => {
		const { studio } = await import('./state.svelte');
		studio.service.type = 'prepared';
		recording.cloud = false;
		const { startCloudRecording } = await import('./recording.svelte');
		await startCloudRecording();
		expect(controlCloudRecording).not.toHaveBeenCalled();
		studio.service.type = 'live';
	});

	it('requests a session-scoped stop for recordings started outside Studio', async () => {
		recording.cloud = false;
		controlCloudRecording.mockResolvedValue({ id: 'admin-recording', tailComplete: true });
		const session = { sessionId: 'session-id', sessionStartedAt: 1000 };

		await stopCloudRecording(session);

		expect(controlCloudRecording).toHaveBeenCalledWith('stop', session);
		expect(recording.savedId).toBe('admin-recording');
		expect(recording.error).toBeNull();
	});

	it('keeps the recording ID and warns when the ending could not be confirmed', async () => {
		controlCloudRecording.mockResolvedValue({ id: 'admin-recording', tailComplete: false });
		await stopCloudRecording({ sessionId: 'session-id', sessionStartedAt: 1000 });
		expect(recording.savedId).toBe('admin-recording');
		expect(recording.error).toContain('could not confirm the ending');
	});
});
