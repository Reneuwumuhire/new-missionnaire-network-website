export type OperationalAlertSeverity = 'critical' | 'warning' | 'recovery';

export type OperationalAlertId =
	| 'broadcast-offline'
	| 'streaming-server-unavailable'
	| 'stream-reconnecting'
	| 'recorder-unavailable'
	| 'live-not-recording'
	| 'stream-ready'
	| 'upload-recovery'
	| 'failed-recordings'
	| 'stream-recovered'
	| 'monitor-unavailable'
	| 'systems-recovered';

export type OperationalAlert = {
	id: OperationalAlertId;
	severity: OperationalAlertSeverity;
	count?: number;
};

type OperationalState = {
	broadcast: { is_live: boolean };
	icecast: { reachable: boolean; sourceActive: boolean };
	recorder:
		| {
				available: true;
				recording: boolean;
				recovering: boolean;
				sourceRecovering?: boolean;
				segmentCount?: number;
				pendingOrphans: number;
		  }
		| { available: false };
	failedRecordings: number;
};

export function buildOperationalAlerts(state: OperationalState): OperationalAlert[] {
	const alerts: OperationalAlert[] = [];
	const { broadcast, icecast, recorder } = state;

	if (broadcast.is_live && !icecast.sourceActive) {
		alerts.push({
			id:
				recorder.available && recorder.sourceRecovering
					? 'stream-reconnecting'
					: 'broadcast-offline',
			severity: 'critical'
		});
	} else if (!icecast.reachable) {
		alerts.push({ id: 'streaming-server-unavailable', severity: 'warning' });
	} else if (!broadcast.is_live && icecast.sourceActive) {
		alerts.push({ id: 'stream-ready', severity: 'warning' });
	}

	if (!recorder.available) {
		alerts.push({
			id: 'recorder-unavailable',
			severity: broadcast.is_live ? 'critical' : 'warning'
		});
	} else {
		if (broadcast.is_live && icecast.sourceActive && !recorder.recording) {
			alerts.push({ id: 'live-not-recording', severity: 'warning' });
		}
		if (recorder.recovering || recorder.pendingOrphans > 0) {
			alerts.push({
				id: 'upload-recovery',
				severity: 'warning',
				count: recorder.pendingOrphans
			});
		}
		if (recorder.recording && !recorder.sourceRecovering && (recorder.segmentCount ?? 1) > 1) {
			alerts.push({ id: 'stream-recovered', severity: 'recovery' });
		}
	}

	if (state.failedRecordings > 0) {
		alerts.push({
			id: 'failed-recordings',
			severity: 'warning',
			count: state.failedRecordings
		});
	}

	return alerts;
}
