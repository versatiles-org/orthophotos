import { expect, test, vi } from 'vitest';
import { checkRequiredCommands, runScpUpload, runSshCommand } from './commands.ts';
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
