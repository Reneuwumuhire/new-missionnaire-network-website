import { invoke } from '@tauri-apps/api/core';
import { followedMediaElement, lyrics } from './lyrics.svelte';
import { t } from './i18n.svelte';
import { id, persist, studio } from './state.svelte';
import {
	publicDestinationReady,
	reconcilePublicDestination,
	youtubePublicStatus,
	type PublicStatus
} from './public-destinations';
import {
	outputAlignedPositionMs,
	outputEpochMs,
	sampleServerClock,
	serverEpochMs
} from './stream-clock';

export type LiveSession = {
	_id: string;
	slug: string;
	title: string;
	scheduled_at: string;
	status: 'scheduled' | 'live' | 'ended' | 'cancelled';
	youtube_url?: string | null;
	youtube_channel_id?: string | null;
	youtube_channel_title?: string | null;
	description?: string | null;
	thumbnail_url?: string | null;
	thumbnail_s3_key?: string | null;
	privacy_status?: 'private' | 'unlisted' | 'public';
	made_for_kids?: boolean;
	reminder_enabled?: boolean;
	notify_on_start?: boolean;
	live_ended_at?: string | null;
	is_test?: boolean;
	service_type?: 'prepared' | 'live';
	active_phase?: 'ready' | 'opening' | 'sermon' | 'closing' | 'complete';
	sermon_start_ms?: number | null;
	sermon_end_ms?: number | null;
};
export type YouTubeChannel = { id: string; title: string; updatedAt: string };

export function youtubeChannelsFromStatus(status: {
	channels?: YouTubeChannel[];
	connected?: boolean;
	channelTitle?: string | null;
}): YouTubeChannel[] {
	if (Array.isArray(status.channels)) return status.channels;
	return status.connected && status.channelTitle
		? [{ id: `legacy:${status.channelTitle}`, title: status.channelTitle, updatedAt: '' }]
		: [];
}

export function sessionYouTubeChannelId(
	session: Pick<LiveSession, 'youtube_channel_id'> | null | undefined,
	channels: YouTubeChannel[]
): string | null {
	return session?.youtube_channel_id ?? (channels.length === 1 ? channels[0].id : null);
}

export type NewSession = {
	serviceType: 'prepared' | 'live';
	title: string;
	scheduledAt: string;
	description: string;
	privacyStatus: 'private' | 'unlisted' | 'public';
	madeForKids: boolean;
	thumbnail: File | null;
	thumbnailUrl: string | null;
	thumbnailKey: string | null;
	subtitle: File | null;
	announce: boolean;
	reminderEnabled: boolean;
	notifyOnStart: boolean;
	youtubeChannelId: string;
};

export function reusableSessionDraft(session: LiveSession): NewSession {
	return {
		serviceType: session.service_type === 'live' ? 'live' : 'prepared',
		title: session.title,
		scheduledAt: '',
		description: session.description ?? '',
		privacyStatus: session.privacy_status ?? 'public',
		madeForKids: session.made_for_kids === true,
		thumbnail: null,
		thumbnailUrl: session.thumbnail_url ?? null,
		thumbnailKey: session.thumbnail_s3_key ?? null,
		subtitle: null,
		announce: false,
		reminderEnabled: session.reminder_enabled === true,
		notifyOnStart: session.notify_on_start === true,
		youtubeChannelId: session.youtube_channel_id ?? ''
	};
}

type YouTubeIngest = { url: string; key: string };
type MissionnaireIngest = YouTubeIngest & { expiresAt: string };
type StudioDeviceInfo = {
	os: string;
	architecture: string;
	username: string;
	deviceName: string;
	appVersion: string;
	installationId: string;
};

let deviceInfoPromise: Promise<StudioDeviceInfo> | null = null;
let youtubeStatusRequest = 0;
const AUTH_STORAGE_KEY = 'missionnaire-studio-authorization-v1';
const PUBLIC_RUN_KEY = 'missionnaire-studio-public-run';
const INSTALLATION_STORAGE_KEY = 'missionnaire-studio-installation-v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PublicRun = { id: string; title: string; isTest: boolean; youtube: boolean; ending: boolean };

