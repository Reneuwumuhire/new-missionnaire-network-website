import assert from 'node:assert/strict';
import test from 'node:test';
import { findIndirimboSongs, type IndirimboSong } from './indirimboSource';

const songs = [
	{ id: 'C-Victoire-017' },
	{ id: 'Umuco-228-A' },
	{ id: 'Umuco-228-B' }
] as IndirimboSong[];

test('resolves current Pages song links and saved legacy links', () => {
	assert.equal(
		findIndirimboSongs('https://indirimbo-zikundwa.github.io/songs/C-Victoire-017.html', songs)[0]
			?.id,
		'C-Victoire-017'
	);
	assert.equal(
		findIndirimboSongs('https://indirimbo-zikundwa.github.io/app/#/song/Umuco-228-B', songs)[0]?.id,
		'Umuco-228-B'
	);
	assert.equal(
		findIndirimboSongs('https://indirimbo-zikundwa.bi/Indirimbo/C-Victoire-017.html', songs)[0]?.id,
		'C-Victoire-017'
	);
	assert.equal(
		findIndirimboSongs('https://indirimbo-zikundwa.bi/Indirimbo/Umuco-228.html', songs, {
			versionLabel: 'B'
		})[0]?.id,
		'Umuco-228-B'
	);
	assert.deepEqual(
		findIndirimboSongs('https://indirimbo-zikundwa.bi/Indirimbo/Umuco-228.html', songs, {
			versionLabel: 'A-B'
		}).map((song) => song.id),
		['Umuco-228-A', 'Umuco-228-B']
	);
});

test('rejects unrelated hosts', () => {
	assert.throws(
		() => findIndirimboSongs('https://example.com/app/?song=C-Victoire-017', songs),
		/Unsupported lyrics source/
	);
});
