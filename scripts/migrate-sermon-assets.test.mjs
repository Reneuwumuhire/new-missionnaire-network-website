import assert from 'node:assert/strict';
import test from 'node:test';
import { safeTitle, sermonAssetKey, sortJobs } from './migrate-sermon-assets.mjs';

test('builds existing chronological sermon paths for every language', () => {
	const sermon = {
		full_date_code: '64-0629',
		french_title: 'Pourquoi?',
		english_title: 'Why?',
		localizations: { rw: { title: 'Imana / Ikomeye' }, sw: { title: 'Mungu Mkuu' } }
	};
	assert.equal(safeTitle("L'Expectative?"), 'LExpectative');
	assert.equal(
		sermonAssetKey(sermon, 'rw', 'pdf', 'https://d2w09gj4mqt5u.cloudfront.net/a.pdf'),
		'sermons/1964/06/kinyarwanda/Imana Ikomeye - 1964-06-29.pdf'
	);
	assert.deepEqual(
		sortJobs([
			{ code: '64-0629E', language: 'fr', kind: 'pdf' },
			{ code: '64-0629M', language: 'sw', kind: 'pdf' },
			{ code: '64-0629M', language: 'rw', kind: 'audio' }
		]).map(({ language, kind }) => `${language}-${kind}`),
		['rw-audio', 'sw-pdf', 'fr-pdf']
	);
});
