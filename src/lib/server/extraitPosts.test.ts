import { describe, expect, it } from 'vitest';
import { whatsappTextFromHtml } from './extraitPosts';

describe('whatsappTextFromHtml', () => {
	it('restores WhatsApp formatting and leading media icons', () => {
		expect(
			whatsappTextFromHtml(
				'🎦 «Un <strong>avertissement</strong><br><br><em>Une citation</em> &amp; <code>un passage</code>»'
			)
		).toBe('🎦 «Un *avertissement*\n\n_Une citation_ & `un passage`»');
	});
});
