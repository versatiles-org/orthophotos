import { expect, test } from 'vitest';
import { buildSftpUrl, checkRequiredCommands, runSshCommand, runScpUpload } from './commands.ts';
import { getConfig } from '../config.ts';

test('checkRequiredCommands - succeeds or lists missing commands', async () => {
	try {
		await checkRequiredCommands();
	} catch (e) {
		if (e instanceof Error) {
			expect(e.message).toContain('Missing required commands');
			expect(e.message).toContain('  -');
		}
	}
});

test('buildSftpUrl - constructs correct URL', () => {
	expect(buildSftpUrl('host.example.com', '22', '/data/test.versatiles')).toBe(
		'sftp://host.example.com:22//data/test.versatiles',
	);
	expect(buildSftpUrl('host', '2222', 'relative/path')).toBe('sftp://host:2222/relative/path');
});

test('runSshCommand - throws when SSH config is missing', async () => {
	const config = getConfig();
	const saved = config.ssh;
	config.ssh = undefined;
	try {
		await expect(runSshCommand('echo test')).rejects.toThrow('SSH configuration is missing');
	} finally {
		config.ssh = saved;
	}
});

test('runScpUpload - throws when SSH config is missing', async () => {
	const config = getConfig();
	const saved = config.ssh;
	config.ssh = undefined;
	try {
		await expect(runScpUpload('/tmp/file', '/remote/file')).rejects.toThrow('SSH configuration is missing');
	} finally {
		config.ssh = saved;
	}
});
