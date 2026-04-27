import { expect, test, vi } from 'vitest';
import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runMosaicAssemble, runMosaicTile } from './versatiles.ts';

// Mock runCommand from lib/command.ts
vi.mock('./command.ts', async (importOriginal) => {
	const original = await importOriginal<typeof import('./command.ts')>();
	return {
		...original,
		runCommand: vi
			.fn()
			.mockResolvedValue({ success: true, code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() }),
	};
});

import { runCommand } from './command.ts';
const mockRunCommand = vi.mocked(runCommand);

function mockResult(stderr = '') {
	return {
		success: true,
		code: 0,
		stdout: new Uint8Array(),
		stderr: new TextEncoder().encode(stderr),
	};
}

test('runMosaicTile - calls versatiles with correct args', async () => {
	mockRunCommand.mockResolvedValue({ success: true, code: 0, stdout: new Uint8Array(), stderr: new Uint8Array() });
	const testDir = join(tmpdir(), `mosaic-tile-test-${Date.now()}`);
	mkdirSync(testDir, { recursive: true });

	// Create a fake tmp output that renameSync expects
	const output = join(testDir, 'out.versatiles');
	const tmpOutput = join(testDir, '.tmp.out.versatiles');
	mockRunCommand.mockImplementation(async () => {
		writeFileSync(tmpOutput, 'fake');
		return mockResult('info: finished mosaic tile');
	});

	await runMosaicTile('/input.tif', output);

	expect(mockRunCommand).toHaveBeenCalledWith('versatiles', expect.arrayContaining(['mosaic', 'tile', '/input.tif']), {
		quiet: true,
	});
	const call = mockRunCommand.mock.calls[0];
	expect(call[1]).not.toContain('--max-zoom');
	expect(existsSync(output)).toBe(true);
});

test('runMosaicTile - passes all options', async () => {
	const testDir = join(tmpdir(), `mosaic-opts-test-${Date.now()}`);
	mkdirSync(testDir, { recursive: true });
	const output = join(testDir, 'out.versatiles');
	const tmpOutput = join(testDir, '.tmp.out.versatiles');
	mockRunCommand.mockImplementation(async () => {
		writeFileSync(tmpOutput, 'fake');
		return mockResult('info: finished mosaic tile');
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

	await expect(runMosaicTile('/input.tif', output)).rejects.toThrow('runMosaicTile failed');
	expect(existsSync(join(testDir, '.tmp.out.versatiles'))).toBe(false);
});

test('runMosaicAssemble - calls versatiles with correct args', async () => {
	mockRunCommand.mockResolvedValue(mockResult('info: finished mosaic assemble'));

	await runMosaicAssemble('/filelist.txt', '/output.versatiles', { quiet: true, quietOnError: true });

	expect(mockRunCommand).toHaveBeenCalledWith(
		'versatiles',
		[
			'mosaic',
			'assemble',
			'--max-buffer-size',
			'50%',
			'--quality',
			'70,16:50,17:30',
			'@/filelist.txt',
			'/output.versatiles',
		],
		{ quiet: true, quietOnError: true },
	);
});

test('runMosaicAssemble - passes lossless option', async () => {
	mockRunCommand.mockResolvedValue(mockResult('info: finished mosaic assemble'));

	await runMosaicAssemble('/filelist.txt', '/output.versatiles', { lossless: true, quiet: true, quietOnError: true });

	expect(mockRunCommand).toHaveBeenCalledWith(
		'versatiles',
		[
			'mosaic',
			'assemble',
			'--max-buffer-size',
			'50%',
			'--quality',
			'70,16:50,17:30',
			'--lossless',
			'@/filelist.txt',
			'/output.versatiles',
		],
		{ quiet: true, quietOnError: true },
	);
});
