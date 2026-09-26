import test from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { parseCatalog, patchForMatch, resolveCatalog } from './sync-branham-sermons.mjs';

const card = (
	code,
	title,
	links = ''
) => `<div class="large-24 medium-24 small-24 columns end message">
<div class="prodtext">KIN ${code}</div><span class="prodtexttitle">${title}</span>
<div class="prodtext2"> Kigali RW</div><div class="prodtext2"> 89 min</div>${links}</div>`;

test('parses official language resources without downloading them', () => {
	const [item] = parseCatalog(
		card(
			'64-0629',
			'Imana Ikomeye &amp; Ihishuye',
			'<a href="https://assets.test/rw.pdf"></a><a href="https://assets.test/rw.m4a"></a><a href="/en/messagestream/KIN=64-0629"></a>'
		),
		'KIN'
	);
	assert.deepEqual(
		{ code: item.code, title: item.title, pdfUrl: item.pdfUrl, audioUrl: item.audioUrl },
		{
			code: '64-0629',
			title: 'Imana Ikomeye & Ihishuye',
			pdfUrl: 'https://assets.test/rw.pdf',
			audioUrl: 'https://assets.test/rw.m4a'
		}
	);
});

test('matches by code or same title and date, never by title alone', () => {
	const exact = {
		_id: new ObjectId(),
		date_code: '64-0629',
		full_date_code: '64-0629',
		english_title: 'English title'
	};
	const alias = {
		_id: new ObjectId(),
		date_code: '57-0421M',
		english_title: 'The Great And Mighty Conqueror'
	};
	const entries = [
		{ catalog: 'KIN', code: '64-0629', title: 'Translated', isSermon: true },
		{ catalog: 'ENG', code: '57-0421S', title: 'The Great And Mighty Conqueror!', isSermon: true },
		{ catalog: 'ENG', code: '58-0000', title: 'The Great And Mighty Conqueror', isSermon: true }
	];
	const result = resolveCatalog(entries, [exact, alias]);
	assert.equal(result.matched.length, 2);
	assert.equal(result.unmatched[0].code, '58-0000');
});

test('fills only missing localized fields and reports conflicts', () => {
	const document = {
		localizations: { rw: { title: 'Existing title', pdf_url: 'https://assets.test/existing.pdf' } }
	};
	const { set, conflicts } = patchForMatch(document, {
		catalog: 'KIN',
		code: '64-0629',
		title: 'Different title',
		pdfUrl: 'https://assets.test/new.pdf',
		audioUrl: 'https://assets.test/new.m4a',
		sourceUrl: 'https://branham.org/en/messagestream/KIN=64-0629'
	});
	assert.equal(set['localizations.rw.audio_url'], 'https://assets.test/new.m4a');
	assert.equal(conflicts.length, 2);
	assert.ok(!('localizations.rw.pdf_url' in set));
});
