import { expect, onTestFinished, test, vi } from 'vitest';
import { mkdirSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { QUALITY } from './constants.ts';
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

// The white-border step runs GDAL; its own tests are in white-mask.test.ts.
vi.mock('./white-mask.ts', async (importOriginal) => {
	const original = await importOriginal<typeof import('./white-mask.ts')>();
	return {
		...original,
		measureWhiteBorder: vi.fn().mockResolvedValue(0),
		maskWhiteBackgroundFile: vi.fn().mockResolvedValue(undefined),
	};
});

import { maskWhiteBackgroundFile, measureWhiteBorder } from './white-mask.ts';
const mockMeasure = vi.mocked(measureWhiteBorder);
const mockMask = vi.mocked(maskWhiteBackgroundFile);

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

	await runMosaicTile('/input.tif', output, { maxZoom: 18 });

	expect(mockRunCommand).toHaveBeenCalledWith('versatiles', expect.arrayContaining(['mosaic', 'tile', '/input.tif']), {
		quiet: true,
	});
	const args: string[] = mockRunCommand.mock.calls[0][1];
	// The region's zoom is always passed, so versatiles never picks one from the source resolution.
	expect(args[args.indexOf('--max-zoom') + 1]).toBe('18');
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
		maxZoom: 17,
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

	await expect(runMosaicTile('/input.tif', output, { maxZoom: 17 })).rejects.toThrow('runMosaicTile failed');
	expect(existsSync(join(testDir, '.tmp.out.versatiles'))).toBe(false);
});

/** An output path in a fresh directory, and a `runCommand` mock that plays a successful tiling. */
function tileSetup(name: string): string {
	const testDir = join(tmpdir(), `mosaic-${name}-${Date.now()}`);
	mkdirSync(testDir, { recursive: true });
	onTestFinished(() => rmSync(testDir, { recursive: true, force: true }));
	const output = join(testDir, 'out.versatiles');
	mockRunCommand.mockImplementation(async () => {
		writeFileSync(join(testDir, '.tmp.out.versatiles'), 'fake');
		return mockResult('info: finished mosaic tile');
	});
	return output;
}

test('runMosaicTile - refuses an input with a white border by default', async () => {
	const output = tileSetup('white');
	mockMeasure.mockResolvedValueOnce(0.3);
	await expect(runMosaicTile('/input.tif', output, { maxZoom: 17 })).rejects.toThrow(
		/30\.0% of "\/input\.tif" is opaque white along its edge/,
	);
	expect(mockRunCommand).not.toHaveBeenCalledWith('versatiles', expect.anything(), expect.anything());
});

test('runMosaicTile - accepts a little white and passes nodata to the check', async () => {
	const output = tileSetup('little-white');
	mockMeasure.mockResolvedValueOnce(0.005);
	await runMosaicTile('/input.tif', output, { maxZoom: 17, nodata: '255,255,255' });
	expect(mockMeasure).toHaveBeenLastCalledWith('/input.tif', expect.any(String), { nodata: '255,255,255' });
	expect(existsSync(output)).toBe(true);
});

test('runMosaicTile - tiles the masked copy with whiteBorder: mask', async () => {
	const output = tileSetup('mask');
	mockMeasure.mockClear();
	await runMosaicTile('/input.tif', output, { maxZoom: 17, whiteBorder: 'mask' });
	const masked = mockMask.mock.lastCall![1];
	expect(mockMask).toHaveBeenLastCalledWith('/input.tif', masked, expect.objectContaining({ edgeOnly: true }));
	expect(mockRunCommand).toHaveBeenCalledWith('versatiles', expect.arrayContaining([masked]), { quiet: true });
	expect(mockMeasure).not.toHaveBeenCalled();
});

test('runMosaicTile - skips the check with whiteBorder: ignore', async () => {
	const output = tileSetup('ignore');
	mockMeasure.mockClear();
	await runMosaicTile('/input.tif', output, { maxZoom: 17, whiteBorder: 'ignore' });
	expect(mockMeasure).not.toHaveBeenCalled();
	expect(existsSync(output)).toBe(true);
});

test('runMosaicAssemble - calls versatiles with correct args', async () => {
	mockRunCommand.mockResolvedValue(mockResult('info: finished mosaic assemble'));

	await runMosaicAssemble('/filelist.txt', '/output.versatiles', { quiet: true, quietOnError: true });

	expect(mockRunCommand).toHaveBeenCalledWith(
		'versatiles',
		['mosaic', 'assemble', '--max-buffer-size', '50%', '--quality', QUALITY, '@/filelist.txt', '/output.versatiles'],
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
			QUALITY,
			'--lossless',
			'@/filelist.txt',
			'/output.versatiles',
		],
		{ quiet: true, quietOnError: true },
	);
});
