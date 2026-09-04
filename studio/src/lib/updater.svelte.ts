import { getVersion } from '@tauri-apps/api/app';
import { relaunch } from '@tauri-apps/plugin-process';
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';

type UpdatePhase =
	| 'idle'
	| 'checking'
	| 'current'
	| 'available'
	| 'downloading'
	| 'installing'
	| 'restarting'
	| 'error';

export const appUpdate = $state({
	phase: 'idle' as UpdatePhase,
	currentVersion: '',
	availableVersion: null as string | null,
	downloaded: 0,
	total: 0,
	error: null as string | null
});

let pending: Update | null = null;
let checking: Promise<void> | null = null;

export async function retry<T>(operation: () => Promise<T>, delayMs = 500): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, delayMs * 2 ** attempt));
		}
	}
	throw lastError;
}

export function downloadPercent(
	downloaded = appUpdate.downloaded,
	total = appUpdate.total
): number {
	return total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
}

export async function initUpdater(): Promise<void> {
	appUpdate.currentVersion = await getVersion().catch(() => '');
	await checkForUpdate(true);
}

/** Silent startup checks do not turn a temporary network problem into a red
 * banner; a manual check in About still reports the same error. */
export async function checkForUpdate(silent = false): Promise<void> {
	if (checking) {
		await checking;
		// A click during the silent startup check must still perform a visible
		// check if that background request failed.
		if (!silent && appUpdate.phase === 'idle') await checkForUpdate();
		return;
	}
	checking = (async () => {
		appUpdate.phase = 'checking';
		appUpdate.error = null;
		try {
			const found = await retry(() => check({ timeout: 15_000 }));
			if (pending && pending !== found) await pending.close().catch(() => {});
			pending = found;
			appUpdate.availableVersion = found?.version ?? null;
			appUpdate.phase = found ? 'available' : 'current';
		} catch (error) {
			// Offline is not the same as up to date. Keep a quiet startup failure
			// neutral; a manual check exposes the actual network/server error.
			appUpdate.phase = silent ? 'idle' : 'error';
			appUpdate.error = silent ? null : error instanceof Error ? error.message : String(error);
		} finally {
			checking = null;
		}
	})();
	return checking;
}

export async function installUpdate(): Promise<void> {
	if (!pending || appUpdate.phase !== 'available') return;
	appUpdate.downloaded = 0;
	appUpdate.total = 0;
	appUpdate.error = null;
	try {
		await pending.downloadAndInstall((event) => applyDownloadEvent(event));
		appUpdate.phase = 'restarting';
		await relaunch();
	} catch (error) {
		appUpdate.phase = 'error';
		appUpdate.error = error instanceof Error ? error.message : String(error);
	}
}

function applyDownloadEvent(event: DownloadEvent) {
	switch (event.event) {
		case 'Started':
			appUpdate.phase = 'downloading';
			appUpdate.total = event.data.contentLength ?? 0;
			break;
		case 'Progress':
			appUpdate.downloaded += event.data.chunkLength;
			break;
		case 'Finished':
			appUpdate.phase = 'installing';
	}
}
