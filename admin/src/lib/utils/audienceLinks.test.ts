import { describe, expect, it } from 'vitest';
import { visitedPageUrl } from './audienceLinks';

describe('visited page links', () => {
	it('opens recorded paths on the public website', () => {
		expect(visitedPageUrl('/musique', 'https://missionnaire.net')).toBe(
			'https://missionnaire.net/musique'
		);
		expect(visitedPageUrl('/predications/message', 'http://localhost:5174')).toBe(
			'http://localhost:5174/predications/message'
		);
	});

	it('does not create links for paths that could leave the public website', () => {
		for (const path of ['https://example.com', '//example.com', '/\\example.com', '/bad\npath']) {
			expect(visitedPageUrl(path, 'https://missionnaire.net')).toBeNull();
		}
	});
});
