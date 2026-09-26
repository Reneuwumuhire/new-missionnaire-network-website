import test from 'node:test';
import assert from 'node:assert/strict';
import { partFromFilename, sortParts } from './migrate-literature-zips.mjs';

test('names and chronologically orders ZIP book parts', () => {
	const parts = sortParts(
		[
			'FRN60-0522E Adoption 4 VGR.pdf',
			'FRN60-0518 Adoption 2 VGR.pdf',
			'FRN60-0522M Adoption 3 VGR.pdf',
			'FRN60-0515E Adoption 1 VGR.pdf'
		].map(partFromFilename)
	);
	assert.deepEqual(
		parts.map(({ title, code, position }) => [position, code, title]),
		[
			[1, 'FRN60-0515E', 'Adoption 1'],
			[2, 'FRN60-0518', 'Adoption 2'],
			[3, 'FRN60-0522M', 'Adoption 3'],
			[4, 'FRN60-0522E', 'Adoption 4']
		]
	);
	assert.deepEqual(partFromFilename('63-0317M.pdf'), {
		title: '63-0317M',
		code: '63-0317M'
	});
});
