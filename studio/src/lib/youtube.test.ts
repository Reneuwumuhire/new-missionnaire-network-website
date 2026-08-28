import { describe, expect, it } from 'vitest';
import { youtubeChatUrl, youtubeVideoId, youtubeWatchUrl } from './youtube';

describe('YouTube live links', () => {
	it.each([
		['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
		['https://youtu.be/dQw4w9WgXcQ?t=3', 'dQw4w9WgXcQ'],
		['https://youtube.com/live/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
		['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ']
	])('reads %s', (url, expected) => expect(youtubeVideoId(url)).toBe(expected));

	it.each([
		'not a link',
		'http://youtube.com/watch?v=dQw4w9WgXcQ',
		'https://example.com/dQw4w9WgXcQ'
	])('rejects %s', (url) => expect(youtubeVideoId(url)).toBeNull());

	it('builds canonical player and chat URLs', () => {
		expect(youtubeWatchUrl('dQw4w9WgXcQ')).toContain('watch?v=dQw4w9WgXcQ');
		expect(youtubeChatUrl('dQw4w9WgXcQ')).toContain('live_chat?v=dQw4w9WgXcQ');
	});
});
