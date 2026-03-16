import { expect, test } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeRemoveDir, safeRemoveFile } from './fs.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = resolve(__dirname, '../../test-data/fs-temp');

function setupTestDir(): void {
	mkdirSync(TEST_DIR, { recursive: true });
}

function cleanupTestDir(): void {
	try {
		rmSync(TEST_DIR, { recursive: true });
	} catch {
		// Ignore cleanup errors
	}
}

test('safeRemoveDir - removes existing directory', async () => {
	setupTestDir();
	const testPath = resolve(TEST_DIR, 'to-remove');
	mkdirSync(testPath);

	// Verify it exists
	expect(statSync(testPath).isDirectory()).toBe(true);

	// Remove it
	await safeRemoveDir(testPath);

	// Verify it's gone
	expect(existsSync(testPath)).toBe(false);
	cleanupTestDir();
});

test('safeRemoveDir - removes directory recursively', async () => {
	setupTestDir();
	const testPath = resolve(TEST_DIR, 'parent');
	const childPath = resolve(testPath, 'child');
	const filePath = resolve(childPath, 'file.txt');

	mkdirSync(childPath, { recursive: true });
	writeFileSync(filePath, 'content');

	// Remove recursively
	await safeRemoveDir(testPath);

	// Verify it's gone
	expect(existsSync(testPath)).toBe(false);
	cleanupTestDir();
});

test('safeRemoveDir - ignores non-existent path', async () => {
	// This should not throw
	await safeRemoveDir('/nonexistent/path/that/does/not/exist');
});

test('safeRemoveFile - removes existing file', async () => {
	setupTestDir();
	const testPath = resolve(TEST_DIR, 'file-to-remove.txt');
	writeFileSync(testPath, 'content');

	// Verify it exists
	expect(statSync(testPath).isFile()).toBe(true);

	// Remove it
	await safeRemoveFile(testPath);

	// Verify it's gone
	expect(existsSync(testPath)).toBe(false);
	cleanupTestDir();
});

test('safeRemoveFile - ignores non-existent file', async () => {
	// This should not throw
	await safeRemoveFile('/nonexistent/file.txt');
});

test('safeRemoveFile - throws when path is non-empty directory', async () => {
	setupTestDir();
	const testPath = resolve(TEST_DIR, 'is-a-directory');
	const childPath = resolve(testPath, 'child.txt');
	mkdirSync(testPath);
	writeFileSync(childPath, 'content');

	// safeRemoveFile uses rm without recursive flag
	// so it should throw when trying to remove a non-empty directory
	await expect(safeRemoveFile(testPath)).rejects.toThrow();
	cleanupTestDir();
});
