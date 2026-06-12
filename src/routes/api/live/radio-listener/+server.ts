import { json } from '@sveltejs/kit';
import { heartbeatListener, removeListener } from '../../../../db/collections';

// Heartbeat-only endpoint. Client calls this every 30s while audio is actively
// playing so the listener-count stays accurate, and `sendBeacon`s a disconnect
// on unload. Replaces the listener-tracking duty that used to ride along with
// `/api/live/radio-poll`.

async function readSid(url: URL, request: Request): Promise<string | null> {
	const querySid = url.searchParams.get('sid');
	if (querySid) return querySid;

	// `navigator.sendBeacon` posts as `Blob`/`text` — read body defensively.
	if (request.method === 'POST') {
		try {
			const text = await request.text();
			if (!text) return null;
			try {
				const parsed = JSON.parse(text) as { sid?: string };
				return parsed.sid ?? null;
			} catch {
				const params = new URLSearchParams(text);
				return params.get('sid');
			}
		} catch {
			return null;
		}
	}
	return null;
}

function readAction(url: URL): 'heartbeat' | 'disconnect' {
	return url.searchParams.get('action') === 'disconnect' ? 'disconnect' : 'heartbeat';
}

export async function POST({ url, request }) {
	const sid = await readSid(url, request);
	if (!sid) return json({ ok: false, error: 'sid required' }, { status: 400 });

	if (readAction(url) === 'disconnect') {
		await removeListener(sid).catch(() => {});
	} else {
		await heartbeatListener(sid).catch(() => {});
	}
	return json({ ok: true });
}

export async function DELETE({ url }) {
	const sid = url.searchParams.get('sid');
	if (sid) {
		await removeListener(sid).catch(() => {});
	}
	return json({ ok: true });
}
