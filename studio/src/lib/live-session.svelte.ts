import { invoke } from '@tauri-apps/api/core';
import { followedMediaElement, lyrics } from './lyrics.svelte';
import { id, persist, studio } from './state.svelte';
import { outputAlignedPositionMs, sampleServerClock, serverEpochMs } from './stream-clock';

export type LiveSession = {
	_id: string;
	slug: string;
	title: string;
	scheduled_at: string;
	status: 'scheduled' | 'live' | 'ended' | 'cancelled';
	youtube_url?: string | null;
	youtube_channel_id?: string | null;
	youtube_channel_title?: string | null;
	is_test?: boolean;
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
	title: string;
	scheduledAt: string;
	description: string;
	privacyStatus: 'private' | 'unlisted' | 'public';
	madeForKids: boolean;
	thumbnail: File | null;
	subtitle: File | null;
	announce: boolean;
	reminderEnabled: boolean;
	youtubeChannelId: string;
};

type YouTubeIngest = { url: string; key: string };
type MissionnaireIngest = YouTubeIngest & { expiresAt: string };

export const liveSession = $state({
	sessions: [] as LiveSession[],
	selectedId: null as string | null,
	activeId: null as string | null,
	activeStartedAt: null as number | null,
	error: null as string | null,
	starting: false,
	pairingCode: null as string | null,
	operatorName: null as string | null,
	testUrl: null as string | null,
	youtubeConnected: false,
	youtubeChannel: null as string | null,
	youtubeChannelId: null as string | null,
	youtubeChannels: [] as YouTubeChannel[],
	youtubeConnecting: false,
	youtubeError: null as string | null,
	missionnaireReady: false,
	missionnaireError: null as string | null
});

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

export function controlCloudRecording(action: 'start' | 'stop') {
	return adminPost<{ id: string }>({ action: `recorder-${action}` });
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
	if (!liveSession.pairingCode) liveSession.pairingCode = crypto.randomUUID();
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
	try {
		const result = await adminPost<{
			channels?: YouTubeChannel[];
			connected?: boolean;
			channelTitle?: string | null;
			missionnaireIngest?: MissionnaireIngest | null;
			missionnaireError?: string | null;
		}>({
			action: 'status'
		});
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
		liveSession.youtubeConnected = false;
		liveSession.youtubeChannels = [];
		selectYouTubeChannel(null);
		liveSession.youtubeError = error instanceof Error ? error.message : String(error);
		disableManagedMissionnaire();
		liveSession.missionnaireReady = false;
		liveSession.missionnaireError = liveSession.youtubeError;
	}
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

export async function goLiveYouTube() {
	if (!liveSession.selectedId) throw new Error('Choose a live session first.');
	for (let attempt = 0; attempt < 45; attempt++) {
		const { status } = await adminPost<{ status: string }>({
			action: 'go-live',
			sessionId: liveSession.selectedId
		});
		if (status === 'live') return;
		if (!['testStarting', 'testing', 'liveStarting'].includes(status)) {
			throw new Error(`YouTube cannot go live (${status}).`);
		}
		await new Promise((resolve) => setTimeout(resolve, 2000));
	}
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

/** Publish the same timed lyrics Studio is drawing into the video to the
 * audio-only website. The media clock is authoritative for play/pause/seek. */
export async function syncLiveLyrics() {
	if (
		!liveSession.activeId ||
		lyrics.mode !== 'timed' ||
		!lyrics.srtText ||
		lyrics.cues.length === 0
	)
		return;
	try {
		const media = followedMediaElement(true);
		// A captured external live starts with songs. Merely loading its SRT must
		// not open the public gate before the matcher has found the sermon.
		if (!media && lyrics.anchorEpochMs === null) return;
		const uploaded = await ensureTimedSubtitle();
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
		const attach = attachedSessionId !== liveSession.activeId;
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
	} catch (error) {
		liveSession.error = error instanceof Error ? error.message : String(error);
	}
}

/** Keep an attached SRT ready for a later automatic/manual lock without
 * exposing it to listeners during songs or a lost source. */
export async function hideLiveLyrics() {
	if (!liveSession.activeId) return;
	try {
		await post({ action: 'hide-subtitles', sessionId: liveSession.activeId });
	} catch (error) {
		liveSession.error = error instanceof Error ? error.message : String(error);
	}
}

export async function createSession(draft: NewSession) {
	liveSession.error = null;
	try {
		const channel = liveSession.youtubeChannels.find((item) => item.id === draft.youtubeChannelId);
		if (!channel) throw new Error('Choose a connected YouTube channel.');
		const thumbnail = draft.thumbnail ? await upload(draft.thumbnail, 'presign-thumbnail') : null;
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
			channelId: channel.id,
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
		return result.session;
	} catch (error) {
		liveSession.error = error instanceof Error ? error.message : String(error);
		return null;
	}
}

export async function selectSession(sessionId: string) {
	liveSession.selectedId = sessionId;
	// Never let a previous service's channel/key survive while the next one's
	// credentials are being resolved.
	disableManagedYouTube();
	const session = liveSession.sessions.find((item) => item._id === sessionId);
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
			serverReceivedAtMs: number;
			serverSentAtMs: number;
		}>({
			action: 'list'
		});
		sampleServerClock(result.serverReceivedAtMs, result.serverSentAtMs, sentAtMs, Date.now());
		liveSession.sessions = result.sessions;
		liveSession.operatorName = result.operator.name;
		void refreshYouTubeStatus();
	} catch (error) {
		liveSession.error = error instanceof Error ? error.message : String(error);
	}
}

