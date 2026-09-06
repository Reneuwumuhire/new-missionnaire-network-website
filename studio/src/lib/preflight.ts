export type PreflightLevel = 'pass' | 'warning' | 'block';

export type PreflightCheckId =
	| 'session'
	| 'destination'
	| 'network'
	| 'encoder'
	| 'canvas'
	| 'sources'
	| 'audio'
	| 'rendering'
	| 'admin'
	| 'missionnaire'
	| 'youtube'
	| 'service'
	| 'storage';

export interface PreflightCheck {
	id: PreflightCheckId;
	level: PreflightLevel;
	detail?: string;
}

export interface PreflightInput {
	hasSession: boolean;
	destinationCount: number;
	invalidDestinations: string[];
	isOnline: boolean;
	recorderSupported: boolean;
	encoderReady: boolean | null;
	canvasReady: boolean;
	failedSources: string[];
	missingSources: string[];
	audioConfigured: boolean;
	audioConnected: boolean;
	audioMuted: boolean;
	audioPeak: number;
	renderFps: number;
	targetFps: number;
	adminRequired: boolean;
	adminConnected: boolean;
	missionnaireRequired: boolean;
	missionnaireReady: boolean;
	youtubeRequired: boolean;
	youtubeConnected: boolean;
	localRecording: boolean;
	availableRecordingBytes: number | null;
	requiredRecordingBytes: number;
	serviceMissing: string[];
}

export function destinationProblem(url: string): 'missing' | 'scheme' | 'characters' | null {
	const value = url.trim();
	if (!value) return 'missing';
	if (!/^rtmps?:\/\//.test(value)) return 'scheme';
	if (/[|[\]'"\\\s]/.test(value)) return 'characters';
	return null;
}

export function requiredRecordingBytes(
	videoBitrateKbps: number,
	audioBitrateKbps: number,
	hours = 2
): number {
	return Math.ceil(((videoBitrateKbps + audioBitrateKbps) * 1000 * hours * 3600 * 1.2) / 8);
}

export function evaluatePreflight(input: PreflightInput): PreflightCheck[] {
	const checks: PreflightCheck[] = [
		{ id: 'session', level: input.hasSession ? 'pass' : 'block' },
		{
			id: 'destination',
			level:
				input.invalidDestinations.length > 0 || input.destinationCount === 0 ? 'block' : 'pass',
			detail: input.invalidDestinations.join(', ') || undefined
		},
		{ id: 'network', level: input.isOnline ? 'pass' : 'block' },
		{
			id: 'service',
			level: input.serviceMissing.length ? 'block' : 'pass',
			detail: input.serviceMissing.join(', ') || undefined
		},
		{
			id: 'encoder',
			level:
				input.encoderReady === null
					? 'block'
					: input.encoderReady && input.recorderSupported
						? 'pass'
						: 'block'
		},
		{ id: 'canvas', level: input.canvasReady ? 'pass' : 'block' },
		{
			id: 'sources',
			level:
				input.failedSources.length > 0
					? 'block'
					: input.missingSources.length > 0
						? 'warning'
						: 'pass',
			detail: [...input.failedSources, ...input.missingSources].join(', ') || undefined
		},
		{
			id: 'audio',
			level:
				!input.audioConfigured ||
				!input.audioConnected ||
				input.audioMuted ||
				input.audioPeak < 0.001
					? 'warning'
					: 'pass'
		},
		{
			id: 'rendering',
			level:
				input.renderFps === 0 || input.renderFps < Math.max(1, input.targetFps - 5)
					? 'warning'
					: 'pass',
			detail: `${input.renderFps}/${input.targetFps}`
		},
		{
			id: 'admin',
			level: input.adminRequired && !input.adminConnected ? 'block' : 'pass'
		},
		{
			id: 'missionnaire',
			level: input.missionnaireRequired && !input.missionnaireReady ? 'block' : 'pass'
		},
		{
			id: 'youtube',
			level: input.youtubeRequired && !input.youtubeConnected ? 'block' : 'pass'
		}
	];

	if (input.localRecording) {
		checks.push({
			id: 'storage',
			level:
				input.availableRecordingBytes === null
					? 'warning'
					: input.availableRecordingBytes < input.requiredRecordingBytes
						? 'block'
						: 'pass'
		});
	}

	return checks;
}
