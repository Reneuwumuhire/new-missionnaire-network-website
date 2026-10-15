import { expect, it } from 'vitest';
import { mediaUrl } from './media-url';

it('uses the WebView2 origin for both registered media schemes on Windows', () => {
	expect(mediaUrl('localmedia', 'l1', 'Windows NT 10.0')).toBe(
		'http://localmedia.localhost/media?id=l1'
	);
	expect(mediaUrl('ytstream', 's1', 'Windows NT 10.0')).toBe(
		'http://ytstream.localhost/media?id=s1'
	);
});

it('keeps native custom schemes on macOS and encodes the token', () => {
	expect(mediaUrl('localmedia', 'a&b', 'Macintosh')).toBe('localmedia://localhost/media?id=a%26b');
});
