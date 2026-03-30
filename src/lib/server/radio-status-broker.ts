/**
 * Radio Status Broker
 *
 * Single server-side poller that checks the radio stream status
 * and broadcasts changes to all connected SSE clients.
 * N clients = 1 poll, not N polls.
 */

import { probeLiveAudio, getLiveAudioSourceUrl } from './live-audio';
import { sendPushToAll, radioLivePayload } from './push-notifications';
import { claimNotificationSlot, countActiveListeners } from '../../db/collections';

export type RadioStatusEvent = {
	isLive: boolean;
	checkedAt: string;
	listeners: number;
	streamUrl?: string; // Direct URL to the audio source — bypasses serverless proxy
};

/** Internal status without the dynamic listener count */
type BrokerStatus = {
	isLive: boolean;
	checkedAt: string;
};

type Listener = (event: RadioStatusEvent) => void;

const GLOBAL_KEY = Symbol.for('missionnaire_radio_broker');
const POLL_INTERVAL_MS = 5_000;
const RADIO_NOTIFICATION_COOLDOWN = 10 * 60 * 1000; // 10 min cooldown

interface BrokerState {
	listeners: Set<Listener>;
	timer: ReturnType<typeof setInterval> | null;
	lastStatus: BrokerStatus | null;
	keepAlive: boolean; // true when ensureBrokerPolling() was called — never stop polling
}

const globalAny = globalThis as any;

function getBroker(): BrokerState {
	if (!globalAny[GLOBAL_KEY]) {
		globalAny[GLOBAL_KEY] = {
			listeners: new Set<Listener>(),
			timer: null,
			// Start with null — we don't know the status yet.
			// Don't send a stale isLive:false to new clients.
			lastStatus: null as BrokerStatus | null,
			keepAlive: false
		};
	}
	return globalAny[GLOBAL_KEY];
}

async function poll() {
	const broker = getBroker();
	try {
		const probe = await probeLiveAudio(fetch);
		const status: BrokerStatus = {
			isLive: probe.isLive,
			checkedAt: new Date().toISOString()
		};

		const changed = broker.lastStatus === null || status.isLive !== broker.lastStatus.isLive;
		broker.lastStatus = status;

		// Get the real listener count from the DB — shared across all instances
		let listeners = 0;
		try {
			listeners = await countActiveListeners();
		} catch {
			// DB unavailable — fall back to in-memory count
			listeners = broker.listeners.size;
		}

		// Include the direct stream URL so the client connects directly
		// to the audio source, bypassing the serverless proxy which has
		// execution time limits that kill the stream.
		const streamUrl = status.isLive ? getLiveAudioSourceUrl() : undefined;
		const event: RadioStatusEvent = { ...status, listeners, streamUrl };

		for (const listener of broker.listeners) {
			try {
				listener(event);
			} catch {
				// Listener errored — will be cleaned up when client disconnects
			}
		}

		if (changed) {
			console.log(`[RadioBroker] Status changed: ${status.isLive ? 'LIVE' : 'OFFLINE'}`);
		}

		if (status.isLive) {
			claimNotificationSlot('radio_live', RADIO_NOTIFICATION_COOLDOWN)
				.then((canSend) => {
					if (canSend) {
						console.log('[RadioBroker] Radio is live. Sending push notification.');
						return sendPushToAll(radioLivePayload());
					}
				})
				.catch((e) => console.error('[RadioBroker] Radio push error:', e));
		}
	} catch (error) {
		console.error('[RadioBroker] Poll error:', error);
	}
}

export function ensureBrokerPolling() {
	const broker = getBroker();
	broker.keepAlive = true;
	ensurePolling();
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
	// If keepAlive is set (ensureBrokerPolling was called), never stop polling —
	// we need the interval running for push notifications even with 0 SSE clients.
	if (broker.keepAlive) return;
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
		const status = broker.lastStatus;
		countActiveListeners()
			.then((count) => listener({ ...status, listeners: count }))
			.catch(() => listener({ ...status, listeners: broker.listeners.size }));
	}

	// Return unsubscribe function
	return () => {
		broker.listeners.delete(listener);
		stopPollingIfEmpty();
	};
}

export async function getLastStatus(): Promise<RadioStatusEvent | null> {
	const broker = getBroker();
	if (!broker.lastStatus) return null;
	let listeners = broker.listeners.size;
	try {
		listeners = await countActiveListeners();
	} catch { /* fallback to in-memory */ }
	return { ...broker.lastStatus, listeners };
}
