import assert from 'node:assert/strict';
import test from 'node:test';
import { buildOperationalAlerts } from './operational-alerts';

const healthy = {
	broadcast: { is_live: true },
	icecast: { reachable: true, sourceActive: true },
	recorder: {
		available: true as const,
		recording: true,
		recovering: false,
		pendingOrphans: 0,
		segmentCount: 1
	},
	failedRecordings: 0
};

test('reports a live stream interruption as critical', () => {
	const alerts = buildOperationalAlerts({
		...healthy,
		icecast: { reachable: true, sourceActive: false }
	});
	assert.deepEqual(alerts, [{ id: 'broadcast-offline', severity: 'critical' }]);
});

test('reports automatic stream reconnection without duplicating the outage', () => {
	const alerts = buildOperationalAlerts({
		...healthy,
		icecast: { reachable: true, sourceActive: false },
		recorder: { ...healthy.recorder, sourceRecovering: true }
	});
	assert.deepEqual(alerts, [{ id: 'stream-reconnecting', severity: 'critical' }]);
});

test('raises recorder and missing recording alerts at the correct severity', () => {
	assert.deepEqual(buildOperationalAlerts({ ...healthy, recorder: { available: false } }), [
		{ id: 'recorder-unavailable', severity: 'critical' }
	]);
	assert.deepEqual(
		buildOperationalAlerts({ ...healthy, recorder: { ...healthy.recorder, recording: false } }),
		[{ id: 'live-not-recording', severity: 'warning' }]
	);
});

test('reports actionable idle and recording recovery states', () => {
	const alerts = buildOperationalAlerts({
		...healthy,
		broadcast: { is_live: false },
		recorder: { ...healthy.recorder, recovering: true, pendingOrphans: 2, segmentCount: 3 },
		failedRecordings: 1
	});
	assert.deepEqual(alerts, [
		{ id: 'stream-ready', severity: 'warning' },
		{ id: 'upload-recovery', severity: 'warning', count: 2 },
		{ id: 'stream-recovered', severity: 'recovery' },
		{ id: 'failed-recordings', severity: 'warning', count: 1 }
	]);
});

test('reports an unreachable streaming server while idle without duplicate recording alerts', () => {
	assert.deepEqual(
		buildOperationalAlerts({
			...healthy,
			broadcast: { is_live: false },
			icecast: { reachable: false, sourceActive: false },
			recorder: { ...healthy.recorder, recording: false }
		}),
		[{ id: 'streaming-server-unavailable', severity: 'warning' }]
	);
});
