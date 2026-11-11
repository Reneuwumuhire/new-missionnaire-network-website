import { describe, expect, it } from 'vitest';
import {
	isAudiencePageRoute,
	resolveAudiencePeriod,
	resolveAudienceRoute
} from './audience-period';

const now = new Date('2026-11-11T04:45:00Z'); // 06:45 in Kigali

function select(query: string) {
	return resolveAudiencePeriod(new URLSearchParams(query), now);
}

describe('audience time ranges', () => {
	it('uses a 30-day view by default and maps short windows to chart buckets', () => {
		expect(select('')).toMatchObject({ key: '30', from: '2026-10-13', through: '2026-11-11' });
		expect(select('days=4h')).toMatchObject({
			key: '4h',
			recentMinutes: 240,
			bucketMinutes: 15,
			bucketCount: 16
		});
	});

	it('uses Kigali calendar dates for named periods', () => {
		expect(select('days=today')).toMatchObject({ from: '2026-11-11', through: '2026-11-11' });
		expect(select('days=yesterday')).toMatchObject({
			from: '2026-11-10',
			through: '2026-11-10'
		});
		expect(select('days=previous_week')).toMatchObject({
			from: '2026-11-02',
			through: '2026-11-08'
		});
		expect(select('days=previous_month')).toMatchObject({
			from: '2026-10-01',
			through: '2026-10-31'
		});
		expect(
			resolveAudiencePeriod(new URLSearchParams('days=today'), new Date('2026-11-10T22:30:00Z'))
		).toMatchObject({ from: '2026-11-11', through: '2026-11-11' });
	});

	it('accepts valid custom dates and rejects invalid, future, or oversized ranges', () => {
		expect(select('days=custom&from=2026-10-01&through=2026-10-08')).toMatchObject({
			key: 'custom',
			from: '2026-10-01',
			through: '2026-10-08'
		});
		for (const query of [
			'days=custom&from=2026-02-30&through=2026-03-01',
			'days=custom&from=2026-11-12&through=2026-11-13',
			'days=custom&from=2025-01-01&through=2026-11-11',
			'days=custom&from=2026-11-10&through=2026-11-09'
		]) {
			expect(select(query).key).toBe('30');
		}
	});
});

describe('audience route filter', () => {
	it('accepts a page path and treats a blank route as all pages', () => {
		expect(resolveAudienceRoute(new URLSearchParams('route=%2Flive%2Frediffusions'))).toBe(
			'/live/rediffusions'
		);
		expect(resolveAudienceRoute(new URLSearchParams('route=+'))).toBeNull();
	});

	it('rejects URLs, control characters, and query strings', () => {
		for (const route of [
			'https://example.com',
			'//example.com',
			'/bad\\path',
			'/bad\npath',
			'/music?x=1',
			'/wp/'
		]) {
			expect(resolveAudienceRoute(new URLSearchParams({ route }))).toBeNull();
		}
	});

	it('lists website pages without scanner paths', () => {
		expect(isAudiencePageRoute('/musique')).toBe(true);
		expect(isAudiencePageRoute('/live/rediffusions/6af0a3059cdc999b30c03912')).toBe(true);
		expect(isAudiencePageRoute('/wp/')).toBe(false);
		expect(isAudiencePageRoute('/graphql')).toBe(false);
	});
});
