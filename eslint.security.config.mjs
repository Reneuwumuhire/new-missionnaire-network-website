import { createRequire } from 'node:module';
import { delimiter, join } from 'node:path';
import parser from '@typescript-eslint/parser';

// npm exec places the pinned plugin in its tool cache and adds that cache to PATH.
const pluginPath = (process.env.PATH ?? '').split(delimiter).find((directory) => {
	try {
		createRequire(join(directory, 'eslint-security.cjs')).resolve('eslint-plugin-mongodb-security');
		return true;
	} catch {
		return false;
	}
});
if (!pluginPath) throw new Error('Load the MongoDB plugin with npm run lint:mongodb');

const loaded = createRequire(join(pluginPath, 'eslint-security.cjs'))(
	'eslint-plugin-mongodb-security'
);
const mongodb = loaded.default ?? loaded;
const recommended = mongodb.configs['flat/recommended'] ?? mongodb.configs.recommended;
const rules = Object.assign({}, ...[recommended].flat().map((config) => config.rules));
if (Object.keys(rules).length === 0) throw new Error('MongoDB recommended rules were not loaded');

export default [
	{ ignores: ['**/*.test.ts', '**/*.spec.ts'] },
	{
		files: ['src/**/*.{ts,js}', 'admin/src/**/*.{ts,js}'],
		languageOptions: { parser },
		plugins: { 'mongodb-security': mongodb },
		rules
	}
];
