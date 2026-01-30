import { assertEquals, assertThrows } from '@std/assert';
import { getDataDir, loadConfig, requireRsyncConfig } from './config.ts';

Deno.test('getDataDir - returns env value when set', () => {
	Deno.env.set('dir_data', '/test/path');
	assertEquals(getDataDir(), '/test/path');
});

Deno.test('getDataDir - throws when not set', () => {
	Deno.env.delete('dir_data');
	assertThrows(
		() => getDataDir(),
		Error,
		'Required environment variable "dir_data" is not set',
	);
});

Deno.test('loadConfig - returns config with all values', () => {
	Deno.env.set('dir_data', '/data');
	Deno.env.set('rsync_host', 'host.example.com');
	Deno.env.set('rsync_port', '22');
	Deno.env.set('rsync_id', '/path/to/key');

	const config = loadConfig();
	assertEquals(config.dirData, '/data');
	assertEquals(config.rsyncHost, 'host.example.com');
	assertEquals(config.rsyncPort, '22');
	assertEquals(config.rsyncId, '/path/to/key');
});

Deno.test('loadConfig - throws when dir_data missing', () => {
	Deno.env.delete('dir_data');
	assertThrows(
		() => loadConfig(),
		Error,
		'Required environment variable "dir_data" is not set',
	);
});

Deno.test('requireRsyncConfig - returns rsync config when all set', () => {
	Deno.env.set('rsync_host', 'host.example.com');
	Deno.env.set('rsync_port', '22');
	Deno.env.set('rsync_id', '/path/to/key');

	const config = requireRsyncConfig();
	assertEquals(config.host, 'host.example.com');
	assertEquals(config.port, '22');
	assertEquals(config.id, '/path/to/key');
});

Deno.test('requireRsyncConfig - throws when host missing', () => {
	Deno.env.delete('rsync_host');
	Deno.env.set('rsync_port', '22');
	Deno.env.set('rsync_id', '/path/to/key');

	assertThrows(
		() => requireRsyncConfig(),
		Error,
		'Required environment variable "rsync_host" is not set',
	);
});

Deno.test('requireRsyncConfig - throws when port missing', () => {
	Deno.env.set('rsync_host', 'host.example.com');
	Deno.env.delete('rsync_port');
	Deno.env.set('rsync_id', '/path/to/key');

	assertThrows(
		() => requireRsyncConfig(),
		Error,
		'Required environment variable "rsync_port" is not set',
	);
});
