/* eslint-disable no-control-regex */
/**
 * Background-download helper for audio files.
 *
 * Streams the response body, reports progress via the optional callback, then
 * triggers a blob-based `<a download>` save so the browser writes the file to
 * disk without navigating away from the page.
 *
 * Used by:
 * - /live/rediffusions/[id]  (recording download row)
 * - SermonTableItem      (prédications list)
 * - +audioTableItem      (music library — shares the same streaming pattern)
 */

const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|\x00-\x1F]/g;

/** Build a filesystem-portable filename with a `.mp3` extension. */
export function safeAudioFilename(title: string | null | undefined): string {
	const cleaned = (title ?? '').replace(UNSAFE_FILENAME_CHARS, '').replace(/\s+/g, ' ').trim();
	const base = cleaned || 'audio';
	return base.toLowerCase().endsWith('.mp3') ? base : `${base}.mp3`;
}

export interface DownloadProgress {
	/** Bytes pulled from the network so far. */
	loaded: number;
	/** Total bytes expected. 0 when the server didn't expose Content-Length. */
	total: number;
	/** 0–100 when determinate, `null` when total is unknown. */
	percent: number | null;
}

export interface DownloadOptions {
	/** Called every chunk with loaded/total/percent. Fires once before the
	 *  first chunk (loaded=0) and once after the blob finishes. */
	onProgress?: (progress: DownloadProgress) => void;
	/** Used when Content-Length is absent. Useful when the caller already
	 *  knows the expected size (e.g. from a DB record). */
	totalBytesHint?: number;
	/** Abort signal to let callers cancel in-flight downloads. */
	signal?: AbortSignal;
}

/**
 * Fetch an audio URL, stream it to a blob while reporting progress, then
 * trigger a browser download with the given filename.
 *
 * Uses XMLHttpRequest instead of fetch + ReadableStream because XHR's
 * `progress` event is throttled at the network layer (~50 ms intervals)
 * and fires reliably as bytes arrive over the wire. Fetch's ReadableStream
 * is free to buffer the entire body server-side / CORS-layer before
 * yielding chunks to JS — in production that often surfaced as a hard
 * 0% → 100% jump.
 */
export function downloadAudioFile(
	url: string,
	title: string | null | undefined,
	options: DownloadOptions = {}
): Promise<void> {
	const { onProgress, totalBytesHint, signal } = options;

	return new Promise<void>((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('GET', url, true);
		xhr.responseType = 'blob';

		const emit = (loaded: number, total: number) => {
			if (!onProgress) return;
			const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : null;
			onProgress({ loaded, total, percent });
		};

		// Fire an initial 0-state so the UI can render the progress indicator
		// immediately, before any bytes arrive.
		emit(0, totalBytesHint ?? 0);

		xhr.onprogress = (event) => {
			const total = event.lengthComputable
				? event.total
				: (totalBytesHint ?? 0);
			emit(event.loaded, total);
		};

		xhr.onload = () => {
			if (xhr.status < 200 || xhr.status >= 300) {
				reject(new Error(`HTTP ${xhr.status}`));
				return;
			}
			try {
				const blob = xhr.response as Blob;
				const blobUrl = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = blobUrl;
				a.download = safeAudioFilename(title);
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(blobUrl);
				// Final flush: blob.size is always the authoritative total.
				emit(blob.size, blob.size);
				resolve();
			} catch (err) {
				reject(err instanceof Error ? err : new Error(String(err)));
			}
		};

		xhr.onerror = () => reject(new Error('Erreur réseau'));
		xhr.onabort = () => reject(new Error('Téléchargement interrompu'));
		xhr.ontimeout = () => reject(new Error('Délai dépassé'));

		if (signal) {
			if (signal.aborted) {
				xhr.abort();
				return;
			}
			signal.addEventListener('abort', () => xhr.abort(), { once: true });
		}

		xhr.send();
	});
}
