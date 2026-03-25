import { describe, expect, test } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, statSync, readFileSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { safeRemoveDir, walkSync, extractZipFile } from './fs.ts';

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

describe('walkSync', () => {
	const walkDir = resolve(TEST_DIR, 'walk-test');

	function setupWalkDir(): void {
		rmSync(walkDir, { recursive: true, force: true });
		mkdirSync(resolve(walkDir, 'subdir'), { recursive: true });
		writeFileSync(resolve(walkDir, 'file1.txt'), 'hello');
		writeFileSync(resolve(walkDir, 'file2.json'), '{}');
		writeFileSync(resolve(walkDir, 'file3.txt'), 'world');
		writeFileSync(resolve(walkDir, 'subdir', 'nested.txt'), 'nested');
		writeFileSync(resolve(walkDir, 'subdir', 'data.csv'), 'a,b');
	}

	test('yields all files without options', () => {
		setupWalkDir();
		try {
			const entries = [...walkSync(walkDir)];
			const names = entries.map((e) => e.name).sort();
			expect(names).toEqual(['data.csv', 'file1.txt', 'file2.json', 'file3.txt', 'nested.txt']);
			expect(entries.every((e) => e.isFile)).toBe(true);
			expect(entries.every((e) => !e.isDirectory)).toBe(true);
		} finally {
			rmSync(walkDir, { recursive: true, force: true });
		}
	});

	test('filters by extension', () => {
		setupWalkDir();
		try {
			const entries = [...walkSync(walkDir, { exts: ['.txt'] })];
			const names = entries.map((e) => e.name).sort();
			expect(names).toEqual(['file1.txt', 'file3.txt', 'nested.txt']);
		} finally {
			rmSync(walkDir, { recursive: true, force: true });
		}
	});

	test('filters by multiple extensions', () => {
		setupWalkDir();
		try {
			const entries = [...walkSync(walkDir, { exts: ['.txt', '.csv'] })];
			const names = entries.map((e) => e.name).sort();
			expect(names).toEqual(['data.csv', 'file1.txt', 'file3.txt', 'nested.txt']);
		} finally {
			rmSync(walkDir, { recursive: true, force: true });
		}
	});

	test('includes directories when includeDirs is true', () => {
		setupWalkDir();
		try {
			const entries = [...walkSync(walkDir, { includeDirs: true })];
			const dirs = entries.filter((e) => e.isDirectory);
			expect(dirs).toHaveLength(1);
			expect(dirs[0].name).toBe('subdir');
			expect(dirs[0].isDirectory).toBe(true);
			expect(dirs[0].isFile).toBe(false);
		} finally {
			rmSync(walkDir, { recursive: true, force: true });
		}
	});

	test('returns full paths', () => {
		setupWalkDir();
		try {
			const entries = [...walkSync(walkDir, { exts: ['.json'] })];
			expect(entries).toHaveLength(1);
			expect(entries[0].path).toBe(resolve(walkDir, 'file2.json'));
		} finally {
			rmSync(walkDir, { recursive: true, force: true });
		}
	});

	test('handles non-existent directory gracefully', () => {
		const entries = [...walkSync('/nonexistent/dir/that/does/not/exist')];
		expect(entries).toEqual([]);
	});

	test('handles empty directory', () => {
		const emptyDir = resolve(TEST_DIR, 'empty-walk');
		mkdirSync(emptyDir, { recursive: true });
		try {
			const entries = [...walkSync(emptyDir)];
			expect(entries).toEqual([]);
		} finally {
			rmSync(emptyDir, { recursive: true, force: true });
		}
	});
});

describe('extractZipFile', () => {
	const zipTestDir = resolve(TEST_DIR, 'zip-test');

	test('extracts a zip file to target directory', async () => {
		rmSync(zipTestDir, { recursive: true, force: true });
		mkdirSync(zipTestDir, { recursive: true });

		const srcDir = resolve(zipTestDir, 'src');
		mkdirSync(srcDir, { recursive: true });
		writeFileSync(resolve(srcDir, 'hello.txt'), 'hello world');
		writeFileSync(resolve(srcDir, 'data.json'), '{"key":"value"}');

		const zipPath = resolve(zipTestDir, 'test.zip');
		execSync(`cd "${srcDir}" && zip -q "${zipPath}" hello.txt data.json`);

		const targetDir = resolve(zipTestDir, 'output');

		try {
			await extractZipFile(zipPath, targetDir);

			expect(existsSync(targetDir)).toBe(true);
			expect(readFileSync(resolve(targetDir, 'hello.txt'), 'utf-8')).toBe('hello world');
			expect(readFileSync(resolve(targetDir, 'data.json'), 'utf-8')).toBe('{"key":"value"}');
			// Temp dir should not remain
			expect(existsSync(`${targetDir}.tmp`)).toBe(false);
		} finally {
			rmSync(zipTestDir, { recursive: true, force: true });
		}
	});

	test('overwrites existing target directory', async () => {
		rmSync(zipTestDir, { recursive: true, force: true });
		mkdirSync(zipTestDir, { recursive: true });

		const srcDir = resolve(zipTestDir, 'src');
		mkdirSync(srcDir, { recursive: true });
		writeFileSync(resolve(srcDir, 'new.txt'), 'new content');

		const zipPath = resolve(zipTestDir, 'test.zip');
		execSync(`cd "${srcDir}" && zip -q "${zipPath}" new.txt`);

		const targetDir = resolve(zipTestDir, 'output');
		mkdirSync(targetDir, { recursive: true });
		writeFileSync(resolve(targetDir, 'old.txt'), 'old content');

		try {
			await extractZipFile(zipPath, targetDir);

			expect(existsSync(resolve(targetDir, 'new.txt'))).toBe(true);
			expect(existsSync(resolve(targetDir, 'old.txt'))).toBe(false);
		} finally {
			rmSync(zipTestDir, { recursive: true, force: true });
		}
	});
});
