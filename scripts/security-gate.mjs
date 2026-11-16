import { spawnSync } from 'node:child_process';

const checks = [
	[
		'npm',
		'exec',
		'--yes',
		'--ignore-scripts',
		'--package=next-secure-check@0.6.1',
		'--',
		'next-secure-check',
		'scan',
		'.',
		'--preset',
		'app',
		// The audio recorder is deployed separately from the web apps.
		'--exclude',
		'ops/streaming/recorder/**',
		'--fail-on',
		'high'
	],
	['npm', 'run', 'lint:mongodb'],
	['pnpm', 'audit', '--audit-level=high'],
	['pnpm', '--dir', 'admin', 'audit', '--audit-level=high'],
	['npm', 'run', 'security:verify']
];

const failures = [];

for (const [command, ...args] of checks) {
	const check = [command, ...args].join(' ');
	console.log(`\n> ${check}`);
	const result = spawnSync(command, args, { stdio: 'inherit' });
	if (result.status === 0) continue;

	const reason = result.error?.message ?? result.signal ?? `exit code ${result.status}`;
	failures.push(`- ${check} (${reason})`);
}

if (failures.length > 0) {
	console.error(`\nSecurity gate failed:\n${failures.join('\n')}`);
	process.exitCode = 1;
}
