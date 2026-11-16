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
		'--fail-on',
		'high'
	],
	['npm', 'run', 'lint:mongodb'],
	['pnpm', 'audit', '--audit-level=high'],
	['pnpm', '--dir', 'admin', 'audit', '--audit-level=high'],
	['npm', 'run', 'security:verify']
];

for (const [command, ...args] of checks) {
	console.log(`\n> ${[command, ...args].join(' ')}`);
	const result = spawnSync(command, args, { stdio: 'inherit' });
	if (result.error) console.error(result.error.message);
	if (result.status !== 0) process.exitCode = 1;
}
