import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDuration } from './backfill-sermon-durations.mjs';

test('accepts finite media durations and rejects invalid metadata', () => {
	assert.equal(parseDuration('5342.49\n'), 5342);
	assert.throws(() => parseDuration('N/A'));
	assert.throws(() => parseDuration('0'));
});
