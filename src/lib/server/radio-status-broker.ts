/**
 * Radio Status Broker
 *
 * Single server-side poller that checks the radio stream status
 * and broadcasts changes to all connected SSE clients.
 * N clients = 1 poll, not N polls.
 */

import { probeLiveAudio } from './live-audio';

export type RadioStatusEvent = {
	isLive: boolean;
	checkedAt: string;
};

type Listener = (event: RadioStatusEvent) => void;

const GLOBAL_KEY = Symbol.for('missionnaire_radio_broker');
const POLL_INTERVAL_MS = 5_000;

interface BrokerState {
	listeners: Set<Listener>;
	timer: ReturnType<typeof setInterval> | null;
	lastStatus: RadioStatusEvent | null;
}

const globalAny = globalThis as any;

function getBroker(): BrokerState {
	if (!globalAny[GLOBAL_KEY]) {
		globalAny[GLOBAL_KEY] = {
			listeners: new Set<Listener>(),
			timer: null,
			// Start with null — we don't know the status yet.
			// Don't send a stale isLive:false to new clients.
			lastStatus: null as RadioStatusEvent | null
		};
	}
	return globalAny[GLOBAL_KEY];
}

async function poll() {
	const broker = getBroker();
	try {
		const probe = await probeLiveAudio(fetch);
		const event: RadioStatusEvent = {
			isLive: probe.isLive,
			checkedAt: new Date().toISOString()
		};

		const changed = broker.lastStatus === null || event.isLive !== broker.lastStatus.isLive;
		broker.lastStatus = event;

		// Broadcast to all listeners (always send so clients know we're alive,
		// but mark whether it actually changed)
		for (const listener of broker.listeners) {
			try {
				listener(event);
			} catch {
				// Listener errored — will be cleaned up when client disconnects
			}
		}

		// If status changed, log it
		if (changed) {
			console.log(`[RadioBroker] Status changed: ${event.isLive ? 'LIVE' : 'OFFLINE'}`);
		}
	} catch (error) {
		console.error('[RadioBroker] Poll error:', error);
	}
}

function ensurePolling() {
	const broker = getBroker();
	if (broker.timer) return;

	// Immediate first poll
	poll();

	broker.timer = setInterval(poll, POLL_INTERVAL_MS);
	console.log('[RadioBroker] Polling started');
}

function stopPollingIfEmpty() {
	const broker = getBroker();
	if (broker.listeners.size === 0 && broker.timer) {
		clearInterval(broker.timer);
		broker.timer = null;
		console.log('[RadioBroker] No listeners, polling stopped');
	}
}

export function subscribe(listener: Listener): () => void {
	const broker = getBroker();
	broker.listeners.add(listener);
	ensurePolling();

	// Only send current status if we've completed at least one real poll.
	// Avoids sending a stale isLive:false that would flip to true moments later.
	if (broker.lastStatus) {
		listener(broker.lastStatus);
	}

	// Return unsubscribe function
	return () => {
		broker.listeners.delete(listener);
		stopPollingIfEmpty();
	};
}

export function getLastStatus(): RadioStatusEvent | null {
	return getBroker().lastStatus;
}