function restorePublicRun(): PublicRun | null {
	try {
		const value = JSON.parse(localStorage.getItem(PUBLIC_RUN_KEY) ?? 'null');
		if (
			value &&
			typeof value.id === 'string' &&
			/^[\da-f]{24}$/i.test(value.id) &&
			typeof value.title === 'string' &&
			typeof value.isTest === 'boolean' &&
			typeof value.youtube === 'boolean' &&
			typeof value.ending === 'boolean'
		) {
			return value;
		}
	} catch {
		// Studio can still broadcast when local storage is unavailable.
	}
	return null;
}

function savePublicRun(run: PublicRun | null) {
	liveSession.publicRun = run;
	try {
		if (run) localStorage.setItem(PUBLIC_RUN_KEY, JSON.stringify(run));
		else localStorage.removeItem(PUBLIC_RUN_KEY);
	} catch {
		// Current in-memory progress remains usable.
	}
}

type AuthorizationStorage = Pick<Storage, 'getItem'>;

export function restoreStudioAuthorization(storage: AuthorizationStorage): string | null {
	try {
		const code = storage.getItem(AUTH_STORAGE_KEY);
		return code && UUID_PATTERN.test(code) ? code : null;
	} catch {
		return null;
	}
}

function studioInstallationId(): string {
	if (typeof localStorage !== 'undefined') {
		try {
			const saved = localStorage.getItem(INSTALLATION_STORAGE_KEY);
			if (saved && UUID_PATTERN.test(saved)) return saved;
			const created = crypto.randomUUID();
			localStorage.setItem(INSTALLATION_STORAGE_KEY, created);
			return created;
		} catch {
			// A stable id is helpful, not required for broadcasting.
		}
	}
	return crypto.randomUUID();
}

function saveStudioAuthorization(code: string | null) {
	if (typeof localStorage === 'undefined') return;
	try {
		if (code) localStorage.setItem(AUTH_STORAGE_KEY, code);
		else localStorage.removeItem(AUTH_STORAGE_KEY);
	} catch {
		// Storage failure leaves the current session usable until Studio closes.
	}
}

export function isLatestStatusRequest(request: number, latest: number): boolean {
	return request === latest;
}

export function studioDeviceInfo() {
	deviceInfoPromise ??= invoke<Omit<StudioDeviceInfo, 'installationId'>>('studio_device_info')
		.then((device) => ({ ...device, installationId: studioInstallationId() }))
		.catch((error) => {
			deviceInfoPromise = null;
			throw error;
		});
	return deviceInfoPromise;
}

export const liveSession = $state({
	sessions: [] as LiveSession[],
	previousSessions: [] as LiveSession[],
	selectedId: null as string | null,
	activeId: null as string | null,
	activeStartedAt: null as number | null,
	publicRun: restorePublicRun(),
	publicBusy: false,
	publicDestinations: {
		missionnaire: { status: 'unknown' as PublicStatus, error: null as string | null },
		youtube: { status: 'unknown' as PublicStatus, error: null as string | null }
	},
	error: null as string | null,
	pairingCode:
		typeof localStorage === 'undefined' ? null : restoreStudioAuthorization(localStorage),
	operatorName: null as string | null,
	testUrl: null as string | null,
	youtubeConnected: false,
	youtubeChannel: null as string | null,
	youtubeChannelId: null as string | null,
	youtubeChannels: [] as YouTubeChannel[],
	youtubeConnecting: false,
	youtubeError: null as string | null,
	missionnaireReady: false,
	missionnaireError: null as string | null,
	/** An SRT is prepared before the service starts, then attached as soon as
	 * the selected public session is live. */
	subtitleStatus: 'idle' as 'idle' | 'uploading' | 'uploaded' | 'attached' | 'synced' | 'error'
});

export function currentStudioSession() {
	const id = liveSession.publicRun?.id ?? liveSession.activeId ?? liveSession.selectedId;
	return liveSession.sessions.find((session) => session._id === id);
}

export function currentStudioSessionTitle() {
	return currentStudioSession()?.title || liveSession.publicRun?.title;
}

async function post<T>(body: object): Promise<T> {
	if (!liveSession.pairingCode) throw new Error('Continue with admin first.');
	return JSON.parse(
		await invoke<string>('studio_live_post', {
			body: JSON.stringify(body),
			authorization: liveSession.pairingCode,
			baseUrl: studio.settings.mainSiteUrl
		})
	) as T;
}

