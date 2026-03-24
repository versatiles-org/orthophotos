import { expect, test } from 'vitest';
import { config } from './config.ts';

test('config - dirData is set from env', () => {
	// dir_data is set in the test environment via process.env
	expect(typeof config.dirData).toBe('string');
	expect(config.dirData.length).toBeGreaterThan(0);
});

test('config - dirTemp is set from env', () => {
	expect(typeof config.dirTemp).toBe('string');
	expect(config.dirTemp.length).toBeGreaterThan(0);
});

test('config - ssh is populated when ssh_host is set', () => {
	if (process.env['ssh_host']) {
		expect(config.ssh).toBeDefined();
		expect(config.ssh!.host).toBe(process.env['ssh_host']);
		expect(config.ssh!.dir).toBeDefined();
	}
});

test('config - ssh is undefined when ssh_host is not set', () => {
	if (!process.env['ssh_host']) {
		expect(config.ssh).toBeUndefined();
	}
});