export async function logoutStudio() {
	await post({ action: 'logout' }).catch(() => {});
	liveSession.pairingCode = null;
	liveSession.operatorName = null;
	liveSession.selectedId = null;
	liveSession.activeId = null;
	liveSession.activeStartedAt = null;
	liveSession.sessions = [];
	liveSession.testUrl = null;
	liveSession.error = null;
	liveSession.youtubeConnected = false;
	liveSession.youtubeChannels = [];
	selectYouTubeChannel(null);
	liveSession.youtubeError = null;
	disableManagedYouTube();
	liveSession.missionnaireReady = false;
	liveSession.missionnaireError = null;
	disableManagedMissionnaire();
	attachedSessionId = null;
}

export async function startSelectedSession(): Promise<boolean> {
	if (!liveSession.selectedId || liveSession.starting || liveSession.activeId) return false;
	liveSession.starting = true;
	try {
		const result = await post<{ startedAt: string }>({
			action: 'start',
			sessionId: liveSession.selectedId,
			// A captured external live can contain songs before the prerecorded
			// sermon. Its SRT stays hidden until the matcher (or fallback button)
			// locates the sermon; file-based services retain start-at-go-live.
			subtitleMode: studio.scenes.some((scene) =>
				scene.layers.some((layer) => layer.youtubeLiveUrl)
			)
				? 'armed'
				: 'broadcast'
		});
		liveSession.activeId = liveSession.selectedId;
		liveSession.activeStartedAt = new Date(result.startedAt).getTime();
		attachedSessionId = null;
		void syncLiveLyrics();
		return true;
	} catch (error) {
		liveSession.error = error instanceof Error ? error.message : String(error);
		return false;
	} finally {
		liveSession.starting = false;
	}
}

export async function endSelectedSession() {
	if (!liveSession.activeId) return;
	const sessionId = liveSession.activeId;
	const session = liveSession.sessions.find((item) => item._id === sessionId);
	try {
		const requests: Promise<unknown>[] = [post({ action: 'end', sessionId })];
		if (session?.youtube_url && !session.is_test) {
			requests.push(adminPost({ action: 'end-live', sessionId }));
		}
		const failures = (await Promise.allSettled(requests)).filter(
			(result): result is PromiseRejectedResult => result.status === 'rejected'
		);
		if (failures.length) {
			liveSession.error = failures
				.map(({ reason }) => (reason instanceof Error ? reason.message : String(reason)))
				.join(' · ');
		}
	} finally {
		liveSession.activeId = null;
		liveSession.activeStartedAt = null;
		attachedSessionId = null;
	}
}
