import { describe, expect, it } from 'vitest';
import { parseRichText, stripRichTextFormatting } from './rich-text';

describe('rich text formatting', () => {
	it('parses supported inline formatting safely', () => {
		expect(parseRichText('Un **mot** __souligne__ et ~~barre~~.')).toEqual([
			{
				type: 'paragraph',
				children: [
					{ type: 'text', text: 'Un ' },
					{ type: 'bold', children: [{ type: 'text', text: 'mot' }] },
					{ type: 'text', text: ' ' },
					{ type: 'underline', children: [{ type: 'text', text: 'souligne' }] },
					{ type: 'text', text: ' et ' },
					{ type: 'strike', children: [{ type: 'text', text: 'barre' }] },
					{ type: 'text', text: '.' }
				]
			}
		]);
	});

	it('parses quote blocks', () => {
		expect(parseRichText('Avant\n\n> citation\n> suite')).toEqual([
			{ type: 'paragraph', children: [{ type: 'text', text: 'Avant' }] },
			{ type: 'quote', children: [{ type: 'text', text: 'citation\nsuite' }] }
		]);
	});

	it('parses bullet and numbered lists', () => {
		expect(parseRichText('- **Lire**\n- Prier\n\n1. Écouter\n2. Répondre')).toEqual([
			{
				type: 'unorderedList',
				items: [
					[{ type: 'bold', children: [{ type: 'text', text: 'Lire' }] }],
					[{ type: 'text', text: 'Prier' }]
				]
			},
			{
				type: 'orderedList',
				items: [[{ type: 'text', text: 'Écouter' }], [{ type: 'text', text: 'Répondre' }]]
			}
		]);
	});

	it('strips markers for metadata snippets', () => {
		expect(stripRichTextFormatting('> **Jean 14:6**\n- __Je suis__\n1. ~~ici~~')).toBe('Jean 14:6\nJe suis\nici');
	});
});
