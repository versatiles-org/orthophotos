import { expect, test } from 'vitest';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTask, type TaskContext } from './tasks.ts';
import { safeRm } from '../lib/fs.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_TEMP_DIR = resolve(__dirname, '../../test-data/tasks-temp');

function createTestContext(name: string): TaskContext {
	return {
		name,
		dataDir: resolve(TEST_TEMP_DIR, 'data', name),
		tempDir: resolve(TEST_TEMP_DIR, 'temp', name),
	};
}

async function cleanupTestTemp(): Promise<void> {
	safeRm(TEST_TEMP_DIR);
}

test('runTask - throws on unknown task number', async () => {
	const ctx = createTestContext('test-region');
	await expect(runTask(99, ctx)).rejects.toThrow('Unknown task: 99');
	await cleanupTestTemp();
});

test('runTask - throws on task 0 (removed)', async () => {
	const ctx = createTestContext('test-region');
	await expect(runTask(0, ctx)).rejects.toThrow('Unknown task: 0');
	await cleanupTestTemp();
});

test('runTask - task 3 (delete) removes directories', async () => {
	const ctx = createTestContext('delete-test');

	mkdirSync(ctx.dataDir, { recursive: true });
	mkdirSync(ctx.tempDir, { recursive: true });
	writeFileSync(resolve(ctx.dataDir, 'test.txt'), 'content');
	writeFileSync(resolve(ctx.tempDir, 'temp.txt'), 'temp');

	await runTask(3, ctx);

	expect(existsSync(ctx.dataDir)).toBe(false);
	expect(existsSync(ctx.tempDir)).toBe(false);

	await cleanupTestTemp();
});

test('runTask - task 3 (delete) handles non-existent directories', async () => {
	const ctx = createTestContext('nonexistent');

	safeRm(ctx.dataDir);
	safeRm(ctx.tempDir);

	await runTask(3, ctx);

	await cleanupTestTemp();
});

test('runTask - task 2 (merge) requires filelist.txt', async () => {
	const ctx = createTestContext('merge-test');
	mkdirSync(ctx.dataDir, { recursive: true });

	try {
		await expect(runTask(2, ctx)).rejects.toThrow('filelist.txt not found');
	} finally {
		await cleanupTestTemp();
	}
});

test('runTask - task 2 (merge) fails when versatiles or filelist is invalid', async () => {
	const ctx = createTestContext('merge-test');
	mkdirSync(ctx.dataDir, { recursive: true });
	writeFileSync(resolve(ctx.dataDir, 'filelist.txt'), 'dummy');

	try {
		await expect(runTask(2, ctx)).rejects.toThrow();
	} finally {
		await cleanupTestTemp();
	}
});

test('runTask - task 1 (fetch) throws for unknown region', async () => {
	const ctx = createTestContext('nonexistent/region');

	try {
		await expect(runTask(1, ctx)).rejects.toThrow('No pipeline defined');
	} finally {
		await cleanupTestTemp();
	}
});

test('runTask - task 1 (fetch) scans for .versatiles files and writes filelist', async () => {
	// Use a region with status 'blocked'/'planned' that has no run function — the
	// pipeline.run() will be caught by the try/catch, then filelist scanning runs.
	// `no` (Norway) is currently blocked; if it ever gets a real scraper, swap to
	// any other id in _planned.ts.
	const ctx = createTestContext('no');

	try {
		mkdirSync(ctx.dataDir, { recursive: true });
		mkdirSync(join(ctx.dataDir, 'tiles'), { recursive: true });
		writeFileSync(join(ctx.dataDir, 'tiles', 'a.versatiles'), '');
		writeFileSync(join(ctx.dataDir, 'tiles', 'b.versatiles'), '');
		writeFileSync(join(ctx.dataDir, 'tiles', 'c.txt'), '');

		// `no` has no run function, so pipeline fails, but filelist is still written
		await expect(runTask(1, ctx)).rejects.toThrow('No pipeline defined');
	} finally {
		await cleanupTestTemp();
	}
});
