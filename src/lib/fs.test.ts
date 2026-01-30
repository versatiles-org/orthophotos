import { assertEquals, assertRejects } from '@std/assert';
import { safeRemoveDir, safeRemoveFile } from './fs.ts';
import { resolve } from '@std/path';

const TEST_DIR = resolve(import.meta.dirname!, '../../test-data/fs-temp');

async function setupTestDir(): Promise<void> {
	await Deno.mkdir(TEST_DIR, { recursive: true });
}

async function cleanupTestDir(): Promise<void> {
	try {
		await Deno.remove(TEST_DIR, { recursive: true });
	} catch {
		// Ignore cleanup errors
	}
}

Deno.test('safeRemoveDir - removes existing directory', async () => {
	await setupTestDir();
	const testPath = resolve(TEST_DIR, 'to-remove');
	await Deno.mkdir(testPath);

	// Verify it exists
	const beforeStat = await Deno.stat(testPath);
	assertEquals(beforeStat.isDirectory, true);

	// Remove it
	await safeRemoveDir(testPath);

	// Verify it's gone
	await assertRejects(
		() => Deno.stat(testPath),
		Deno.errors.NotFound,
	);
	await cleanupTestDir();
});

Deno.test('safeRemoveDir - removes directory recursively', async () => {
	await setupTestDir();
	const testPath = resolve(TEST_DIR, 'parent');
	const childPath = resolve(testPath, 'child');
	const filePath = resolve(childPath, 'file.txt');

	await Deno.mkdir(childPath, { recursive: true });
	await Deno.writeTextFile(filePath, 'content');

	// Remove recursively
	await safeRemoveDir(testPath);

	// Verify it's gone
	await assertRejects(
		() => Deno.stat(testPath),
		Deno.errors.NotFound,
	);
	await cleanupTestDir();
});

Deno.test('safeRemoveDir - ignores non-existent path', async () => {
	// This should not throw
	await safeRemoveDir('/nonexistent/path/that/does/not/exist');
});

Deno.test('safeRemoveFile - removes existing file', async () => {
	await setupTestDir();
	const testPath = resolve(TEST_DIR, 'file-to-remove.txt');
	await Deno.writeTextFile(testPath, 'content');

	// Verify it exists
	const beforeStat = await Deno.stat(testPath);
	assertEquals(beforeStat.isFile, true);

	// Remove it
	await safeRemoveFile(testPath);

	// Verify it's gone
	await assertRejects(
		() => Deno.stat(testPath),
		Deno.errors.NotFound,
	);
	await cleanupTestDir();
});

Deno.test('safeRemoveFile - ignores non-existent file', async () => {
	// This should not throw
	await safeRemoveFile('/nonexistent/file.txt');
});

Deno.test('safeRemoveFile - throws when path is non-empty directory', async () => {
	await setupTestDir();
	const testPath = resolve(TEST_DIR, 'is-a-directory');
	const childPath = resolve(testPath, 'child.txt');
	await Deno.mkdir(testPath);
	await Deno.writeTextFile(childPath, 'content');

	// safeRemoveFile uses Deno.remove without recursive flag
	// so it should throw when trying to remove a non-empty directory
	await assertRejects(
		() => safeRemoveFile(testPath),
		Error,
	);
	await cleanupTestDir();
});