async function adminPost<T>(body: object): Promise<T> {
	if (!liveSession.pairingCode) throw new Error('Continue with admin first.');
	return JSON.parse(
		await invoke<string>('studio_youtube_post', {
			body: JSON.stringify(body),
			authorization: liveSession.pairingCode,
			adminUrl: studio.settings.adminSiteUrl
		})
	) as T;
}

export type RecordingSession = { sessionId: string; sessionStartedAt: number };

export function controlCloudRecording(action: 'start' | 'stop', session?: RecordingSession) {
	return adminPost<{ id: string | null; tailComplete?: boolean; stopped?: boolean }>({
		action: session && action === 'stop' ? 'recorder-stop-session' : `recorder-${action}`,
		...session
	});
}

export function missionnaireAudioStatus() {
	return adminPost<{ reachable: boolean; sourceActive: boolean }>({ action: 'audio-status' });
}

function applyMissionnaireIngest(ingest: MissionnaireIngest) {
	let destination = studio.destinations.find(
		(item) => item.platform === 'missionnaire' && item.managed
	);
	if (!destination) {
		destination = {
			id: id(),
			name: 'Missionnaire (app + radio)',
			url: ingest.url,
			key: ingest.key,
			enabled: true,
			platform: 'missionnaire',
			managed: true,
			hold: false
		};
		studio.destinations = [...studio.destinations, destination];
	} else {
		destination.url = ingest.url;
		destination.key = ingest.key;
		destination.enabled = true;
		destination.hold = false;
	}
	// Retire the exact localhost/obs placeholder shipped by earlier builds.
	for (const item of studio.destinations) {
		if (
			item !== destination &&
			item.platform === 'missionnaire' &&
			item.url === 'rtmp://localhost:1935/live' &&
			item.key === 'obs'
		) {
			item.enabled = false;
		}
	}
	persist();
}

function disableManagedMissionnaire() {
	const destination = studio.destinations.find(
		(item) => item.platform === 'missionnaire' && item.managed
	);
	if (!destination) return;
	destination.enabled = false;
	destination.key = '';
	persist();
}

function applyYouTubeIngest(ingest: YouTubeIngest, channel: YouTubeChannel) {
	let destination = studio.destinations.find((item) => item.platform === 'youtube' && item.managed);
	if (!destination) {
		destination = {
			id: id(),
			name: `YouTube · ${channel.title}`,
			url: ingest.url,
			key: ingest.key,
			enabled: true,
			platform: 'youtube',
			managed: true,
			hold: false
		};
		studio.destinations = [...studio.destinations, destination];
	} else {
		destination.name = `YouTube · ${channel.title}`;
		destination.url = ingest.url;
		destination.key = ingest.key;
		destination.enabled = true;
		destination.hold = false;
	}
	persist();
}

function disableManagedYouTube() {
	const destination = studio.destinations.find(
		(item) => item.platform === 'youtube' && item.managed
	);
	if (!destination) return;
	destination.enabled = false;
	destination.key = '';
	persist();
}

export function selectYouTubeChannel(channelId: string | null) {
	const channel = liveSession.youtubeChannels.find((item) => item.id === channelId) ?? null;
	liveSession.youtubeChannelId = channel?.id ?? null;
	liveSession.youtubeChannel = channel?.title ?? null;
}

export async function connectWithAdmin() {
	if (!liveSession.pairingCode) {
		liveSession.pairingCode = crypto.randomUUID();
		saveStudioAuthorization(liveSession.pairingCode);
	}
	await invoke('studio_open_login', {
		code: liveSession.pairingCode,
		adminUrl: studio.settings.adminSiteUrl
	});
	// The browser completes approval; this short poll detects it and brings
	// Studio forward without asking the operator to switch applications back.
	for (let i = 0; i < 20; i++) {
		await new Promise((resolve) => setTimeout(resolve, 1500));
		await refreshSessions();
		if (!liveSession.error) {
			await invoke('focus_main_window');
			return;
		}
	}
}

