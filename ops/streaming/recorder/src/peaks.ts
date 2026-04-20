import { spawn } from 'node:child_process';

const PEAK_BINS = 4000;
const SAMPLE_RATE = 8000;
const BYTES_PER_SAMPLE = 2; // s16le

export interface Peaks {
	peaks: number[]; // 0..1 magnitude, length === PEAK_BINS (or less for very short clips)
	durationSec: number;
}

/**
 * Generate a waveform peaks array from an MP3 on disk by streaming it through
 * ffmpeg as mono 8 kHz s16le PCM and computing per-bin max amplitudes.
 *
 * No extra Node dependencies — ffmpeg is already present on the recorder VM
 * for the live capture pipeline. Peaks for a 2h broadcast take ~5s to
 * generate on commodity hardware and produce ~32 KB of BSON when persisted.
 *
 * The peaks are stored inline on the recording document so the admin editor
 * can render the waveform on first open without re-fetching + re-decoding
 * the MP3 on the client.
 */
export function generatePeaks(mp3Path: string, durationHintSec: number): Promise<Peaks> {
	return new Promise((resolve, reject) => {
		// Estimate total PCM samples up front so we can compute a target
		// samples-per-bin at stream start. A rough duration is enough —
		// we clamp at the end so bin count never exceeds PEAK_BINS.
		const expectedSamples = Math.max(1, Math.round(durationHintSec * SAMPLE_RATE));
		const samplesPerBin = Math.max(1, Math.floor(expectedSamples / PEAK_BINS));

		const args = [
			'-nostdin',
			'-hide_banner',
			'-loglevel',
			'error',
			'-i',
			mp3Path,
			'-ac',
			'1',
			'-ar',
			String(SAMPLE_RATE),
			'-f',
			's16le',
			'-'
		];

		const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

		const peaks: number[] = [];
		let currentBinMax = 0;
		let samplesInBin = 0;
		let totalSamples = 0;
		// Carry one byte across chunk boundaries — s16le samples are 2 bytes
		// so a chunk can end mid-sample.
		let halfSample: number | null = null;

		proc.stdout.on('data', (chunk: Buffer) => {
			let offset = 0;
			// If we have a leftover byte from the previous chunk, pair it
			// with the first byte of this one to complete a sample.
			if (halfSample !== null && chunk.length > 0) {
				const lo = halfSample;
				const hi = chunk[0];
				const s = toSigned16(lo | (hi << 8));
				const mag = Math.abs(s) / 32768;
				if (mag > currentBinMax) currentBinMax = mag;
				samplesInBin++;
				totalSamples++;
				if (samplesInBin >= samplesPerBin) {
					peaks.push(round3(currentBinMax));
					currentBinMax = 0;
					samplesInBin = 0;
				}
				halfSample = null;
				offset = 1;
			}

			const usableLen = chunk.length - offset;
			const wholeSamples = Math.floor(usableLen / BYTES_PER_SAMPLE);
			for (let i = 0; i < wholeSamples; i++) {
				const o = offset + i * BYTES_PER_SAMPLE;
				const s = toSigned16(chunk[o] | (chunk[o + 1] << 8));
				const mag = Math.abs(s) / 32768;
				if (mag > currentBinMax) currentBinMax = mag;
				samplesInBin++;
				totalSamples++;
				if (samplesInBin >= samplesPerBin) {
					peaks.push(round3(currentBinMax));
					currentBinMax = 0;
					samplesInBin = 0;
				}
			}

			const consumed = offset + wholeSamples * BYTES_PER_SAMPLE;
			if (consumed < chunk.length) {
				// One odd byte left over — save for the next chunk.
				halfSample = chunk[consumed];
			}
		});

		let stderr = '';
		proc.stderr.on('data', (c: Buffer) => {
			stderr += c.toString();
		});

		proc.on('error', (err) => reject(err));
		proc.on('exit', (code) => {
			if (code !== 0) {
				reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().slice(0, 500)}`));
				return;
			}
			// Flush the last partial bin if any samples landed in it.
			if (samplesInBin > 0) peaks.push(round3(currentBinMax));
			// Cap at PEAK_BINS in case the duration hint was low and we overshot.
			const capped = peaks.length > PEAK_BINS ? peaks.slice(0, PEAK_BINS) : peaks;
			resolve({
				peaks: capped,
				durationSec: totalSamples / SAMPLE_RATE
			});
		});
	});
}

function toSigned16(u16: number): number {
	return u16 & 0x8000 ? u16 - 0x10000 : u16;
}

function round3(n: number): number {
	// Clamp precision — 3 decimals is enough for a waveform and keeps BSON
	// serialization tight.
	return Math.round(n * 1000) / 1000;
}
