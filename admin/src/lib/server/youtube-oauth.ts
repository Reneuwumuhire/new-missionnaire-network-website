import { env } from '$env/dynamic/private';
import { getDb } from '../../db/mongo';
import { authorizationUrl, decryptToken, encryptToken, youtubeBroadcastId } from './youtube-oauth-core';

const REDIRECT_URI = 'https://admin.missionnaire.net/api/youtube/oauth/callback';

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
		const message = data.error_description || (typeof data.error === 'string' ? data.error : data.error?.message);
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

export async function finishYouTubeOAuth(code: string, state: string): Promise<{ channelTitle: string }> {
	const db = await getDb();
	const pending = await db.collection('youtube_oauth_states').findOneAndDelete({
		state,
		expires_at: { $gt: new Date() }
	});
	if (!pending || typeof pending.user_email !== 'string') throw new Error('YouTube connection expired; start again from Studio');

	const { clientId, clientSecret, encryptionSecret, redirectUri } = config();
	const token = await google<{ access_token: string; refresh_token?: string }>('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' })
	});
	if (!token.refresh_token) throw new Error('Google did not return an offline token; reconnect and approve access');

	const channels = await google<{ items?: Array<{ id: string; snippet?: { title?: string } }> }>(
		'https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true',
		{ headers: { Authorization: `Bearer ${token.access_token}` } }
	);
	const channel = channels.items?.[0];
	if (!channel) throw new Error('The connected Google account has no YouTube channel');
	const channelTitle = channel.snippet?.title || channel.id;
	await db.collection('youtube_authorizations').updateOne(
		{ user_email: pending.user_email },
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

export async function youtubeConnection(userEmail: string): Promise<{ connected: boolean; channelTitle: string | null }> {
	const doc = await (await getDb()).collection('youtube_authorizations').findOne(
		{ user_email: userEmail },
		{ projection: { channel_title: 1 } }
	);
	return { connected: Boolean(doc), channelTitle: typeof doc?.channel_title === 'string' ? doc.channel_title : null };
}

async function accessToken(userEmail: string): Promise<string> {
	const doc = await (await getDb()).collection('youtube_authorizations').findOne({ user_email: userEmail });
	if (!doc || typeof doc.refresh_token !== 'string') throw new Error('Connect the YouTube account first');
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
	return token.access_token;
}

export async function transitionYouTubeLive(userEmail: string, youtubeUrl: string): Promise<{ broadcastId: string; status: string }> {
	const broadcastId = youtubeBroadcastId(youtubeUrl);
	if (!broadcastId) throw new Error('The session needs a scheduled YouTube video link');
	const token = await accessToken(userEmail);
	const currentUrl = new URL('https://www.googleapis.com/youtube/v3/liveBroadcasts');
	currentUrl.search = new URLSearchParams({ part: 'id,status', id: broadcastId }).toString();
	const current = await google<{ items?: Array<{ status?: { lifeCycleStatus?: string } }> }>(
		currentUrl.toString(),
		{ headers: { Authorization: `Bearer ${token}` } }
	);
	const currentStatus = current.items?.[0]?.status?.lifeCycleStatus;
	if (!currentStatus) throw new Error('Scheduled YouTube broadcast not found on the connected channel');
	if (currentStatus === 'live') return { broadcastId, status: currentStatus };
	if (currentStatus !== 'testing') throw new Error(`YouTube preview is not ready (${currentStatus})`);

	const url = new URL('https://www.googleapis.com/youtube/v3/liveBroadcasts/transition');
	url.search = new URLSearchParams({ part: 'id,status', id: broadcastId, broadcastStatus: 'live' }).toString();
	const result = await google<{ status?: { lifeCycleStatus?: string } }>(url.toString(), {
		method: 'POST',
		headers: { Authorization: `Bearer ${token}` }
	});
	return { broadcastId, status: result.status?.lifeCycleStatus ?? 'live' };
}
