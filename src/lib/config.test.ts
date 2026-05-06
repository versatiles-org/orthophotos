import { expect, test } from 'vitest';
import { getConfig } from './config.ts';

test('getConfig - dirData is set from env', () => {
	const config = getConfig();
	expect(typeof config.dirData).toBe('string');
	expect(config.dirData.length).toBeGreaterThan(0);
});

test('getConfig - dirTemp is set from env', () => {
	const config = getConfig();
	expect(typeof config.dirTemp).toBe('string');
	expect(config.dirTemp.length).toBeGreaterThan(0);
});

test('getConfig - ssh is populated when ssh_host is set', () => {
	const config = getConfig();
	if (process.env['ssh_host']) {
		expect(config.ssh).toBeDefined();
		expect(config.ssh!.host).toBe(process.env['ssh_host']);
		expect(config.ssh!.dir).toBeDefined();
	}
});

test('getConfig - ssh is undefined when ssh_host is not set', () => {
	const config = getConfig();
	if (!process.env['ssh_host']) {
		expect(config.ssh).toBeUndefined();
	}
});
