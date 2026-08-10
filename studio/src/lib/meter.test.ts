import { describe, expect, it } from 'vitest';
import { FLOOR_DB, decayHold, formatDb, meterFraction, toDb } from './meter';

describe('dBFS metering', () => {
	it('maps full scale to 0 dB and half amplitude to −6 dB', () => {
		expect(toDb(1)).toBe(0);
		expect(toDb(0.5)).toBeCloseTo(-6.02, 1);
		expect(toDb(0.1)).toBeCloseTo(-20, 1);
	});

	it('treats silence as −infinity, not as a number', () => {
		// A linear 0 would plot at the far left only by accident; the meter has
		// to decide, not the arithmetic.
		expect(toDb(0)).toBe(-Infinity);
		expect(meterFraction(toDb(0))).toBe(0);
	});

	it('places levels on the −60..0 scale', () => {
		expect(meterFraction(0)).toBe(1);
		expect(meterFraction(FLOOR_DB)).toBe(0);
		expect(meterFraction(-30)).toBeCloseTo(0.5);
	});

	it('clamps anything below the floor or above full scale', () => {
		expect(meterFraction(-120)).toBe(0);
		expect(meterFraction(12)).toBe(1);
		// Amplitude above 1 is clipping, not a louder reading.
		expect(toDb(4)).toBe(0);
	});

	it('formats readouts a sound operator recognises', () => {
		expect(formatDb(0)).toBe('0.0 dB');
		expect(formatDb(-12.34)).toBe('-12.3 dB');
		expect(formatDb(-Infinity)).toBe('−∞ dB');
	});
});

describe('peak hold', () => {
	it('jumps straight to a new peak', () => {
		expect(decayHold(0.2, 0.9, 33)).toBe(0.9);
	});

	it('falls back slowly so a missed transient stays readable', () => {
		const afterOneSecond = decayHold(1, 0, 1000);
		// 20 dB/s on a 60 dB scale = a third of the meter per second.
		expect(afterOneSecond).toBeCloseTo(1 - 1 / 3, 2);
		expect(decayHold(1, 0, 33)).toBeGreaterThan(0.98);
	});

	it('never falls below the live level', () => {
		expect(decayHold(0.5, 0.4, 100_000)).toBe(0.4);
	});
});
