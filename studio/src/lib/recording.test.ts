import { beforeEach, describe, expect, it, vi } from 'vitest';

const controlCloudRecording = vi.hoisted(() => vi.fn());

vi.mock('./live-session.svelte', () => ({ controlCloudRecording }));
vi.mock('./state.svelte', () => ({
	studio: { settings: { recordingMode: 'cloud' } }
}));

import { recording, stopCloudRecording } from './recording.svelte';

describe('cloud recording controls', () => {
	beforeEach(() => {
		controlCloudRecording.mockReset();
		recording.cloud = true;
		recording.cloudPending = false;
		recording.error = null;
		recording.localPath = null;
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
});
