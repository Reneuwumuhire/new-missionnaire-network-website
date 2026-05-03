import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { concatListPath, fileExists, mp3Path } from './sidecar.js';

/** Concatenate ordered MP3 segments into the canonical {id}.mp3 file using
 *  ffmpeg's concat demuxer (`-c copy` so re-encoding is skipped). Cleans up
 *  the segment files and the temp list on success.
 *
 *  Single-segment recordings just rename — no ffmpeg needed.
 *  Caller is responsible for ensuring `segments` are existing files. */
export async function concatSegments(id: string, segments: string[]): Promise<void> {
	if (segments.length === 0) {
		throw new Error(`concatSegments(${id}): no segments`);
	}

	const finalPath = mp3Path(id);

	if (segments.length === 1) {
		// Single segment, no concat needed — just move into place.
		await fs.rename(segments[0], finalPath);
		return;
	}

	const listPath = concatListPath(id);
	// ffmpeg concat list format. Single quotes around each path; escape any
	// embedded single quotes per ffmpeg spec ('\\'' inside single-quoted str).
	const lines = segments.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
	await fs.writeFile(listPath, lines + '\n', 'utf8');

	await new Promise<void>((resolve, reject) => {
		const proc = spawn(
			'ffmpeg',
			[
				'-nostdin',
				'-hide_banner',
				'-loglevel',
				'warning',
				'-y',
				'-f',
				'concat',
				'-safe',
				'0',
				'-i',
				listPath,
				'-c',
				'copy',
				finalPath
			],
			{ stdio: ['ignore', 'inherit', 'inherit'] }
		);
		proc.once('error', reject);
		proc.once('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`ffmpeg concat exited with code ${code}`));
		});
	});

	// Best-effort cleanup of segment files + manifest. Failures here don't
	// invalidate the concat — the broader removeRecordingFiles() at end of
	// upload will sweep anything we miss.
	await Promise.allSettled([
		fs.unlink(listPath),
		...segments.map((p) => fs.unlink(p))
	]);
}

/** Filter a list of segment paths to those that still exist on disk, in order. */
export async function existingSegments(segments: string[]): Promise<string[]> {
	const result: string[] = [];
	for (const p of segments) {
		if (await fileExists(p)) result.push(p);
	}
	return result;
}
