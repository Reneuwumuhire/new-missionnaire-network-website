import { describe, expect, it } from 'vitest';
import { matchApp } from './appaudio.svelte';

const APPS = [
	{ id: 'company.thebrowser.Browser', name: 'Arc' },
	{ id: 'com.google.Chrome', name: 'Google Chrome' },
	{ id: 'us.zoom.xos', name: 'zoom.us' }
];

describe('matching a shared window to the app behind it', () => {
	it('finds the app named in a window title', () => {
		expect(matchApp('Blessé pour moi — Google Chrome', APPS)?.id).toBe('com.google.Chrome');
	});

	it('is not fooled by case', () => {
		expect(matchApp('ARC', APPS)?.id).toBe('company.thebrowser.Browser');
	});

	it('leaves the choice to the operator when nothing matches', () => {
		expect(matchApp('Écran 1', APPS)).toBeNull();
		expect(matchApp('', APPS)).toBeNull();
	});
});
