import { env } from '$env/dynamic/private';
import { getDb } from '../../db/mongo';
import {
	authorizationUrl,
	decryptToken,
	encryptToken,
	scheduledBroadcastBody,
	validateYouTubeThumbnail,
	youtubeBroadcastId,
	youtubeLiveStep
} from './youtube-oauth-core';

const REDIRECT_URI = 'https://admin.missionnaire.net/api/youtube/oauth/callback';

export type YouTubeChannel = {
	id: string;
	title: string;
	updatedAt: string;
};

let authorizationIndexesEnsured: Promise<void> | null = null;
async function ensureAuthorizationIndexes(): Promise<void> {
	if (authorizationIndexesEnsured) return authorizationIndexesEnsured;
	authorizationIndexesEnsured = (async () => {
		const db = await getDb();
		await db
			.collection('youtube_authorizations')
			.createIndex({ user_email: 1, channel_id: 1 }, { unique: true, name: 'user_channel_unique' });
	})();
	return authorizationIndexesEnsured;
}

function config() {
	const clientId = env.YOUTUBE_OAUTH_CLIENT_ID?.trim();
	const clientSecret = env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim();
	const encryptionSecret = env.INTERNAL_API_SECRET?.trim();
	if (!clientId || !clientSecret || !encryptionSecret) {
		throw new Error('YouTube OAuth is not configured');
	}
	return {
		clientId,
		clientSecret,
		encryptionSecret,
		redirectUri: env.YOUTUBE_OAUTH_REDIRECT_URI?.trim() || REDIRECT_URI
	};
}

async function google<T>(url: string, init: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	const data = (await response.json().catch(() => ({}))) as T & {
		error?: string | { message?: string };
		error_description?: string;
	};
	if (!response.ok) {
		const message =
			data.error_description || (typeof data.error === 'string' ? data.error : data.error?.message);
		throw new Error(message || `YouTube request failed (${response.status})`);
	}
	return data;
}

export async function beginYouTubeOAuth(userEmail: string, studioCode: string): Promise<string> {
	const { clientId, redirectUri } = config();
	const state = crypto.randomUUID();
	const db = await getDb();
	await db.collection('youtube_oauth_states').deleteMany({ expires_at: { $lte: new Date() } });
	await db.collection('youtube_oauth_states').insertOne({
		state,
		user_email: userEmail,
		studio_code: studioCode,
		expires_at: new Date(Date.now() + 10 * 60 * 1000)
	});
	return authorizationUrl({ clientId, redirectUri, state });
}

export async function finishYouTubeOAuth(
	code: string,
	state: string
): Promise<{ channelTitle: string }> {
	const db = await getDb();
	const pending = await db.collection('youtube_oauth_states').findOneAndDelete({
		state,
		expires_at: { $gt: new Date() }
	});
	if (!pending || typeof pending.user_email !== 'string')
		throw new Error('YouTube connection expired; start again from Studio');

	const { clientId, clientSecret, encryptionSecret, redirectUri } = config();
	const token = await google<{ access_token: string; refresh_token?: string }>(
		'https://oauth2.googleapis.com/token',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				code,
				client_id: clientId,
				client_secret: clientSecret,
				redirect_uri: redirectUri,
				grant_type: 'authorization_code'
			})
		}
	);
	if (!token.refresh_token)
		throw new Error('Google did not return an offline token; reconnect and approve access');

	const channels = await google<{ items?: Array<{ id: string; snippet?: { title?: string } }> }>(
		'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true',
		{ headers: { Authorization: `Bearer ${token.access_token}` } }
	);
	const channel = channels.items?.[0];
	if (!channel) throw new Error('The connected Google account has no YouTube channel');
	const channelTitle = channel.snippet?.title || channel.id;
	await ensureAuthorizationIndexes();
	await db.collection('youtube_authorizations').updateOne(
		{ user_email: pending.user_email, channel_id: channel.id },
		{
			$set: {
				user_email: pending.user_email,
				refresh_token: encryptToken(token.refresh_token, encryptionSecret),
				channel_id: channel.id,
				channel_title: channelTitle,
				connected_at: new Date(),
				updated_at: new Date()
			}
		},
		{ upsert: true }
	);
	return { channelTitle };
}

export async function youtubeConnection(userEmail: string): Promise<YouTubeChannel[]> {
	await ensureAuthorizationIndexes();
	const docs = await (
		await getDb()
	)
		.collection('youtube_authorizations')
		.find(
			{ user_email: userEmail },
			{ projection: { channel_id: 1, channel_title: 1, updated_at: 1 } }
		)
		.sort({ updated_at: -1 })
		.toArray();
	return docs.flatMap((doc) =>
		typeof doc.channel_id === 'string'
			? [
					{
						id: doc.channel_id,
						title: typeof doc.channel_title === 'string' ? doc.channel_title : doc.channel_id,
						updatedAt:
							doc.updated_at instanceof Date
								? doc.updated_at.toISOString()
								: String(doc.updated_at ?? '')
					}
				]
			: []
	);
}

