// Level metering in dBFS, the scale every audio desk and OBS uses. A linear
// 0..1 peak is useless to read: half amplitude is −6 dB, not "half loud".

export const FLOOR_DB = -60;

/** Peak amplitude (0..1) as dBFS. Silence is −Infinity; callers clamp. */
export function toDb(peak: number): number {
	if (peak <= 0) return -Infinity;
	return 20 * Math.log10(Math.min(1, peak));
}

/** Where a level sits on a −60..0 dB meter, 0..1. */
export function meterFraction(db: number): number {
	if (!Number.isFinite(db)) return db > 0 ? 1 : 0;
	return Math.max(0, Math.min(1, (db - FLOOR_DB) / -FLOOR_DB));
}

export function formatDb(db: number): string {
	if (!Number.isFinite(db)) return '−∞ dB';
	return `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
}

// ── Fader taper ─────────────────────────────────────────────────
// A fader travels in dB, not in amplitude. Linear amplitude puts unity at two
// thirds of the way up and squashes everything below −20 dB into the bottom
// few percent, which is why a linear fader feels like it does nothing and then
// everything. −60 dB at the bottom, unity at 10/11, +6 dB at the top.

export const FADER_MIN_DB = -60;
export const FADER_MAX_DB = 6;

/** Fader position (0..1) as dB. Position 0 is off, not −60 dB. */
export function faderDb(position: number): number {
	if (position <= 0) return -Infinity;
	const p = Math.min(1, position);
	return FADER_MIN_DB + p * (FADER_MAX_DB - FADER_MIN_DB);
}

/** Fader position (0..1) as a linear amplitude for a GainNode. */
export function faderGain(position: number): number {
	const db = faderDb(position);
	return Number.isFinite(db) ? 10 ** (db / 20) : 0;
}

/** Where a stored amplitude sits on the fader — the inverse, so a level saved
 *  before this existed still lands the thumb in the right place. */
export function gainPosition(gain: number): number {
	if (gain <= 0) return 0;
	const db = 20 * Math.log10(gain);
	if (db <= FADER_MIN_DB) return 0;
	return Math.min(1, (db - FADER_MIN_DB) / (FADER_MAX_DB - FADER_MIN_DB));
}

/** Ticks drawn under a strip, matching OBS's spacing. */
export const METER_TICKS = [-60, -50, -40, -30, -20, -10, 0];

/** Peak hold with a slow fall, so a transient you missed is still visible a
 *  moment later. Returns the new held value. */
export function decayHold(previous: number, current: number, elapsedMs: number): number {
	if (current >= previous) return current;
	// ~20 dB per second on the 0..1 meter scale — fast enough to track a fade,
	// slow enough that a clipped word stays readable.
	return Math.max(current, previous - (elapsedMs / 1000) * (20 / -FLOOR_DB));
}
