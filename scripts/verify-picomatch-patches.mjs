import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Audit reports published versions, not pnpm's patched code. Verify every installed
// copy before accepting the single documented advisory exception.
for (const project of ['.', 'admin']) {
	const store = resolve(project, 'node_modules/.pnpm');
	const lock = readFileSync(resolve(store, 'lock.yaml'), 'utf8').split('\nsnapshots:\n')[1];
	assert(lock, `Missing installed dependency snapshots in ${project}`);
	const copies = [...lock.matchAll(/^  (picomatch@[^:\n]+):/gm)].map(([, name]) => {
		assert(name.includes('(patch_hash='), `Unpatched picomatch resolution in ${project}: ${name}`);
		return name.replace('(', '_').replace(')', '');
	});
	assert(copies.length > 0, `Install dependencies in ${project} before checking patches`);
	for (const copy of copies) {
		const entry = resolve(store, copy, 'node_modules/picomatch');
		const result = spawnSync(
			process.execPath,
			[
				'-e',
				`
			const assert = require('node:assert/strict');
			const pm = require(${JSON.stringify(entry)});
			for (const pattern of ['+(*)', '*(*)', '+(*a)', '*(*a)', '+(a*)', '*(a*)']) {
				const re = pm.makeRe(pattern + 'b');
				assert.equal(re.test('a'.repeat(96) + '!'), false, pattern);
				assert.equal(re.test(pattern + 'b'), true, pattern + ' must be literalized');
			}
			assert(pm.isMatch('src/routes/page.ts', 'src/**/*.ts'));
			assert(pm.isMatch('file.js', '*.{js,ts}'));
			assert(pm.isMatch('aaa', '+(a)'));
			assert(pm.isMatch('file.ts', '*.@(js|ts)'));
		`
			],
			{ encoding: 'utf8', timeout: 3000 }
		);
		assert.equal(result.status, 0, `${project}/${copy}: ${result.error ?? result.stderr}`);
	}
	console.log(`Verified ${copies.length} patched picomatch copies in ${project}`);
}
