export type PublicStatus = 'unknown' | 'off' | 'waiting' | 'live' | 'ended';

export function youtubePublicStatus(status: string): PublicStatus {
	if (status === 'live') return 'live';
	if (status === 'complete' || status === 'revoked') return 'ended';
	if (status === 'liveStarting') return 'waiting';
	if (['created', 'ready', 'testStarting', 'testing'].includes(status)) return 'off';
	return 'unknown';
}

export function publicDestinationReady(status: PublicStatus, ending: boolean): boolean {
	return ending ? status === 'off' || status === 'ended' : status === 'live';
}

export async function reconcilePublicDestination({
	read,
	change,
	observe,
	ending,
	canChange
}: {
	read: () => Promise<PublicStatus>;
	change: () => Promise<void>;
	observe: (status: PublicStatus) => void;
	ending: boolean;
	canChange: () => boolean;
}): Promise<boolean> {
	async function check() {
		const status = await read();
		observe(status);
		return status;
	}

	const initial = await check();
	if (publicDestinationReady(initial, ending)) return true;
	if (initial === 'unknown' || !canChange()) return false;
	try {
		await change();
	} catch (error) {
		// The provider may have applied the change before the request timed out.
		if (publicDestinationReady(await check().catch(() => 'unknown'), ending)) return true;
		throw error;
	}
	return publicDestinationReady(await check(), ending);
}
