/**
 * IndexedDB-backed cache for decoded waveform peaks, keyed by S3 key.
 * Peaks are ~4000 float values per channel — small, ~16 KB per recording —
 * so we can keep a lot of them without hitting storage pressure.
 *
 * Why cache peaks: wavesurfer's default path re-downloads and re-decodes the
 * full MP3 every time the editor opens. For a 2h broadcast that's
 * ~100 MB of network + several seconds of decode. Peaks don't change for a
 * given S3 object (keys are timestamped on upload), so we can memoize them
 * once and render the waveform instantly on every subsequent open.
 */

const DB_NAME = 'audio-editor-cache';
const STORE = 'peaks';
const DB_VERSION = 1;

export interface CachedPeaks {
	peaks: number[][];
	duration: number;
	cachedAt: number;
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			req.result.createObjectStore(STORE);
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
	});
}

export async function getCachedPeaks(key: string): Promise<CachedPeaks | null> {
	try {
		const db = await openDb();
		return await new Promise<CachedPeaks | null>((resolve) => {
			const tx = db.transaction(STORE, 'readonly');
			const req = tx.objectStore(STORE).get(key);
			req.onsuccess = () => resolve((req.result as CachedPeaks | undefined) ?? null);
			req.onerror = () => resolve(null);
		});
	} catch {
		return null;
	}
}

export async function setCachedPeaks(key: string, value: CachedPeaks): Promise<void> {
	try {
		const db = await openDb();
		await new Promise<void>((resolve) => {
			const tx = db.transaction(STORE, 'readwrite');
			tx.objectStore(STORE).put(value, key);
			tx.oncomplete = () => resolve();
			tx.onerror = () => resolve();
			tx.onabort = () => resolve();
		});
	} catch {
		// Cache write failures are non-fatal.
	}
}

/**
 * Decode an MP3 ArrayBuffer into a single-channel peaks array. Uses an
 * OfflineAudioContext at 8 kHz mono — enough resolution for display, and
 * 5–10× faster than decoding at native 44.1 kHz stereo.
 */
export async function computePeaksFromMp3(
	buffer: ArrayBuffer,
	targetBins = 4000
): Promise<CachedPeaks> {
	// Offline context at 8 kHz mono. length/sampleRate are placeholders for
	// decodeAudioData — the decoder produces its own buffer sized from the source.
	const ctx = new OfflineAudioContext(1, 1, 8000);
	// decodeAudioData mutates the underlying buffer in Safari, so copy.
	const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
	const data = audioBuffer.getChannelData(0);
	const step = Math.max(1, Math.floor(data.length / targetBins));
	const bins = Math.floor(data.length / step);
	const peaks = new Array<number>(bins);
	for (let i = 0; i < bins; i++) {
		let max = 0;
		const base = i * step;
		for (let j = 0; j < step; j++) {
			const v = Math.abs(data[base + j]);
			if (v > max) max = v;
		}
		peaks[i] = max;
	}
	return { peaks: [peaks], duration: audioBuffer.duration, cachedAt: Date.now() };
}
