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
