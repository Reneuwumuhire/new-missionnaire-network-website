import { describe, expect, it } from 'vitest';
import { shouldRunRadioProbe } from './radio-probe-scheduler';

describe('Railway radio probe schedule', () => {
	it('runs every five minutes outside broadcast windows', () => {
		expect(shouldRunRadioProbe(new Date('2026-08-24T12:10:00Z'))).toBe(true);
		expect(shouldRunRadioProbe(new Date('2026-08-24T12:11:00Z'))).toBe(false);
	});

	it('runs every minute inside broadcast windows', () => {
		expect(shouldRunRadioProbe(new Date('2026-08-26T16:11:00Z'))).toBe(true);
		expect(shouldRunRadioProbe(new Date('2026-08-30T06:11:00Z'))).toBe(true);
	});
});