export async function disconnectYouTube(userEmail: string, channelId: string): Promise<void> {
	await (await getDb())
		.collection('youtube_authorizations')
		.deleteOne({ user_email: userEmail, channel_id: channelId });
}

async function accessToken(userEmail: string, channelId: string): Promise<string> {
	return (await authorization(userEmail, channelId)).token;
}

type YouTubeIngest = { url: string; key: string };

async function authorization(
	userEmail: string,
	channelId: string
): Promise<{
	token: string;
	channelId: string;
	channelTitle: string;
	encryptionSecret: string;
}> {
	const db = await getDb();
	const doc = await db
		.collection('youtube_authorizations')
		.findOne({ user_email: userEmail, channel_id: channelId });
	if (!doc || typeof doc.refresh_token !== 'string' || typeof doc.channel_id !== 'string') {
		throw new Error('Connect the YouTube account first');
	}
	const { clientId, clientSecret, encryptionSecret } = config();
	const token = await google<{ access_token: string }>('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			refresh_token: decryptToken(doc.refresh_token, encryptionSecret),
			grant_type: 'refresh_token'
		})
	});
	return {
		token: token.access_token,
		channelId: doc.channel_id,
		channelTitle: typeof doc.channel_title === 'string' ? doc.channel_title : doc.channel_id,
		encryptionSecret
	};
}

async function reusableStream(
	userEmail: string,
	channelId: string
): Promise<{
	token: string;
	streamId: string;
	ingest: YouTubeIngest;
	channelTitle: string;
}> {
	const { token, channelTitle, encryptionSecret } = await authorization(userEmail, channelId);
	const db = await getDb();
	const saved = await db.collection('youtube_studio_streams').findOne({ channel_id: channelId });
	if (
		typeof saved?.stream_id === 'string' &&
		typeof saved?.ingestion_address === 'string' &&
		typeof saved?.stream_name === 'string'
	) {
		return {
			token,
			streamId: saved.stream_id,
			channelTitle,
			ingest: {
				url: saved.ingestion_address,
				key: decryptToken(saved.stream_name, encryptionSecret)
			}
		};
	}

	const created = await google<{
		id?: string;
		cdn?: { ingestionInfo?: { ingestionAddress?: string; streamName?: string } };
	}>(
		'https://www.googleapis.com/youtube/v3/liveStreams?part=id,snippet,cdn,contentDetails,status',
		{
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				snippet: { title: 'Missionnaire Studio' },
				cdn: { ingestionType: 'rtmp', resolution: 'variable', frameRate: 'variable' },
				contentDetails: { isReusable: true }
			})
		}
	);
	const address = created.cdn?.ingestionInfo?.ingestionAddress;
	const streamName = created.cdn?.ingestionInfo?.streamName;
	if (!created.id || !address || !streamName)
		throw new Error('YouTube did not return stream credentials');
	await db.collection('youtube_studio_streams').updateOne(
		{ channel_id: channelId },
		{
			$set: {
				channel_id: channelId,
				stream_id: created.id,
				ingestion_address: address,
				stream_name: encryptToken(streamName, encryptionSecret),
				updated_at: new Date()
			}
		},
		{ upsert: true }
	);
	return { token, streamId: created.id, ingest: { url: address, key: streamName }, channelTitle };
}

export async function scheduleYouTubeLive(
	userEmail: string,
	channelId: string,
	input: {
		title: string;
		description: string | null;
		scheduledAt: Date;
		privacyStatus: 'private' | 'unlisted' | 'public';
		madeForKids: boolean;
		thumbnail?: { bytes: ArrayBuffer; contentType: string };
	}
): Promise<{
	broadcastId: string;
	youtubeUrl: string;
	ingest: YouTubeIngest;
	channelId: string;
	channelTitle: string;
}> {
	const { token, streamId, ingest, channelTitle } = await reusableStream(userEmail, channelId);
	const created = await google<{ id?: string }>(
		'https://www.googleapis.com/youtube/v3/liveBroadcasts?part=id,snippet,status,contentDetails',
		{
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(scheduledBroadcastBody(input))
		}
	);
	if (!created.id) throw new Error('YouTube did not return a scheduled broadcast');
	try {
		const bind = new URL('https://www.googleapis.com/youtube/v3/liveBroadcasts/bind');
		bind.search = new URLSearchParams({
			part: 'id,contentDetails,status',
			id: created.id,
			streamId
		}).toString();
		await google(bind.toString(), {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}` }
		});
		if (input.thumbnail) {
			const contentType = validateYouTubeThumbnail(
				input.thumbnail.contentType,
				input.thumbnail.bytes.byteLength
			);
			const thumbnailUrl = new URL('https://www.googleapis.com/upload/youtube/v3/thumbnails/set');
			thumbnailUrl.search = new URLSearchParams({
				videoId: created.id,
				uploadType: 'media'
			}).toString();
			await google(thumbnailUrl.toString(), {
				method: 'POST',
				headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
				body: input.thumbnail.bytes
			});
		}
	} catch (cause) {
		await google(
			`https://www.googleapis.com/youtube/v3/liveBroadcasts?id=${encodeURIComponent(created.id)}`,
			{
				method: 'DELETE',
				headers: { Authorization: `Bearer ${token}` }
			}
		).catch(() => {});
		throw cause;
	}
	return {
		broadcastId: created.id,
		youtubeUrl: `https://www.youtube.com/watch?v=${created.id}`,
		ingest,
		channelId,
		channelTitle
	};
}

