import { expect, test, vi } from 'vitest';
import { checkRequiredCommands, runScpUpload, runSshCommand } from './commands.ts';
import { getConfig } from '../config.ts';

// Mock runCommand from lib/command.ts
vi.mock('../lib/command.ts', async (importOriginal) => {
	const original = await importOriginal<typeof import('../lib/command.ts')>();
	return {
		...original,
		runCommand: vi
			.fn()
			.mockResolvedValue({ success: true, code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
	};
});

import { runCommand } from '../lib/command.ts';
const mockRunCommand = vi.mocked(runCommand);

test('checkRequiredCommands - succeeds when all commands exist', async () => {
	mockRunCommand.mockResolvedValue({ success: true, code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() });
	await checkRequiredCommands();
	expect(mockRunCommand).toHaveBeenCalledWith('which', expect.any(Array), expect.any(Object));
});

test('checkRequiredCommands - throws listing missing commands', async () => {
	mockRunCommand.mockRejectedValue(new Error('not found'));
	await expect(checkRequiredCommands()).rejects.toThrow('Missing required commands');
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

test('runSshCommand - calls ssh with correct args', async () => {
	mockRunCommand.mockResolvedValue({ success: true, code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() });
	const config = getConfig();
	config.ssh = { host: 'myhost', port: '2222', keyFile: '/key', dir: '/data' };

	await runSshCommand('ls -la');

	expect(mockRunCommand).toHaveBeenCalledWith('ssh', ['-p', '2222', '-i', '/key', 'myhost', 'ls -la']);
});

test('runSshCommand - omits port and keyFile when not set', async () => {
	mockRunCommand.mockResolvedValue({ success: true, code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() });
	const config = getConfig();
	config.ssh = { host: 'myhost', dir: '/data' };

	await runSshCommand('pwd');

	expect(mockRunCommand).toHaveBeenCalledWith('ssh', ['myhost', 'pwd']);
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

test('runScpUpload - calls scp with correct args', async () => {
	mockRunCommand.mockResolvedValue({ success: true, code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() });
	const config = getConfig();
	config.ssh = { host: 'myhost', port: '2222', keyFile: '/key', dir: '/data' };

	await runScpUpload('/local/file', '/remote/file');

	expect(mockRunCommand).toHaveBeenCalledWith('scp', [
		'-P',
		'2222',
		'-i',
		'/key',
		'/local/file',
		'myhost:/remote/file',
	]);
});
