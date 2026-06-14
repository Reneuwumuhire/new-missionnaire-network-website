import type { LayoutServerLoad } from './$types';
import { getLiveAudioSourceUrl } from '$lib/server/live-audio';
import { getRadioCachedStatus, getBroadcastAdminState } from '../db/collections';

// Seed every page render with the current radio state so the live banner
// reflects truth on first paint without any client-side polling. Same shape
// as /api/live/radio-state — clients can hydrate stores directly from this.

export type RadioState = {
	isLive: boolean;
	checkedAt: string;
	listeners: number;
	streamUrl: string | undefined;
	title: string | null;
	description: string | null;
	thumbnailUrl: string | null;
};

const FALLBACK_RADIO_STATE: RadioState = {
	isLive: false,
	checkedAt: new Date(0).toISOString(),
	listeners: 0,
	streamUrl: undefined,
	title: null,
	description: null,
	thumbnailUrl: null
};

export const load: LayoutServerLoad = async () => {
	let radioState: RadioState = FALLBACK_RADIO_STATE;
	try {
		const [status, adminGate] = await Promise.all([
			getRadioCachedStatus(),
			getBroadcastAdminState()
		]);
		const icecastLive = status?.isLive ?? false;
		const isLive = icecastLive && adminGate.is_live;
		radioState = {
			isLive,
			checkedAt: status?.checkedAt ?? new Date().toISOString(),
			listeners: isLive ? (status?.listeners ?? 0) : 0,
			streamUrl: isLive ? (status?.streamUrl ?? getLiveAudioSourceUrl()) : undefined,
			title: adminGate.title,
			description: adminGate.description,
			thumbnailUrl: adminGate.thumbnail_url
		};
	} catch (e) {
		console.error('[LayoutServerLoad] radio state load failed:', e);
	}

	return { radioState };
};
