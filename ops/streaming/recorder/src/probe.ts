import { spawn } from 'node:child_process';

/**
 * Returns the actual audio duration of an mp3 file in whole seconds, or null
 * when ffprobe can't determine it (missing file, zero-byte, corrupt header).
 * Used to detect gaps caused by network drops: ffmpeg reconnects to Icecast
 * but any audio received during the outage is never written to disk, so the
 * file duration can be well below (stoppedAt - startedAt).
 */
export function probeDurationSec(filePath: string): Promise<number | null> {
	return new Promise((resolve) => {
		const proc = spawn(
			'ffprobe',
			[
				'-v',
				'error',
				'-show_entries',
				'format=duration',
				'-of',
				'default=noprint_wrappers=1:nokey=1',
				filePath
			],
			{ stdio: ['ignore', 'pipe', 'pipe'] }
		);

		let stdout = '';
		let stderr = '';
		proc.stdout.on('data', (chunk) => {
			stdout += chunk.toString();
		});
		proc.stderr.on('data', (chunk) => {
			stderr += chunk.toString();
		});
		proc.once('error', (err) => {
			console.error('[recorder/probe] ffprobe failed to spawn', err);
			resolve(null);
		});
		proc.once('exit', (code) => {
			if (code !== 0) {
				console.warn(`[recorder/probe] ffprobe exited ${code} for ${filePath}: ${stderr.trim()}`);
				resolve(null);
				return;
			}
			const parsed = Number.parseFloat(stdout.trim());
			if (!Number.isFinite(parsed) || parsed < 0) {
				resolve(null);
				return;
			}
			resolve(Math.floor(parsed));
		});
	});
}
