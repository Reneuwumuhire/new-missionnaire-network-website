import { describe, expect, it } from 'vitest';
import {
	FADER_MAX_DB,
	FADER_MIN_DB,
	FLOOR_DB,
	decayHold,
	faderDb,
	faderGain,
	formatDb,
	gainPosition,
	meterFraction,
	toDb
} from './meter';

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

describe('fader taper', () => {
	it('travels in dB, so unity is near the top rather than two thirds up', () => {
		expect(faderDb(1)).toBe(FADER_MAX_DB);
		expect(faderGain(1)).toBeCloseTo(10 ** (6 / 20), 3);
		// Unity gain sits where 0 dB falls on a -60..+6 scale.
		expect(gainPosition(1)).toBeCloseTo(60 / 66, 3);
	});

	it('is silent at the bottom, not merely quiet', () => {
		// -60 dB is still audible; an operator pulling a fader to the floor
		// means off.
		expect(faderDb(0)).toBe(-Infinity);
		expect(faderGain(0)).toBe(0);
		expect(gainPosition(0)).toBe(0);
	});

	it('round-trips a stored amplitude back to the same thumb position', () => {
		for (const position of [0.1, 0.35, 0.6, 60 / 66, 1]) {
			expect(gainPosition(faderGain(position))).toBeCloseTo(position, 5);
		}
	});

	it('puts a level saved before the taper existed somewhere sensible', () => {
		// Old stores held linear amplitude, 1 being unity.
		expect(gainPosition(1)).toBeCloseTo(60 / 66, 3);
		expect(gainPosition(0.5)).toBeGreaterThan(0.7);
		expect(gainPosition(1.5)).toBeLessThanOrEqual(1);
	});

	it('clamps rather than running off either end', () => {
		expect(faderDb(2)).toBe(FADER_MAX_DB);
		expect(gainPosition(0.0001)).toBe(0);
		expect(FADER_MIN_DB).toBeLessThan(0);
	});
});
