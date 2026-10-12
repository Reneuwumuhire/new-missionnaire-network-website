import { expect, it } from 'vitest';
import { GET } from './+server';

it('exposes all archived channel posts for the admin history', async () => {
	const response = await GET({} as never);
	const data = await response.json();
	expect(data.posts).toHaveLength(43);
	expect(data.posts[0]).toMatchObject({
		id: 'WA202610012220',
		publishedAt: '2026-10-01T20:20:00.000Z'
	});
	expect(data.posts[0]).toHaveProperty('excerpt');
	expect(data.posts[0]).not.toHaveProperty('bodyHtml');
});
