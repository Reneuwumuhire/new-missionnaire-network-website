import test from 'node:test';
import assert from 'node:assert/strict';
import { comparableFilename, s3Url } from './repair-library-asset-urls.mjs';

test('normalizes legacy filenames and escapes S3 key delimiters', () => {
	assert.equal(comparableFilename('MODEÌLE.pdf'), comparableFilename('MODÈLE.pdf'));
	assert.equal(
		s3Url('bucket', 'region', 'pdf/a??b.pdf'),
		'https://bucket.s3.region.amazonaws.com/pdf/a%3F%3Fb.pdf'
	);
});
