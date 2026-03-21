import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		reporters: ['default'],
		silent: true,
		coverage: {
			include: ['src/**/*.ts'],
			exclude: ['src/regions/**'],
		},
	},
});
