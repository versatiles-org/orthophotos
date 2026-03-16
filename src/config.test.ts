import { expect, test } from 'vitest';
import { getDataDir, getTempDir, loadConfig, requireRsyncConfig } from './config.ts';

test('getDataDir - returns env value when set', () => {
	process.env['dir_data'] = '/test/path';
	expect(getDataDir()).toBe('/test/path');
});

test('getDataDir - throws when not set', () => {
	delete process.env['dir_data'];
	expect(() => getDataDir()).toThrow('Required environment variable "dir_data" is not set');
});

test('getTempDir - returns env value when set', () => {
	process.env['dir_temp'] = '/test/temp';
	expect(getTempDir()).toBe('/test/temp');
});

test('getTempDir - throws when not set', () => {
	delete process.env['dir_temp'];
	expect(() => getTempDir()).toThrow('Required environment variable "dir_temp" is not set');
});

test('loadConfig - returns config with all values', () => {
	process.env['dir_data'] = '/data';
	process.env['dir_temp'] = '/temp';
	process.env['rsync_host'] = 'host.example.com';
	process.env['rsync_port'] = '22';
	process.env['rsync_id'] = '/path/to/key';

	const config = loadConfig();
	expect(config.dirData).toBe('/data');
	expect(config.dirTemp).toBe('/temp');
	expect(config.rsyncHost).toBe('host.example.com');
	expect(config.rsyncPort).toBe('22');
	expect(config.rsyncId).toBe('/path/to/key');
});

test('loadConfig - throws when dir_data missing', () => {
	delete process.env['dir_data'];
	process.env['dir_temp'] = '/temp';
	expect(() => loadConfig()).toThrow('Required environment variable "dir_data" is not set');
});

test('loadConfig - throws when dir_temp missing', () => {
	process.env['dir_data'] = '/data';
	delete process.env['dir_temp'];
	expect(() => loadConfig()).toThrow('Required environment variable "dir_temp" is not set');
});

test('requireRsyncConfig - returns rsync config when all set', () => {
	process.env['rsync_host'] = 'host.example.com';
	process.env['rsync_port'] = '22';
	process.env['rsync_id'] = '/path/to/key';

	const config = requireRsyncConfig();
	expect(config.host).toBe('host.example.com');
	expect(config.port).toBe('22');
	expect(config.id).toBe('/path/to/key');
});

test('requireRsyncConfig - throws when host missing', () => {
	delete process.env['rsync_host'];
	process.env['rsync_port'] = '22';
	process.env['rsync_id'] = '/path/to/key';

	expect(() => requireRsyncConfig()).toThrow(
		'Required environment variable "rsync_host" is not set',
	);
});

test('requireRsyncConfig - throws when port missing', () => {
	process.env['rsync_host'] = 'host.example.com';
	delete process.env['rsync_port'];
	process.env['rsync_id'] = '/path/to/key';

	expect(() => requireRsyncConfig()).toThrow(
		'Required environment variable "rsync_port" is not set',
	);
});
