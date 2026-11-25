import { beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
	beginPublicRun,
	endSelectedSession,
	liveSession,
	refreshPublicDestinations,
	startPublicDestinations,
	type LiveSession
} from './live-session.svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const service: LiveSession = {
	_id: '0123456789abcdef01234567',
	slug: 'service',
	title: 'Service',
	scheduled_at: '2026-10-04T08:00:00Z',
	status: 'scheduled',
	youtube_url: 'https://www.youtube.com/watch?v=abcdefghijk'
};

let missionnaire: LiveSession['status'];
let youtube: string;
let fail: string | null;
let timeoutAfterChange: string | null;
let actions: string[];

beforeEach(() => {
	missionnaire = 'scheduled';
	youtube = 'ready';
	fail = null;
	timeoutAfterChange = null;
	actions = [];
	liveSession.publicRun = null;
	liveSession.activeId = null;
	liveSession.pairingCode = 'test';
	liveSession.selectedId = service._id;
	beginPublicRun(service);
	vi.mocked(invoke).mockImplementation(async (_, args) => {
		const { action } = JSON.parse((args as { body: string }).body);
		actions.push(action);
		if (action === fail) throw new Error('Connection dropped');
		if (action === 'session-status')
			return JSON.stringify({
				active: missionnaire === 'live',
				startedAt: service.scheduled_at,
				status: missionnaire
			});
		if (action === 'audio-status') return JSON.stringify({ reachable: true, sourceActive: true });
		if (action === 'broadcast-status') return JSON.stringify({ status: youtube });
		if (action === 'start') missionnaire = 'live';
		if (action === 'end') missionnaire = 'ended';
		if (action === 'go-live') youtube = 'live';
		if (action === 'end-live') youtube = 'complete';
		if (action === timeoutAfterChange) throw new Error('Timed out after provider applied change');
		return JSON.stringify({ status: youtube });
	});
});

it.each([
	['start', 'go-live', 'youtube'],
	['go-live', 'start', 'missionnaire']
] as const)(
	'retries %s while preserving the confirmed destination',
	async (failed, passed, healthy) => {
		fail = failed;
		await startPublicDestinations(() => true);
		expect(liveSession.publicDestinations[healthy].status).toBe('live');
		fail = null;
		await startPublicDestinations(() => true);
		expect(actions.filter((action) => action === passed)).toHaveLength(1);
		expect(actions.filter((action) => action === failed)).toHaveLength(2);
		expect(liveSession.publicDestinations.missionnaire.status).toBe('live');
		expect(liveSession.publicDestinations.youtube.status).toBe('live');
	}
);

it.each([
	['end', 'end-live', 'youtube'],
	['end-live', 'end', 'missionnaire']
] as const)('keeps the service recoverable when %s fails', async (failed, passed, healthy) => {
	await startPublicDestinations(() => true);
	fail = failed;
	await endSelectedSession();
	expect(liveSession.publicRun).toMatchObject({ id: service._id, ending: true });
	expect(liveSession.publicDestinations[healthy].status).toBe('ended');
	fail = null;
	await endSelectedSession();
	expect(actions.filter((action) => action === passed)).toHaveLength(1);
	expect(actions.filter((action) => action === failed)).toHaveLength(2);
	expect(liveSession.publicRun).toBeNull();
});

it('rechecks both destinations without changing them when recovering a service', async () => {
	missionnaire = 'live';
	youtube = 'liveStarting';
	await refreshPublicDestinations();
	expect(actions).toEqual(
		expect.arrayContaining(['session-status', 'broadcast-status', 'audio-status'])
	);
	expect(actions).toHaveLength(3);
	expect(liveSession.publicDestinations.missionnaire.status).toBe('live');
	expect(liveSession.publicDestinations.youtube.status).toBe('waiting');
});

it('never contacts YouTube when starting an operator-only test', async () => {
	liveSession.publicRun = null;
	beginPublicRun({ ...service, is_test: true });
	await startPublicDestinations(() => true);
	expect(actions).not.toContain('broadcast-status');
	expect(actions).not.toContain('go-live');
	expect(liveSession.publicDestinations.missionnaire.status).toBe('live');
});

it('accepts provider confirmation after the request times out', async () => {
	timeoutAfterChange = 'go-live';
	await startPublicDestinations(() => true);
	expect(liveSession.publicDestinations.youtube).toEqual({ status: 'live', error: null });
	timeoutAfterChange = 'end';
	await endSelectedSession();
	expect(liveSession.publicRun).toBeNull();
});
