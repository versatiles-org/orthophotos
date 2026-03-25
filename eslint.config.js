import tseslint from 'typescript-eslint';

export default tseslint.config(
	{
		ignores: ['node_modules/', 'dist/', 'coverage/', 'test-data/'],
	},
	...tseslint.configs.recommended,
	{
		files: ['src/**/*.ts'],
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'warn',
		},
	},
);
