import { expect, it } from 'vitest';
import { normalizePublicationEngagement } from './publicationEngagement';

it('normalizes missing and invalid publication counts', () => {
	expect(
		normalizePublicationEngagement({
			views: 12.8,
			shares: -2,
			reactions: { like: 2.9, heart: 3, laugh: 1, wow: -1, sad: Infinity, pray: Number.NaN }
		})
	).toEqual({
		views: 12,
		shares: 0,
		reactions: { like: 2, heart: 3, laugh: 1, wow: 0, sad: 0, pray: 0 }
	});
});
