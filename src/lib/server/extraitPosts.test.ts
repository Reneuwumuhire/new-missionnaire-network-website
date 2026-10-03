import { describe, expect, it } from 'vitest';
import { addMissingPdfLink, whatsappTextFromHtml } from './extraitPosts';

describe('whatsappTextFromHtml', () => {
	it('restores WhatsApp formatting and leading media icons', () => {
		expect(
			whatsappTextFromHtml(
				'🎦 «Un <strong>avertissement</strong><br><br><em>Une citation</em> &amp; <code>un passage</code>»'
			)
		).toBe('🎦 «Un *avertissement*\n\n_Une citation_ & `un passage`»');
	});
});

describe('addMissingPdfLink', () => {
	it('adds a PDF that became available after publication', () => {
		expect(addMissingPdfLink([], 'https://cdn.example.com/message.pdf')).toEqual([
			{ label: 'Lire le PDF', href: 'https://cdn.example.com/message.pdf', kind: 'pdf' }
		]);
	});

	it('keeps an existing manual PDF link', () => {
		const links = [{ label: 'PDF corrigé', href: '/pdf/manual', kind: 'pdf' }];
		expect(addMissingPdfLink(links, 'https://cdn.example.com/new.pdf')).toBe(links);
	});
});
