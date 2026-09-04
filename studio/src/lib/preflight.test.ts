import { describe, expect, it } from 'vitest';
import { destinationProblem, evaluatePreflight, requiredRecordingBytes } from './preflight';

const ready = {
	hasSession: true,
	destinationCount: 1,
	invalidDestinations: [],
	isOnline: true,
	recorderSupported: true,
	encoderReady: true,
	canvasReady: true,
	failedSources: [],
	missingSources: [],
	audioConfigured: true,
	audioConnected: true,
	audioMuted: false,
	audioPeak: 0.1,
	renderFps: 30,
	targetFps: 30,
	adminRequired: true,
	adminConnected: true,
	missionnaireRequired: true,
	missionnaireReady: true,
	youtubeRequired: false,
	youtubeConnected: false,
	localRecording: false,
	availableRecordingBytes: null,
	requiredRecordingBytes: requiredRecordingBytes(4500, 160)
};

describe('preflight', () => {
	it('passes a ready show', () => {
		expect(evaluatePreflight(ready).every(({ level }) => level === 'pass')).toBe(true);
	});

	it('blocks definite failures but permits silence as a warning', () => {
		const checks = evaluatePreflight({
			...ready,
			hasSession: false,
			failedSources: ['Camera'],
			audioPeak: 0
		});
		expect(checks.find(({ id }) => id === 'session')?.level).toBe('block');
		expect(checks.find(({ id }) => id === 'sources')?.level).toBe('block');
		expect(checks.find(({ id }) => id === 'audio')?.level).toBe('warning');
	});

	it('validates RTMP destinations without exposing stream keys', () => {
		expect(destinationProblem('rtmps://example.test/live/key')).toBeNull();
		expect(destinationProblem('https://example.test/live')).toBe('scheme');
		expect(destinationProblem('rtmp://example.test/live/bad key')).toBe('characters');
	});

	it('blocks a local recording that cannot fit a two-hour service', () => {
		const needed = requiredRecordingBytes(6000, 160);
		const checks = evaluatePreflight({
			...ready,
			localRecording: true,
			availableRecordingBytes: needed - 1,
			requiredRecordingBytes: needed
		});
		expect(checks.find(({ id }) => id === 'storage')?.level).toBe('block');
	});
});
