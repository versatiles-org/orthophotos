import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		reporters: ['default'],
		silent: true,
		env: {
			dir_data: '/tmp/test-data',
			dir_temp: '/tmp/test-temp',
			ssh_host: 'test.example.com',
			ssh_port: '22',
			ssh_id: '/tmp/test-key',
			ssh_dir: '/data/test',
		},
		coverage: {
			include: ['src/**/*.ts'],
			exclude: ['src/regions/**'],
		},
	},
});
