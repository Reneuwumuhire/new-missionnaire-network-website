import { afterEach, expect, it, vi } from 'vitest';

const { invoke, getPublicSessionStatus, liveSession } = vi.hoisted(() => ({
	invoke: vi.fn(),
	getPublicSessionStatus: vi.fn(),
	liveSession: { publicRun: null as { id: string; ending: boolean } | null }
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('./live-session.svelte', () => ({
	liveSession,
	currentStudioSessionTitle: () => 'Sunday service',
	getPublicSessionStatus,
	markPublicEnding: () => {},
	endSelectedSession: () => {}
}));
vi.mock('./state.svelte', () => ({
	studio: { settings: { recordingMode: 'local', recordingFormat: 'audio', fps: 30 } }
}));

import {
	checkPublicBroadcastEnd,
	manualRecording,
	stopBroadcast,
	toggleManualRecording
} from './broadcast.svelte';

class Capture extends EventTarget {
	static isTypeSupported = () => true;
	state = 'inactive';
	ondataavailable?: (event: { data: Blob }) => void;
	start() {
		this.state = 'recording';
	}
	stop() {
		this.state = 'inactive';
		this.ondataavailable?.({ data: new Blob(['last audio chunk']) });
		this.dispatchEvent(new Event('stop'));
	}
}

afterEach(() => {
	liveSession.publicRun = null;
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	invoke.mockReset();
	getPublicSessionStatus.mockReset();
});

it.each(['Studio', 'Admin'])('finishes a local recording when %s ends the live', async (origin) => {
	vi.stubGlobal('MediaRecorder', Capture);
	const track = { stop: vi.fn() };
	const canvas = { captureStream: () => ({ getVideoTracks: () => [track], addTrack: vi.fn() }) };
	let encoderStarted!: (result: { localRecordingPath: string; runId: number }) => void;
	invoke
		.mockResolvedValue(undefined)
		.mockReturnValueOnce(new Promise((resolve) => (encoderStarted = resolve)));
	const path = '/Movies/Missionnaire Studio/Sunday service.mp3';
	const starting = toggleManualRecording(canvas as never, {} as MediaStreamTrack);
	liveSession.publicRun = { id: 'live-id', ending: false };
	getPublicSessionStatus.mockResolvedValue({ active: false, status: 'ended' });
	const stopping = origin === 'Studio' ? stopBroadcast() : checkPublicBroadcastEnd();
	encoderStarted({ localRecordingPath: path, runId: 12 });
	await Promise.all([starting, stopping]);

	const localStop = invoke.mock.calls.findIndex(
		([command, args]) => command === 'stop_stream' && args.group === 'recording'
	);
	const finalChunk = invoke.mock.calls.findIndex(([command]) => command === 'push_chunk');
	expect(finalChunk).toBeGreaterThan(0);
	expect(localStop).toBeGreaterThan(finalChunk);
	expect(
		invoke.mock.calls.filter(
			([command, args]) => command === 'stop_stream' && args.group === 'recording'
		)
	).toHaveLength(1);
	expect(track.stop).toHaveBeenCalledOnce();
	expect(manualRecording.active).toBe(false);
	expect(manualRecording.path).toBe(path);
});
