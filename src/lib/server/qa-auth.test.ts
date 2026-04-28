import { describe, expect, it } from 'vitest';
import { resolveQaDisplayName } from './qa-auth';

describe('Q&A guest display names', () => {
	it('keeps a submitted public name when present', () => {
		expect(resolveQaDisplayName('  Marie K.  ')).toBe('Marie K.');
	});

	it('reuses the saved browser name when the field is left empty', () => {
		expect(resolveQaDisplayName('', 'Visiteur 1234')).toBe('Visiteur 1234');
	});

	it('generates an anonymous visitor name when no name exists yet', () => {
		expect(resolveQaDisplayName('', null)).toMatch(/^Visiteur \d{4}$/);
	});
});
