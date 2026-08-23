import { invoke } from '@tauri-apps/api/core';
import { studio } from './state.svelte';

export type LiveSession = { _id: string; slug: string; title: string; scheduled_at: string; status: 'scheduled' | 'live' | 'ended' | 'cancelled'; is_test?: boolean };
export type NewSession = {
	title: string; scheduledAt: string; description: string; youtubeUrl: string;
	thumbnail: File | null; subtitle: File | null; announce: boolean; reminderEnabled: boolean;
};

export const liveSession = $state({
	sessions: [] as LiveSession[],
	selectedId: null as string | null,
	activeId: null as string | null,
	error: null as string | null,
	starting: false,
	pairingCode: null as string | null,
	operatorName: null as string | null,
	testUrl: null as string | null
});

async function post<T>(body: object): Promise<T> {
	if (!liveSession.pairingCode) throw new Error('Continue with admin first.');
	return JSON.parse(await invoke<string>('studio_live_post', {
		body: JSON.stringify(body),
		authorization: liveSession.pairingCode,
		baseUrl: studio.settings.mainSiteUrl
	})) as T;
}

export async function connectWithAdmin() {
	if (!liveSession.pairingCode) liveSession.pairingCode = crypto.randomUUID();
	await invoke('studio_open_login', { code: liveSession.pairingCode, adminUrl: studio.settings.adminSiteUrl });
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

async function upload(file: File, action: 'presign-thumbnail' | 'presign-subtitle') {
	const signed = await post<{ uploadUrl: string; key: string; publicUrl: string; contentType?: string }>({
		action, filename: file.name, contentType: file.type, size: file.size
	});
	const response = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': signed.contentType ?? file.type }, body: file });
	if (!response.ok) throw new Error(`Upload failed (${response.status})`);
	return { url: signed.publicUrl, key: signed.key };
}

export async function createSession(draft: NewSession) {
	liveSession.error = null;
	try {
		const thumbnail = draft.thumbnail ? await upload(draft.thumbnail, 'presign-thumbnail') : null;
		const subtitle = draft.subtitle ? await upload(draft.subtitle, 'presign-subtitle') : null;
		const result = await post<{ session: LiveSession }>({
			action: 'create', title: draft.title, scheduledAt: new Date(draft.scheduledAt).toISOString(),
			description: draft.description, youtubeUrl: draft.youtubeUrl, announce: draft.announce,
			reminderEnabled: draft.reminderEnabled, thumbnailUrl: thumbnail?.url, thumbnailKey: thumbnail?.key,
			subtitleUrl: subtitle?.url, subtitleKey: subtitle?.key, subtitleFilename: draft.subtitle?.name
		});
		liveSession.sessions = [...liveSession.sessions, result.session].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
		liveSession.selectedId = result.session._id;
		return result.session;
	} catch (error) {
		liveSession.error = error instanceof Error ? error.message : String(error);
		return null;
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
		const result = await post<{ operator: { name: string }; sessions: LiveSession[] }>({ action: 'list' });
		liveSession.sessions = result.sessions;
		liveSession.operatorName = result.operator.name;
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
	liveSession.sessions = [];
	liveSession.testUrl = null;
	liveSession.error = null;
}

export async function startSelectedSession() {
	if (!liveSession.selectedId || liveSession.starting) return;
	liveSession.starting = true;
	try {
		await post({ action: 'start', sessionId: liveSession.selectedId });
		liveSession.activeId = liveSession.selectedId;
	}
	catch (error) { liveSession.error = error instanceof Error ? error.message : String(error); }
	finally { liveSession.starting = false; }
}

export async function endSelectedSession() {
	if (!liveSession.activeId) return;
	try { await post({ action: 'end', sessionId: liveSession.activeId }); }
	catch (error) { liveSession.error = error instanceof Error ? error.message : String(error); }
	finally { liveSession.activeId = null; }
}
