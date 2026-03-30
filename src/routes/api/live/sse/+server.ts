import { subscribe } from '$lib/server/radio-status-broker';
import { heartbeatListener, removeListener } from '../../../../db/collections';

export function GET({ url }) {
	let unsubscribe: (() => void) | null = null;

	// Use client-provided session ID so page refreshes reuse the same
	// DB record instead of creating duplicates.
	const listenerId = url.searchParams.get('sid') || crypto.randomUUID();

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			heartbeatListener(listenerId).catch(() => {});

			unsubscribe = subscribe((event) => {
				try {
					const data = JSON.stringify(event);
					controller.enqueue(encoder.encode(`data: ${data}\n\n`));

					// Heartbeat every poll (5s) to keep the DB record alive
					heartbeatListener(listenerId).catch(() => {});
				} catch {
					// Stream closed
				}
			});
		},
		cancel() {
			unsubscribe?.();
			removeListener(listenerId).catch(() => {});
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}
