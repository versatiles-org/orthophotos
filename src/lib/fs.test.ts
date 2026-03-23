import { expect, test } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { safeRemoveDir } from './fs.ts';

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
