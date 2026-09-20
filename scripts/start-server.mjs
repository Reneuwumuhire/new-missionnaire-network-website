import { spawn } from 'node:child_process';

// Keep PDF CPU/memory work outside the web server. No queue service dependency.
const children = new Set();
let stopping = false;
function start(path, critical = false) {
	const child = spawn(process.execPath, [path], { stdio: 'inherit', env: process.env });
	children.add(child);
	child.on('error', (error) => {
		console.error(error.message);
		if (critical) stop(1);
	});
	child.on('exit', (code) => {
		children.delete(child);
		if (stopping) return;
		if (critical) stop(code || 1);
		else
			setTimeout(() => {
				if (!stopping) start(path);
			}, 30_000).unref();
	});
}
function stop(code = 0) {
	if (stopping) return;
	stopping = true;
	for (const child of children) child.kill('SIGTERM');
	// Bound shutdown even when an extractor/database connection is stuck.
	setTimeout(() => {
		for (const child of children) child.kill('SIGKILL');
		process.exit(code);
	}, 10_000).unref();
	process.exitCode = code;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
start('build/index.js', true);
if (process.env.LIBRARY_INDEXING_ENABLED !== '0') start('scripts/library-index-worker.mjs');
