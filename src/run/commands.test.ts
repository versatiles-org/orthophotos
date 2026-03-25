import { expect, test, vi } from 'vitest';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	buildSftpUrl,
	checkRequiredCommands,
	runSshCommand,
	runScpUpload,
	runMosaicTile,
	runMosaicAssemble,
} from './commands.ts';
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

test('runMosaicTile - calls versatiles with correct args', async () => {
	mockRunCommand.mockResolvedValue({ success: true, code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() });
	const testDir = join(tmpdir(), `mosaic-tile-test-${Date.now()}`);
	mkdirSync(testDir, { recursive: true });

	// Create a fake tmp output that renameSync expects
	const output = join(testDir, 'out.versatiles');
	const tmpOutput = join(testDir, 'tmp.out.versatiles');
	mockRunCommand.mockImplementation(async () => {
		writeFileSync(tmpOutput, 'fake');
		return { success: true, code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };
	});

	await runMosaicTile('/input.tif', output);

	expect(mockRunCommand).toHaveBeenCalledWith(
		'versatiles',
		expect.arrayContaining(['mosaic', 'tile', '--max-zoom', '17', '/input.tif']),
		{ quiet: true },
	);
	expect(existsSync(output)).toBe(true);
});

test('runMosaicTile - passes all options', async () => {
	const testDir = join(tmpdir(), `mosaic-opts-test-${Date.now()}`);
	mkdirSync(testDir, { recursive: true });
	const output = join(testDir, 'out.versatiles');
	const tmpOutput = join(testDir, 'tmp.out.versatiles');
	mockRunCommand.mockImplementation(async () => {
		writeFileSync(tmpOutput, 'fake');
		return { success: true, code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };
	});

	await runMosaicTile('/input.tif', output, {
		bands: '1,2,3',
		nodata: '255,255,255',
		crs: '3045',
		cacheDirectory: '/tmp/cache',
	});

	expect(mockRunCommand).toHaveBeenCalledWith(
		'versatiles',
		expect.arrayContaining([
			'--bands',
			'1,2,3',
			'--nodata',
			'255,255,255',
			'--crs',
			'3045',
			'--cache-dir',
			'/tmp/cache',
		]),
		{ quiet: true },
	);
});

test('runMosaicTile - cleans up tmp file on error', async () => {
	const testDir = join(tmpdir(), `mosaic-err-test-${Date.now()}`);
	mkdirSync(testDir, { recursive: true });
	const output = join(testDir, 'out.versatiles');

	mockRunCommand.mockRejectedValue(new Error('versatiles failed'));

	await expect(runMosaicTile('/input.tif', output)).rejects.toThrow('versatiles failed');
	expect(existsSync(join(testDir, 'tmp.out.versatiles'))).toBe(false);
});

test('runMosaicAssemble - calls versatiles with correct args', async () => {
	mockRunCommand.mockResolvedValue({ success: true, code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() });

	await runMosaicAssemble('/filelist.txt', '/output.versatiles');

	expect(mockRunCommand).toHaveBeenCalledWith(
		'versatiles',
		expect.arrayContaining(['mosaic', 'assemble', '--prescan', '/filelist.txt', '/output.versatiles']),
		{ quiet: true },
	);
});

test('runMosaicAssemble - passes lossless option', async () => {
	mockRunCommand.mockResolvedValue({ success: true, code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() });

	await runMosaicAssemble('/filelist.txt', '/output.versatiles', { lossless: true });

	expect(mockRunCommand).toHaveBeenCalledWith('versatiles', expect.arrayContaining(['--lossless']), { quiet: true });
});