export async function refreshYouTubeStatus() {
	const request = ++youtubeStatusRequest;
	try {
		const deviceInfo = await studioDeviceInfo().catch(() => null);
		const result = await adminPost<{
			channels?: YouTubeChannel[];
			connected?: boolean;
			channelTitle?: string | null;
			missionnaireIngest?: MissionnaireIngest | null;
			missionnaireError?: string | null;
		}>({
			action: 'status',
			deviceInfo
		});
		// Re-approval revokes the previous managed ingest key. Ignore any older,
		// slower response that arrives after the fresh credential.
		if (!isLatestStatusRequest(request, youtubeStatusRequest)) return;
		const channels = youtubeChannelsFromStatus(result);
		liveSession.youtubeChannels = channels;
		liveSession.youtubeConnected = channels.length > 0;
		selectYouTubeChannel(
			channels.some((channel) => channel.id === liveSession.youtubeChannelId)
				? liveSession.youtubeChannelId
				: (channels[0]?.id ?? null)
		);
		if (result.missionnaireIngest) {
			applyMissionnaireIngest(result.missionnaireIngest);
			liveSession.missionnaireReady = true;
			liveSession.missionnaireError = null;
		} else {
			disableManagedMissionnaire();
			liveSession.missionnaireReady = false;
			liveSession.missionnaireError =
				result.missionnaireError ?? 'Missionnaire broadcast is unavailable.';
		}
		liveSession.youtubeError = null;
	} catch (error) {
		if (!isLatestStatusRequest(request, youtubeStatusRequest)) return;
		liveSession.youtubeConnected = false;
		liveSession.youtubeChannels = [];
		selectYouTubeChannel(null);
		liveSession.youtubeError = error instanceof Error ? error.message : String(error);
		disableManagedMissionnaire();
		liveSession.missionnaireReady = false;
		liveSession.missionnaireError = liveSession.youtubeError;
	}
}

export async function heartbeatStudio() {
	if (!liveSession.pairingCode || !liveSession.operatorName) return;
	const deviceInfo = await studioDeviceInfo().catch(() => null);
	await adminPost({ action: 'heartbeat', deviceInfo }).catch(() => undefined);
}

export async function connectYouTube(): Promise<string | null> {
	if (!liveSession.pairingCode || liveSession.youtubeConnecting) return null;
	liveSession.youtubeConnecting = true;
	liveSession.youtubeError = null;
	const before = new Map(
		liveSession.youtubeChannels.map((channel) => [channel.id, channel.updatedAt] as const)
	);
	try {
		await invoke('studio_open_youtube_login', {
			code: liveSession.pairingCode,
			adminUrl: studio.settings.adminSiteUrl
		});
		for (let i = 0; i < 40; i++) {
			await new Promise((resolve) => setTimeout(resolve, 1500));
			await refreshYouTubeStatus();
			const connected = liveSession.youtubeChannels.find(
				(channel) => before.get(channel.id) !== channel.updatedAt
			);
			if (connected) {
				selectYouTubeChannel(connected.id);
				await invoke('focus_main_window');
				return connected.id;
			}
		}
		liveSession.youtubeError = 'YouTube connection timed out. Try again.';
		return null;
	} finally {
		liveSession.youtubeConnecting = false;
	}
}

export async function disconnectYouTube(channelId: string) {
	try {
		await adminPost({ action: 'disconnect', channelId });
		if (liveSession.youtubeChannelId === channelId) disableManagedYouTube();
		await refreshYouTubeStatus();
	} catch (error) {
		liveSession.youtubeError = error instanceof Error ? error.message : String(error);
	}
}

