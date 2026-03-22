import { expect, test } from 'vitest';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTask, type TaskContext } from './tasks.ts';
import { safeRemoveDir } from '../lib/fs.ts';

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
	await safeRemoveDir(TEST_TEMP_DIR);
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

	// Create test directories
	mkdirSync(ctx.dataDir, { recursive: true });
	mkdirSync(ctx.tempDir, { recursive: true });
	writeFileSync(resolve(ctx.dataDir, 'test.txt'), 'content');
	writeFileSync(resolve(ctx.tempDir, 'temp.txt'), 'temp');

	// Run delete task
	await runTask(3, ctx);

	// Verify directories are removed
	expect(existsSync(ctx.dataDir)).toBe(false);
	expect(existsSync(ctx.tempDir)).toBe(false);

	await cleanupTestTemp();
});

test('runTask - task 3 (delete) handles non-existent directories', async () => {
	const ctx = createTestContext('nonexistent');

	// Ensure directories don't exist
	await safeRemoveDir(ctx.dataDir);
	await safeRemoveDir(ctx.tempDir);

	// Should not throw
	await runTask(3, ctx);

	await cleanupTestTemp();
});

// Note: Tasks 1-2 require external tools, rsync configuration, or actual region scripts.
// They would need more extensive mocking or integration test setup to test fully.

test('runTask - task 2 (merge) requires filelist.txt', async () => {
	const ctx = createTestContext('merge-test');
	mkdirSync(ctx.dataDir, { recursive: true });

	try {
		await expect(runTask(2, ctx)).rejects.toThrow('filelist.txt not found');
	} finally {
		await cleanupTestTemp();
	}
});

test('runTask - task 2 (merge) requires rsync config', async () => {
	const ctx = createTestContext('merge-test');
	mkdirSync(ctx.dataDir, { recursive: true });
	writeFileSync(resolve(ctx.dataDir, 'filelist.txt'), 'dummy');

	// Save current env
	const savedHost = process.env['rsync_host'];
	const savedPort = process.env['rsync_port'];
	const savedId = process.env['rsync_id'];

	// Clear rsync env vars
	delete process.env['rsync_host'];
	delete process.env['rsync_port'];
	delete process.env['rsync_id'];

	try {
		await expect(runTask(2, ctx)).rejects.toThrow('rsync_host');
	} finally {
		// Restore env
		if (savedHost) process.env['rsync_host'] = savedHost;
		if (savedPort) process.env['rsync_port'] = savedPort;
		if (savedId) process.env['rsync_id'] = savedId;
		await cleanupTestTemp();
	}
});
