import { describe, expect, it } from 'vitest';
import {
	normalizeForDuplicateCheck,
	sanitizePlainText,
	slugifyQuestionTitle,
	validateQuestionInput,
	validateReplyInput,
	validateReportInput
} from './validation';

describe('question validation', () => {
	it('sanitizes plain text without preserving unsafe control characters', () => {
		expect(sanitizePlainText('  Bonjour\u0000\r\n\n\n\nmonde  ')).toBe('Bonjour\n\n\nmonde');
	});

	it('creates stable ascii slugs from French titles', () => {
		expect(slugifyQuestionTitle("Que signifie l'appel à la prière ?")).toBe(
			'que-signifie-l-appel-a-la-priere'
		);
	});

	it('normalizes duplicate text aggressively', () => {
		expect(normalizeForDuplicateCheck(' Foi   \n  Vivante ')).toBe('foi vivante');
	});

	it('validates question, reply, and report minimums', () => {
		expect(validateQuestionInput({ title: 'Trop', body: 'court' }).ok).toBe(false);
		expect(
			validateQuestionInput({
				title: 'Une vraie question',
				body: 'Cette question contient assez de contexte pour être relue.',
				category: 'Bible',
				tags: 'foi, parole'
			}).ok
		).toBe(true);
		expect(validateReplyInput({ body: 'Amen' }).ok).toBe(false);
		expect(validateReplyInput({ body: 'Merci pour cette réponse.' }).ok).toBe(true);
		expect(validateReportInput({ reason: 'spam' }).ok).toBe(true);
	});
});