async function goLiveYouTube(sessionId: string, canChange: () => boolean) {
	for (let attempt = 0; attempt < 45 && canChange(); attempt++) {
		const { status } = await adminPost<{ status: string }>({
			action: 'go-live',
			sessionId
		});
		if (status === 'live') return;
		if (!['testStarting', 'testing', 'liveStarting'].includes(status)) {
			throw new Error(`YouTube cannot go live (${status}).`);
		}
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
	if (!canChange()) return;
	throw new Error(
		'YouTube is still preparing after 90 seconds. Check YouTube Studio and try again.'
	);
}

async function upload(file: File, action: 'presign-thumbnail' | 'presign-subtitle') {
	const signed = await adminPost<{
		uploadUrl: string;
		key: string;
		publicUrl: string;
		contentType?: string;
	}>({
		action,
		filename: file.name,
		contentType: file.type,
		size: file.size
	});
	const response = await fetch(signed.uploadUrl, {
		method: 'PUT',
		headers: { 'Content-Type': signed.contentType ?? file.type },
		body: file
	});
	if (!response.ok) throw new Error(`Upload failed (${response.status})`);
	return { url: signed.publicUrl, key: signed.key };
}

let uploadedSubtitle: { text: string; url: string; key: string } | null = null;
let subtitleUpload: Promise<{ url: string; key: string }> | null = null;
let attachedSessionId: string | null = null;
let attachedSubtitleKey: string | null = null;

export function subtitleNeedsAttach(
	sessionId: string,
	subtitleKey: string,
	attachedSession: string | null,
	attachedKey: string | null
) {
	return sessionId !== attachedSession || subtitleKey !== attachedKey;
}

export function subtitleSyncAction(needsAttach: boolean, hasTimingSource: boolean) {
	return hasTimingSource ? 'sync' : needsAttach ? 'attach' : null;
}

async function ensureTimedSubtitle() {
	if (uploadedSubtitle?.text === lyrics.srtText) return uploadedSubtitle;
	if (!subtitleUpload) {
		const text = lyrics.srtText;
		const file = new File(
			[text],
			lyrics.fileName.toLowerCase().endsWith('.srt') ? lyrics.fileName : 'studio.srt',
			{ type: 'text/plain' }
		);
		subtitleUpload = upload(file, 'presign-subtitle')
			.then((result) => {
				uploadedSubtitle = { text, ...result };
				return result;
			})
			.finally(() => (subtitleUpload = null));
	}
	return subtitleUpload;
}

/** Upload the selected SRT while the service is being prepared. It is attached
 * to the selected broadcast as soon as that broadcast is live. */
export async function prepareLiveSubtitles(): Promise<boolean> {
	if (lyrics.mode !== 'timed' || !lyrics.srtText || lyrics.cues.length === 0) return false;
	liveSession.subtitleStatus = 'uploading';
	try {
		await ensureTimedSubtitle();
		liveSession.subtitleStatus = 'uploaded';
		liveSession.error = null;
		return true;
	} catch (error) {
		liveSession.subtitleStatus = 'error';
		liveSession.error = error instanceof Error ? error.message : String(error);
		return false;
	}
}

/** Publish the same timed lyrics Studio is drawing into the video to the
 * audio-only website. The media clock is authoritative for play/pause/seek. */
export async function syncLiveLyrics(): Promise<boolean> {
	if (
		!liveSession.activeId ||
		lyrics.mode !== 'timed' ||
		!lyrics.srtText ||
		lyrics.cues.length === 0
	)
		return false;
	try {
		const media = followedMediaElement(true);
		const uploaded = await ensureTimedSubtitle();
		const attach = subtitleNeedsAttach(
			liveSession.activeId,
			uploaded.key,
			attachedSessionId,
			attachedSubtitleKey
		);
		const action = subtitleSyncAction(attach, Boolean(media || lyrics.anchorEpochMs !== null));
		// Keep a newly loaded SRT attached to the live immediately. Its clock stays
		// closed until the matcher, media source, or operator establishes timing.
		if (action === 'attach') {
			await post({
				action: 'attach-subtitles',
				sessionId: liveSession.activeId,
				subtitleUrl: uploaded.url,
				subtitleKey: uploaded.key,
				subtitleFilename: lyrics.fileName
			});
			attachedSessionId = liveSession.activeId;
			attachedSubtitleKey = uploaded.key;
			liveSession.subtitleStatus = 'attached';
			return true;
		}
		if (!action) return true;
		const sampledAtMs = Date.now();
		const sourcePositionMs = media
			? Math.round(media.currentTime * 1000)
			: Math.max(0, sampledAtMs - (lyrics.anchorEpochMs ?? sampledAtMs));
		const paused = media ? media.paused : lyrics.anchorEpochMs === null;
		// Once paused, publish the final source position; by the website's next
		// poll the queued audio has drained and that is the position it must hold.
		const positionMs = paused
			? sourcePositionMs
			: outputAlignedPositionMs(sourcePositionMs, sampledAtMs);
		await post({
			action: 'sync-subtitles',
			sessionId: liveSession.activeId,
			positionMs,
			offsetMs: lyrics.offsetMs,
			// Server clock + ffmpeg's output position keep the sidecar text on the
			// audio users actually receive, even when Studio is encoding behind.
			atEpochMs: serverEpochMs(sampledAtMs),
			paused,
			...(attach
				? {
						subtitleUrl: uploaded.url,
						subtitleKey: uploaded.key,
						subtitleFilename: lyrics.fileName
					}
				: {})
		});
		attachedSessionId = liveSession.activeId;
		attachedSubtitleKey = uploaded.key;
		liveSession.subtitleStatus = 'synced';
		return true;
	} catch (error) {
		liveSession.subtitleStatus = 'error';
		liveSession.error = error instanceof Error ? error.message : String(error);
		return false;
	}
}

/** Keep an attached SRT ready for a later automatic/manual lock without
 * exposing it to listeners during songs or a lost source. */
export async function hideLiveLyrics() {
	if (!liveSession.activeId) return;
	try {
		await post({
			action: 'hide-subtitles',
			sessionId: liveSession.activeId,
			atEpochMs: serverEpochMs(outputEpochMs())
		});
	} catch (error) {
		liveSession.error = error instanceof Error ? error.message : String(error);
	}
}

export async function syncServiceWorkflow() {
	if (!liveSession.activeId) return;
	try {
		await post({
			action: 'workflow',
			sessionId: liveSession.activeId,
			phase: studio.service.phase,
			sermonStartMs:
				studio.service.sermonStartedAt === null
					? null
					: Math.max(0, studio.service.sermonStartedAt + studio.service.markerCorrectionMs),
			sermonEndMs: studio.service.sermonEndedAt,
			subtitleTimingLanguage: studio.service.subtitleTimingLanguage
		});
	} catch (error) {
		liveSession.error = error instanceof Error ? error.message : String(error);
	}
}

export async function createSession(draft: NewSession) {
	liveSession.error = null;
	try {
		const channel = liveSession.youtubeChannels.find((item) => item.id === draft.youtubeChannelId);
		if (!channel) throw new Error('Choose a connected YouTube channel.');
		const thumbnail = draft.thumbnail
			? await upload(draft.thumbnail, 'presign-thumbnail')
			: { url: draft.thumbnailUrl, key: draft.thumbnailKey };
		const subtitle = draft.subtitle ? await upload(draft.subtitle, 'presign-subtitle') : null;
		const result = await adminPost<{
			session: LiveSession;
			youtubeUrl: string;
			ingest: YouTubeIngest;
		}>({
			action: 'schedule',
			title: draft.title,
			scheduledAt: new Date(draft.scheduledAt).toISOString(),
			description: draft.description,
			privacyStatus: draft.privacyStatus,
			madeForKids: draft.madeForKids,
			announce: draft.announce,
			reminderEnabled: draft.reminderEnabled,
			notifyOnStart: draft.notifyOnStart,
			channelId: channel.id,
			serviceType: draft.serviceType,
			thumbnailUrl: thumbnail?.url,
			thumbnailKey: thumbnail?.key,
			subtitleUrl: subtitle?.url,
			subtitleKey: subtitle?.key,
			subtitleFilename: draft.subtitle?.name
		});
		applyYouTubeIngest(result.ingest, channel);
		liveSession.sessions = [...liveSession.sessions, result.session].sort((a, b) =>
			a.scheduled_at.localeCompare(b.scheduled_at)
		);
		liveSession.selectedId = result.session._id;
		studio.service.type = draft.serviceType;
		studio.service.phase = 'ready';
		if (draft.serviceType === 'live' && studio.settings.recordingMode === 'off') {
			studio.settings.recordingMode = 'both';
		}
		persist();
		return result.session;
	} catch (error) {
		liveSession.error = error instanceof Error ? error.message : String(error);
		return null;
	}
}

export async function selectSession(sessionId: string) {
	if (liveSession.publicRun && liveSession.publicRun.id !== sessionId) return;
	liveSession.selectedId = sessionId;
	// Never let a previous service's channel/key survive while the next one's
	// credentials are being resolved.
	disableManagedYouTube();
	const session = liveSession.sessions.find((item) => item._id === sessionId);
	if (session) {
		studio.service.type = session.service_type === 'live' ? 'live' : 'prepared';
		studio.service.phase = 'ready';
		if (studio.service.type === 'live' && studio.settings.recordingMode === 'off') {
			studio.settings.recordingMode = 'both';
		}
		persist();
	}
	if (!session?.youtube_url || session.is_test) {
		return;
	}
	const channelId = sessionYouTubeChannelId(session, liveSession.youtubeChannels);
	const channel = liveSession.youtubeChannels.find((item) => item.id === channelId);
	if (!channel) {
		liveSession.youtubeError = 'Connect the YouTube channel used by this service.';
		return;
	}
	selectYouTubeChannel(channel.id);
	try {
		const result = await adminPost<{ ingest: YouTubeIngest }>({ action: 'ingest', sessionId });
		applyYouTubeIngest(result.ingest, channel);
		liveSession.youtubeError = null;
	} catch (error) {
		// Older links created directly in YouTube keep the manually configured key.
		liveSession.youtubeError = error instanceof Error ? error.message : String(error);
	}
}

/** Creates an unlisted, silent session from the admin's default live details. */
export async function createQuickTest() {
	liveSession.error = null;
	try {
		const result = await post<{ session: LiveSession; watchUrl: string }>({ action: 'quick-test' });
		liveSession.sessions = [...liveSession.sessions, { ...result.session, is_test: true }];
		liveSession.selectedId = result.session._id;
		liveSession.testUrl = result.watchUrl;
		return result.watchUrl;
	} catch (error) {
		liveSession.error = error instanceof Error ? error.message : String(error);
		return null;
	}
}

export async function refreshSessions() {
	liveSession.error = null;
	try {
		const sentAtMs = Date.now();
		const result = await post<{
			operator: { name: string };
			sessions: LiveSession[];
			previousSessions: LiveSession[];
			recoverySession?: LiveSession | null;
			serverReceivedAtMs: number;
			serverSentAtMs: number;
		}>({
			action: 'list',
			sessionId: liveSession.publicRun?.id ?? liveSession.selectedId ?? undefined
		});
		sampleServerClock(result.serverReceivedAtMs, result.serverSentAtMs, sentAtMs, Date.now());
		liveSession.sessions = result.sessions;
		if (
			result.recoverySession &&
			!result.sessions.some((session) => session._id === result.recoverySession?._id)
		) {
			liveSession.sessions.push(result.recoverySession);
		}
		liveSession.previousSessions = result.previousSessions ?? [];
		liveSession.operatorName = result.operator.name;
		const run = liveSession.publicRun;
		if (run && !run.ending && result.recoverySession && !liveSession.selectedId) {
			await refreshYouTubeStatus();
			await selectSession(run.id);
		} else {
			void refreshYouTubeStatus();
		}
		await refreshPublicDestinations();
	} catch (error) {
		liveSession.error = error instanceof Error ? error.message : String(error);
	}
}

export async function logoutStudio(): Promise<boolean> {
	if (liveSession.publicRun) return false;
	const attempts = await Promise.allSettled([
		adminPost({ action: 'logout' }),
		post({ action: 'logout' })
	]);
	// Both endpoints revoke the same database authorization. Either success is
	// enough; requiring both would strand Studio when only one service is down.
	if (attempts.every((attempt) => attempt.status === 'rejected')) {
		liveSession.error = t('stream.disconnectStudioError');
		return false;
	}
	liveSession.pairingCode = null;
	saveStudioAuthorization(null);
	liveSession.operatorName = null;
	liveSession.selectedId = null;
	liveSession.activeId = null;
	liveSession.activeStartedAt = null;
	liveSession.sessions = [];
	liveSession.previousSessions = [];
	liveSession.testUrl = null;
	liveSession.error = null;
	liveSession.youtubeConnected = false;
	liveSession.youtubeChannels = [];
	selectYouTubeChannel(null);
	liveSession.youtubeError = null;
	disableManagedYouTube();
	liveSession.missionnaireReady = false;
	liveSession.missionnaireError = null;
	liveSession.subtitleStatus = 'idle';
	disableManagedMissionnaire();
	attachedSessionId = null;
	attachedSubtitleKey = null;
	return true;
}

type Destination = keyof typeof liveSession.publicDestinations;
let publicRefresh: Promise<void> | null = null;

export function beginPublicRun(session: LiveSession) {
	if (liveSession.publicRun) return;
	savePublicRun({
		id: session._id,
		title: session.title,
		isTest: Boolean(session.is_test),
		youtube: Boolean(session.youtube_url && !session.is_test),
		ending: false
	});
	for (const destination of Object.values(liveSession.publicDestinations)) {
		destination.status = 'unknown';
		destination.error = null;
	}
}

export function markPublicEnding() {
	const run = liveSession.publicRun;
	if (run && !run.ending) savePublicRun({ ...run, ending: true });
}

export function getPublicSessionStatus(sessionId: string) {
	return post<{
		active: boolean;
		startedAt: string | null;
		status: LiveSession['status'];
	}>({ action: 'session-status', sessionId });
}

async function readMissionnaire(run: PublicRun): Promise<PublicStatus> {
	const { active, startedAt, status } = await getPublicSessionStatus(run.id);

	if (active) {
		liveSession.activeId = run.id;
		liveSession.activeStartedAt = startedAt ? Date.parse(startedAt) : null;
		const audio = await missionnaireAudioStatus().catch(() => null);
		return audio?.sourceActive ? 'live' : 'waiting';
	}
	liveSession.activeId = null;
	liveSession.activeStartedAt = null;
	attachedSessionId = null;
	attachedSubtitleKey = null;
	if (status === 'live') return 'waiting';
	return status === 'ended' || status === 'cancelled' ? 'ended' : 'off';
}

async function readYouTube(sessionId: string): Promise<PublicStatus> {
	const { status } = await adminPost<{ status: string }>({ action: 'broadcast-status', sessionId });
	return youtubePublicStatus(status);
}

async function endYouTube(sessionId: string) {
	for (let attempt = 0; attempt < 10; attempt++) {
		const status = await readYouTube(sessionId);
		if (publicDestinationReady(status, true)) return;
		if (status === 'live') {
			await adminPost({ action: 'end-live', sessionId });
			return;
		}
		await new Promise<void>((resolve) => setTimeout(resolve, 2_000));
	}
}

async function updatePublicDestinations(allowChange: boolean, canContinue = () => true) {
	const run = liveSession.publicRun;
	if (!run || !liveSession.pairingCode || liveSession.publicBusy) return;
	liveSession.publicBusy = true;
	try {
		const destinations: Destination[] = run.youtube
			? ['missionnaire', 'youtube']
			: ['missionnaire'];
		const isCurrentRun = () =>
			liveSession.publicRun?.id === run.id && liveSession.publicRun.ending === run.ending;
		const canChange = () => allowChange && isCurrentRun() && canContinue();
		const complete = await Promise.all(
			destinations.map(async (name) => {
				const destination = liveSession.publicDestinations[name];
				if (allowChange && destination.status === (run.ending ? 'ended' : 'live')) return true;
				if (allowChange) destination.error = null;
				const read = () => (name === 'youtube' ? readYouTube(run.id) : readMissionnaire(run));
				try {
					const ready = await reconcilePublicDestination({
						read,
						observe: (status) => {
							destination.status = status;
						},
						ending: run.ending,
						canChange,
						change: async () => {
							if (name === 'youtube') {
								if (run.ending) await endYouTube(run.id);
								else await goLiveYouTube(run.id, canChange);
							} else if (run.ending) {
								await post({ action: 'end', sessionId: run.id });
							} else {
								const audio = await missionnaireAudioStatus();
								if (!audio.reachable) throw new Error(t('error.missionnaireAudioUnreachable'));
								if (!audio.sourceActive) throw new Error(t('error.missionnaireAudioMissing'));
								if (!canChange()) return;
								await post({ action: 'start', sessionId: run.id, subtitleMode: 'armed' });
							}
						}
					});
					if (ready) {
						destination.error = null;
						if (run.ending) destination.status = 'ended';
					}
					if (!ready && canChange()) destination.error = t('controls.publicUnconfirmed');
					return ready;
				} catch (error) {
					if (destination.status === (run.ending ? 'ended' : 'live'))
						destination.status = 'unknown';
					destination.error = error instanceof Error ? error.message : String(error);
					return false;
				}
			})
		);
		if (isCurrentRun() && run.ending && complete.every(Boolean)) {
			savePublicRun(null);
			if (liveSession.selectedId === run.id) liveSession.selectedId = null;
		}
	} finally {
		liveSession.publicBusy = false;
	}
}

export function refreshPublicDestinations() {
	if (!liveSession.publicRun || liveSession.publicBusy) return publicRefresh;
	publicRefresh = updatePublicDestinations(false).finally(() => {
		publicRefresh = null;
	});
	return publicRefresh;
}

export function startPublicDestinations(canContinue: () => boolean) {
	return updatePublicDestinations(true, canContinue);
}

export async function endSelectedSession() {
	markPublicEnding();
	await publicRefresh;
	await updatePublicDestinations(true);
}
