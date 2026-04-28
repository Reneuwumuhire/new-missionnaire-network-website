import { describe, expect, it } from 'vitest';
import { parseRichText, stripRichTextFormatting } from './rich-text';

describe('rich text formatting', () => {
	it('parses supported inline formatting safely', () => {
		expect(parseRichText('Un **mot** *italique* __souligne__ et ~~barre~~.')).toEqual([
			{
				type: 'paragraph',
				children: [
					{ type: 'text', text: 'Un ' },
					{ type: 'bold', children: [{ type: 'text', text: 'mot' }] },
					{ type: 'text', text: ' ' },
					{ type: 'italic', children: [{ type: 'text', text: 'italique' }] },
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

	it('parses safe markdown links and pasted urls', () => {
		expect(
			parseRichText('Voir [la vidéo](https://www.youtube.com/watch?v=abc123) et https://cdn.example.org/transcription.pdf.')
		).toEqual([
			{
				type: 'paragraph',
				children: [
					{ type: 'text', text: 'Voir ' },
					{
						type: 'link',
						href: 'https://www.youtube.com/watch?v=abc123',
						children: [{ type: 'text', text: 'la vidéo' }]
					},
					{ type: 'text', text: ' et ' },
					{
						type: 'link',
						href: 'https://cdn.example.org/transcription.pdf',
						children: [{ type: 'text', text: 'https://cdn.example.org/transcription.pdf' }]
					},
					{ type: 'text', text: '.' }
				]
			}
		]);
	});

	it('keeps unsafe markdown links as text', () => {
		expect(parseRichText('[piège](javascript:alert(1))')).toEqual([
			{ type: 'paragraph', children: [{ type: 'text', text: '[piège](javascript:alert(1))' }] }
		]);
	});

	it('strips markers for metadata snippets', () => {
		expect(stripRichTextFormatting('> **Jean 14:6**\n- __Je suis__\n1. ~~ici~~\n[PDF](https://example.org/a.pdf)')).toBe(
			'Jean 14:6\nJe suis\nici\nPDF'
		);
	});
});
