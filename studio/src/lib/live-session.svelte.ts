import { invoke } from '@tauri-apps/api/core';

export type LiveSession = { _id: string; slug: string; title: string; scheduled_at: string; status: 'scheduled' | 'live' };

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
