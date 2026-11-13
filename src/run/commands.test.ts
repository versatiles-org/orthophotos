import { expect, onTestFinished, test, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkRequiredCommands, remoteFileSize, runScpUpload, runSshCommand } from './commands.ts';
import { getConfig } from '../lib/index.ts';

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

/**
 * Builds a mock `runCommand` driver for tests of `checkRequiredCommands`. Every
 * `which` invocation succeeds; every `versatiles mosaic --help` invocation
 * returns the provided help text on stdout.
 */
function mockMosaicHelp(helpText: string): void {
	mockRunCommand.mockImplementation(async (cmd: string, args: string[]) => {
		if (cmd === 'versatiles' && args[0] === 'mosaic' && args[1] === '--help') {
			return { success: true, code: 0, stdout: new TextEncoder().encode(helpText), stderr: new Uint8Array() };
		}
		return { success: true, code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };
	});
}

const MOSAIC_HELP_OK = `Tile and assemble image mosaics.

Usage: versatiles mosaic [OPTIONS] <COMMAND>

Commands:
  tile      Tile a georeferenced raster into a .versatiles container
  assemble  Combine many tile containers into a single mosaic

Options:
  -h, --help  Print help
`;

test('checkRequiredCommands - succeeds when all commands and mosaic subcommands exist', async () => {
	mockMosaicHelp(MOSAIC_HELP_OK);
	await checkRequiredCommands();
	expect(mockRunCommand).toHaveBeenCalledWith('which', expect.any(Array), expect.any(Object));
	expect(mockRunCommand).toHaveBeenCalledWith('versatiles', ['mosaic', '--help'], expect.any(Object));
});

test('checkRequiredCommands - throws listing missing commands', async () => {
	mockRunCommand.mockRejectedValue(new Error('not found'));
	await expect(checkRequiredCommands()).rejects.toThrow('Missing required commands');
});

test('checkRequiredCommands - throws when `versatiles mosaic tile` is missing', async () => {
	mockMosaicHelp(`Tile and assemble image mosaics.

Usage: versatiles mosaic [OPTIONS] <COMMAND>

Commands:
  assemble  Combine many tile containers into a single mosaic
`);
	await expect(checkRequiredCommands()).rejects.toThrow(/missing required subcommand.*tile/);
});

test('checkRequiredCommands - throws when `versatiles mosaic assemble` is missing', async () => {
	mockMosaicHelp(`Tile and assemble image mosaics.

Usage: versatiles mosaic [OPTIONS] <COMMAND>

Commands:
  tile  Tile a georeferenced raster into a .versatiles container
`);
	await expect(checkRequiredCommands()).rejects.toThrow(/missing required subcommand.*assemble/);
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

/** A local file of `bytes` zero bytes, removed when the test finishes. */
function localFile(bytes: number): string {
	const dir = mkdtempSync(join(tmpdir(), 'scp-upload-'));
	onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
	const path = join(dir, 'file');
	writeFileSync(path, Buffer.alloc(bytes));
	return path;
}

test('runScpUpload - calls scp with correct args', async () => {
	mockRunCommand.mockResolvedValue({ success: true, code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() });
	const config = getConfig();
	config.ssh = { host: 'myhost', port: '2222', keyFile: '/key', dir: '/data' };
	const path = localFile(10);

	await runScpUpload(path, '/remote/file');

	expect(mockRunCommand).toHaveBeenCalledWith('scp', ['-P', '2222', '-i', '/key', path, 'myhost:/remote/file']);
});

test('runScpUpload - follows the size of the remote file while scp runs', async () => {
	vi.useFakeTimers();
	const log = vi.spyOn(console, 'log').mockImplementation(() => {});
	try {
		const config = getConfig();
		config.ssh = { host: 'myhost', dir: '/data' };
		let finishScp = () => {};
		mockRunCommand.mockImplementation(async (cmd: string) => {
			if (cmd === 'scp') {
				await new Promise<void>((resolve) => (finishScp = resolve));
			} else {
				const line = '-rw-r--r-- 1 user user 3145728 Nov 13 12:00 /remote/file\n';
				return { success: true, code: 0, stdout: new TextEncoder().encode(line), stderr: new Uint8Array() };
			}
			return { success: true, code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() };
		});

		const upload = runScpUpload(localFile(4 * 1024 * 1024), '/remote/file');
		await vi.advanceTimersByTimeAsync(5000);
		expect(mockRunCommand).toHaveBeenCalledWith('ssh', ['-o', 'ConnectTimeout=10', 'myhost', "ls -l '/remote/file'"], {
			stdout: 'piped',
			stderr: 'piped',
			quietOnError: true,
		});

		finishScp();
		await upload;
		expect(log).toHaveBeenCalledWith('  Done: 4 MiB uploaded');
	} finally {
		log.mockRestore();
		vi.useRealTimers();
	}
});

test('remoteFileSize - reads the size from ls -l', async () => {
	getConfig().ssh = { host: 'myhost', dir: '/data' };
	const line = '-rw-r--r-- 1 u1 u1 398731465 Aug 20  2025 /home/file.versatiles\n';
	mockRunCommand.mockResolvedValue({
		success: true,
		code: 0,
		stdout: new TextEncoder().encode(line),
		stderr: new Uint8Array(),
	});
	expect(await remoteFileSize('/home/file.versatiles')).toBe(398731465);
});

test('remoteFileSize - is undefined when the file is not there yet', async () => {
	getConfig().ssh = { host: 'myhost', dir: '/data' };
	mockRunCommand.mockRejectedValue(new Error('Command failed: ssh\nExit code: 2'));
	expect(await remoteFileSize('/home/missing')).toBeUndefined();
});
