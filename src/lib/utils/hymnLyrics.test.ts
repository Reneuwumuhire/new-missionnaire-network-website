import { describe, expect, it } from 'vitest';
import { formatHymnLyrics } from './hymnLyrics';

describe('formatHymnLyrics', () => {
	it('omits the repeated song heading and preserves numbered verses and repeat text', () => {
		const blocks = formatHymnLyrics(
			[
				{ kind: 'heading', text: 'C.V 140 - À tes pieds !' },
				{ verse_number: 1, text: 'First line. {Repeated line.} x2 Last line.' },
				{ verse_number: 2, text: 'Second verse.' }
			],
			'À tes pieds'
		);
		expect(blocks.map(({ number }) => number)).toEqual([1, 2]);
		expect(blocks[0].lines).toEqual([
			[{ text: 'First line.' }, { text: 'Repeated line.', repeat: 2 }, { text: 'Last line.' }]
		]);
	});

	it('keeps editor blocks and refrain headings', () => {
		const blocks = formatHymnLyrics(
			[
				{ block: 0, text: 'First line.' },
				{ block: 0, text: 'Second line.' },
				{ kind: 'heading', text: 'Refrain' },
				{ block: 1, role: 'refrain', text: 'Sing again.' }
			],
			'Another song'
		);
		expect(blocks[0].lines).toHaveLength(2);
		expect(blocks[1].heading).toBe('Refrain');
		expect(blocks[2].refrain).toBe(true);
	});

	it('keeps unmarked legacy text unchanged and handles missing lyrics', () => {
		expect(formatHymnLyrics(null, 'A song')).toEqual([]);
		expect(formatHymnLyrics(['A note {as printed}.', '', null], 'A song')[0].lines).toEqual([
			[{ text: 'A note {as printed}.' }]
		]);
	});
});
