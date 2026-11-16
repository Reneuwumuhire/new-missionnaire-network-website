import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const routes = 'admin/src/routes';
const alternateIdentities = new Map([
	['healthz/+server.ts', 'GET'],
	['login/+page.server.ts', 'load,actions'],
	['login/verify/+page.server.ts', 'load,actions'],
	['login/passkey/+server.ts', 'GET,POST'],
	['api/studio/update/+server.ts', 'GET'],
	['api/studio/youtube/+server.ts', 'POST']
]);
const routeExports = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|fallback|load|actions)$/;
let checked = 0;

function verifyHandler(fn, label, layout) {
	assert(fn?.body && ts.isBlock(fn.body), `Expected a handler body in ${label}`);
	const statements = fn.body.statements;
	const first = statements[layout ? 1 : 0];
	const expression =
		first &&
		(ts.isVariableStatement(first)
			? first.declarationList.declarations[0].initializer
			: ts.isExpressionStatement(first)
				? first.expression
				: undefined);
	assert(
		expression &&
			ts.isAwaitExpression(expression) &&
			ts.isCallExpression(expression.expression) &&
			expression.expression.expression.getText() === 'verifyAdminSession',
		`Missing handler-level verifyAdminSession in ${label}`
	);
	checked++;
}

for (const file of readdirSync(routes, { recursive: true })) {
	if (!/\+(?:(?:layout|page)\.)?server\.[jt]s$/.test(file)) continue;
	const source = ts.createSourceFile(
		file,
		readFileSync(join(routes, file), 'utf8'),
		ts.ScriptTarget.Latest,
		true
	);
	const exempt = new Set(alternateIdentities.get(file)?.split(',') ?? []);
	for (const statement of source.statements) {
		if (ts.isExportDeclaration(statement) || ts.isExportAssignment(statement)) {
			assert.fail(`Review re-exported handlers in ${file}`);
		}
		if (!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
			continue;
		const exports = ts.isVariableStatement(statement)
			? statement.declarationList.declarations.map(({ name, initializer }) => [
					name.getText(),
					initializer
				])
			: ts.isFunctionDeclaration(statement)
				? [[statement.name?.text, statement]]
				: [];
		for (const [name, handler] of exports) {
			if (!routeExports.test(name) || exempt.has(name)) continue;
			if (name === 'actions') {
				assert(
					handler && ts.isObjectLiteralExpression(handler),
					`Review action exports in ${file}`
				);
				for (const action of handler.properties) {
					const label = `${file} ${action.name?.getText()}`;
					assert(
						ts.isPropertyAssignment(action) || ts.isMethodDeclaration(action),
						`Review action in ${label}`
					);
					verifyHandler(ts.isMethodDeclaration(action) ? action : action.initializer, label, false);
				}
			} else {
				verifyHandler(handler, `${file} ${name}`, file === '+layout.server.ts');
			}
		}
	}
}

const publicNames = new Set(['PUBLIC_MAIN_URL', 'PUBLIC_VAPID_KEY']);
for (const directory of ['src', 'admin/src']) {
	for (const file of readdirSync(directory, { recursive: true })) {
		if (!/\.(ts|js|svelte|html)$/.test(file) || /\.(test|spec)\./.test(file)) continue;
		const source = readFileSync(join(directory, file), 'utf8');
		for (const [, name] of source.matchAll(
			/\b((?:NEXT_PUBLIC_|PUBLIC_|VITE_)[A-Z][A-Z0-9_]*)\b/g
		)) {
			if (file === 'db/questions.ts' && name === 'PUBLIC_STATUSES') continue;
			assert(
				publicNames.has(name),
				`Review public environment variable ${name} in ${directory}/${file}`
			);
		}
		if (file.endsWith('.svelte')) {
			assert(
				!/\$app\/env\/private|\$env\/(?:dynamic|static)\/private|\bprocess\.env\b/.test(source),
				`Server environment access in ${directory}/${file}`
			);
		}
		assert(
			!/mongodb(?:\+srv)?:\/\/[^\s/]+:[^\s/]+@/.test(source),
			`Embedded MongoDB credentials in ${directory}/${file}`
		);
	}
}

const offline = readFileSync('static/offline.html', 'utf8');
assert(!/<script\s*>|\son\w+\s*=/i.test(offline) && existsSync('static/offline.js'));
assert(!existsSync('cookies.txt') || !process.env.CI, 'Do not commit cookies.txt');
console.log(`Verified ${checked} admin handlers and public environment declarations.`);
