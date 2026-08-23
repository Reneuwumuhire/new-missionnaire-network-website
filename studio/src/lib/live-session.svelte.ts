import { invoke } from '@tauri-apps/api/core';

export type LiveSession = { _id: string; slug: string; title: string; scheduled_at: string; status: 'scheduled' | 'live' | 'ended' | 'cancelled' };

export const liveSession = $state({
	sessions: [] as LiveSession[],
	selectedId: null as string | null,
	error: null as string | null,
	starting: false,
	pairingCode: null as string | null,
	operatorName: null as string | null
});

async function post<T>(body: object): Promise<T> {
	if (!liveSession.pairingCode) throw new Error('Continue with admin first.');
	return JSON.parse(await invoke<string>('studio_live_post', { body: JSON.stringify(body), authorization: liveSession.pairingCode })) as T;
}

export async function connectWithAdmin() {
	if (!liveSession.pairingCode) liveSession.pairingCode = crypto.randomUUID();
	await invoke('studio_open_login', { code: liveSession.pairingCode });
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

export async function createSession(title: string, scheduledAt?: string) {
	liveSession.error = null;
	try {
		const result = await post<{ session: LiveSession }>({ action: 'create', title, scheduledAt });
		liveSession.sessions = [...liveSession.sessions, result.session].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
		liveSession.selectedId = result.session._id;
		return result.session;
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

export async function startSelectedSession() {
	if (!liveSession.selectedId || liveSession.starting) return;
	liveSession.starting = true;
	try { await post({ action: 'start', sessionId: liveSession.selectedId }); }
	catch (error) { liveSession.error = error instanceof Error ? error.message : String(error); }
	finally { liveSession.starting = false; }
}

export async function endSelectedSession() {
	if (!liveSession.selectedId) return;
	try { await post({ action: 'end', sessionId: liveSession.selectedId }); }
	catch (error) { liveSession.error = error instanceof Error ? error.message : String(error); }
}
