import { expect, it } from 'vitest';
import { visitorCountry } from './visitorCountry';

it('uses the Fly client IP for direct Fly requests', () => {
	const headers = new Headers({
		'fly-client-ip': '41.186.0.1',
		'cf-ipcountry': 'US'
	});
	expect(visitorCountry(headers, true)).toBe('RW');
	headers.set('fly-client-ip', '2001:4860:4860::8888');
	expect(visitorCountry(headers, true)).toBe('US');
	headers.set('fly-client-ip', '127.0.0.1');
	expect(visitorCountry(headers, true)).toBeNull();
});

it('accepts recognized country headers for other deployments', () => {
	const headers = new Headers({ 'cf-ipcountry': 'XX', 'x-vercel-ip-country': 'be' });
	expect(visitorCountry(headers, false)).toBe('BE');
	expect(visitorCountry(new Headers(), false)).toBeNull();
});
