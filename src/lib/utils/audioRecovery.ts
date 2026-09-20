/** Detect a stopped media clock, not silence in the recording. Timer suspension,
 * seeks and brief buffering must not trigger destructive reloads. */
export function createPlaybackStallDetector() {
	let source = '';
	let position = 0;
	let checkedAt = 0;
	let stalledSince = 0;
	let attempts = 0;
	let wasActive = false;
	let progress = 0;
	return (sample: { src: string; time: number; now: number; active: boolean }) => {
		const changedSource = source !== sample.src;
		const moved = Math.abs(sample.time - position) > 0.05;
		const delta = sample.time - position;
		if (changedSource) {
			attempts = 0;
			progress = 0;
		}
		// A reload/seek can jump the clock forward without playing any audio.
		// Re-arm retries only after actual sustained, consecutive progress.
		if (sample.active && wasActive && delta > 0 && delta <= ((sample.now - checkedAt) / 1000) * 2) {
			progress += delta;
			if (progress >= 3) attempts = 0;
		} else {
			progress = 0;
		}
		if (changedSource || moved || !sample.active || sample.now - checkedAt > 10_000) {
			stalledSince = sample.now;
		}
		source = sample.src;
		position = sample.time;
		checkedAt = sample.now;
		wasActive = sample.active;
		if (!sample.active || !source || attempts >= 2 || sample.now - stalledSince < 15_000) {
			return false;
		}
		attempts++;
		progress = 0;
		stalledSince = sample.now;
		return true;
	};
}

/** One cancellable reload. The caller rechecks track identity and play intent
 * before resuming; neither a late canplay nor the fallback may play twice. */
export function reloadAudio(media: HTMLMediaElement, resume: () => void): () => void {
	let settled = false;
	const cancel = () => {
		settled = true;
		clearTimeout(timer);
		media.removeEventListener('canplay', finish);
	};
	const finish = () => {
		if (settled) return;
		cancel();
		resume();
	};
	const timer = setTimeout(finish, 2000);
	media.addEventListener('canplay', finish);
	try {
		media.load();
	} catch {
		finish();
	}
	return cancel;
}