export async function deleteYouTubeLive(
	userEmail: string,
	channelId: string,
	broadcastId: string
): Promise<void> {
	const token = await accessToken(userEmail, channelId);
	await google(
		`https://www.googleapis.com/youtube/v3/liveBroadcasts?id=${encodeURIComponent(broadcastId)}`,
		{
			method: 'DELETE',
			headers: { Authorization: `Bearer ${token}` }
		}
	);
}

export async function youtubeIngest(
	userEmail: string,
	channelId: string,
	youtubeUrl: string
): Promise<YouTubeIngest> {
	const broadcastId = youtubeBroadcastId(youtubeUrl);
	if (!broadcastId) throw new Error('The session needs a scheduled YouTube video link');
	const { token, streamId, ingest } = await reusableStream(userEmail, channelId);
	const url = new URL('https://www.googleapis.com/youtube/v3/liveBroadcasts');
	url.search = new URLSearchParams({ part: 'id,contentDetails', id: broadcastId }).toString();
	const broadcast = await google<{
		items?: Array<{ contentDetails?: { boundStreamId?: string } }>;
	}>(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
	if (broadcast.items?.[0]?.contentDetails?.boundStreamId !== streamId) {
		throw new Error('This YouTube broadcast was not created by Missionnaire Studio');
	}
	return ingest;
}

export async function transitionYouTubeLive(
	userEmail: string,
	channelId: string,
	youtubeUrl: string
): Promise<{ broadcastId: string; status: string }> {
	const broadcastId = youtubeBroadcastId(youtubeUrl);
	if (!broadcastId) throw new Error('The session needs a scheduled YouTube video link');
	const token = await accessToken(userEmail, channelId);
	const currentUrl = new URL('https://www.googleapis.com/youtube/v3/liveBroadcasts');
	currentUrl.search = new URLSearchParams({ part: 'id,status', id: broadcastId }).toString();
	const current = await google<{ items?: Array<{ status?: { lifeCycleStatus?: string } }> }>(
		currentUrl.toString(),
		{ headers: { Authorization: `Bearer ${token}` } }
	);
	const currentStatus = current.items?.[0]?.status?.lifeCycleStatus;
	if (!currentStatus)
		throw new Error('Scheduled YouTube broadcast not found on the connected channel');
	const step = youtubeLiveStep(currentStatus);
	if (step === 'done' || step === 'wait') return { broadcastId, status: currentStatus };

	const url = new URL('https://www.googleapis.com/youtube/v3/liveBroadcasts/transition');
	const targetStatus = step === 'start-testing' ? 'testing' : 'live';
	url.search = new URLSearchParams({
		part: 'id,status',
		id: broadcastId,
		broadcastStatus: targetStatus
	}).toString();
	const result = await google<{ status?: { lifeCycleStatus?: string } }>(url.toString(), {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}` }
	});
	return { broadcastId, status: result.status?.lifeCycleStatus ?? targetStatus };
}

export async function completeYouTubeLive(
	userEmail: string,
	channelId: string,
	youtubeUrl: string
): Promise<{ broadcastId: string; status: string }> {
	const broadcastId = youtubeBroadcastId(youtubeUrl);
	if (!broadcastId) throw new Error('The session needs a scheduled YouTube video link');
	const token = await accessToken(userEmail, channelId);
	const currentUrl = new URL('https://www.googleapis.com/youtube/v3/liveBroadcasts');
	currentUrl.search = new URLSearchParams({ part: 'id,status', id: broadcastId }).toString();
	const current = await google<{ items?: Array<{ status?: { lifeCycleStatus?: string } }> }>(
		currentUrl.toString(),
		{ headers: { Authorization: `Bearer ${token}` } }
	);
	const currentStatus = current.items?.[0]?.status?.lifeCycleStatus;
	if (!currentStatus)
		throw new Error('Scheduled YouTube broadcast not found on the connected channel');
	if (currentStatus === 'complete') return { broadcastId, status: currentStatus };
	if (currentStatus !== 'live') throw new Error(`YouTube broadcast is not live (${currentStatus})`);

	const url = new URL('https://www.googleapis.com/youtube/v3/liveBroadcasts/transition');
	url.search = new URLSearchParams({
		part: 'id,status',
		id: broadcastId,
		broadcastStatus: 'complete'
	}).toString();
	const result = await google<{ status?: { lifeCycleStatus?: string } }>(url.toString(), {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}` }
	});
	return { broadcastId, status: result.status?.lifeCycleStatus ?? 'complete' };
}
