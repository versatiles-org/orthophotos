import { expect, test, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { expectMinFiles, expectFile, expectMinFileSize } from './validators.ts';

const testDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../test-data/validators');

beforeAll(() => {
	mkdirSync(resolve(testDir, 'tiles'), { recursive: true });
	writeFileSync(resolve(testDir, 'tiles', 'a.jp2'), 'tile-data-a');
	writeFileSync(resolve(testDir, 'tiles', 'b.jp2'), 'tile-data-b');
	writeFileSync(resolve(testDir, 'tiles', 'c.tif'), 'tile-data-c');
	writeFileSync(resolve(testDir, 'empty.txt'), '');
	writeFileSync(resolve(testDir, 'nonempty.txt'), 'content');
});

afterAll(() => {
	rmSync(testDir, { recursive: true, force: true });
});

test('expectMinFiles - passes when enough files match', async () => {
	await expectMinFiles(resolve(testDir, 'tiles'), '*.jp2', 2);
});

test('expectMinFiles - passes when exactly min files match', async () => {
	await expectMinFiles(resolve(testDir, 'tiles'), '*.jp2', 2);
});

test('expectMinFiles - fails when too few files match', async () => {
	await expect(expectMinFiles(resolve(testDir, 'tiles'), '*.jp2', 5)).rejects.toThrow(
		'Expected at least 5 files matching "*.jp2"',
	);
});

test('expectMinFiles - fails when no files match pattern', async () => {
	await expect(expectMinFiles(resolve(testDir, 'tiles'), '*.png', 1)).rejects.toThrow(
		'Expected at least 1 files matching "*.png"',
	);
});

test('expectFile - passes for existing non-empty file', async () => {
	await expectFile(resolve(testDir, 'nonempty.txt'));
});

test('expectFile - fails for non-existent file', async () => {
	await expect(expectFile(resolve(testDir, 'missing.txt'))).rejects.toThrow('does not exist');
});

test('expectFile - fails for empty file', async () => {
	await expect(expectFile(resolve(testDir, 'empty.txt'))).rejects.toThrow('is empty');
});

test('expectMinFileSize - passes when files are large enough', async () => {
	await expectMinFileSize(resolve(testDir, 'tiles'), '*.jp2', 5);
});

test('expectMinFileSize - fails when file is too small', async () => {
	await expect(expectMinFileSize(resolve(testDir, 'tiles'), '*.jp2', 99999)).rejects.toThrow('expected at least 99999');
});

test('expectMinFileSize - fails when no files match', async () => {
	await expect(expectMinFileSize(resolve(testDir, 'tiles'), '*.png', 1)).rejects.toThrow('No files matching');
});
