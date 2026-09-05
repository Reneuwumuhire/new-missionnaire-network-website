import { describe, expect, it, vi } from 'vitest';

vi.mock('./live-session.svelte', () => ({
	hideLiveLyrics: vi.fn(),
	syncLiveLyrics: vi.fn(),
	syncServiceWorkflow: vi.fn()
}));
vi.mock('./media.svelte', () => ({ handleFor: vi.fn() }));
vi.mock('./recording.svelte', () => ({
	markProgrammeRecordingStarted: vi.fn(),
	recording: { error: null, localPath: null },
	startCloudRecording: vi.fn(),
	stopCloudRecording: vi.fn()
}));
vi.mock('./lyrics.svelte', () => ({
	clearSync: vi.fn(),
	followMedia: vi.fn(),
	lyrics: { cues: [], onAir: false, anchorEpochMs: null }
}));
vi.mock('./state.svelte', () => ({
	persist: vi.fn(),
	studio: {
		scenes: [],
		audioSources: [],
		settings: { recordingMode: 'off' },
		service: { type: 'prepared', phase: 'ready' }
	}
}));

import { nextPreparedPhase } from './service-workflow.svelte';

describe('prepared programme progression', () => {
	it('advances only the media item that owns the current phase', () => {
		expect(nextPreparedPhase('opening', 'opening')).toBe('sermon');
		expect(nextPreparedPhase('sermon', 'sermon')).toBe('closing');
		expect(nextPreparedPhase('closing', 'closing')).toBe('complete');
	});

	it('ignores duplicate and stale ended events', () => {
		expect(nextPreparedPhase('sermon', 'opening')).toBeNull();
		expect(nextPreparedPhase('complete', 'closing')).toBeNull();
		expect(nextPreparedPhase('ready', 'ready')).toBeNull();
	});
});
