import { expect, test } from 'vitest';
import { getDataDir, getTempDir, loadConfig, requireSshConfig } from './config.ts';

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
	process.env['ssh_host'] = 'host.example.com';
	process.env['ssh_port'] = '22';
	process.env['ssh_id'] = '/path/to/key';
	process.env['ssh_dir'] = '/remote/data';

	const config = loadConfig();
	expect(config.dirData).toBe('/data');
	expect(config.dirTemp).toBe('/temp');
	expect(config.sshHost).toBe('host.example.com');
	expect(config.sshPort).toBe('22');
	expect(config.sshId).toBe('/path/to/key');
	expect(config.sshDir).toBe('/remote/data');
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

test('requireSshConfig - returns SSH config when all set', () => {
	process.env['ssh_host'] = 'host.example.com';
	process.env['ssh_port'] = '22';
	process.env['ssh_id'] = '/path/to/key';
	process.env['ssh_dir'] = '/remote/data';

	const config = requireSshConfig();
	expect(config.host).toBe('host.example.com');
	expect(config.port).toBe('22');
	expect(config.id).toBe('/path/to/key');
	expect(config.dir).toBe('/remote/data');
});

test('requireSshConfig - throws when host missing', () => {
	delete process.env['ssh_host'];
	process.env['ssh_port'] = '22';
	process.env['ssh_id'] = '/path/to/key';

	expect(() => requireSshConfig()).toThrow('Required environment variable "ssh_host" is not set');
});

test('requireSshConfig - throws when port missing', () => {
	process.env['ssh_host'] = 'host.example.com';
	delete process.env['ssh_port'];
	process.env['ssh_id'] = '/path/to/key';

	expect(() => requireSshConfig()).toThrow('Required environment variable "ssh_port" is not set');
});
