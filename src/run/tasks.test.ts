import { assertEquals, assertRejects } from '@std/assert';
import { runTask, type TaskContext } from './tasks.ts';
import { resolve } from '@std/path';
import { safeRemoveDir } from '../lib/fs.ts';

const TEST_DATA_DIR = resolve(import.meta.dirname!, '../../test-data/tasks');
const TEST_TEMP_DIR = resolve(import.meta.dirname!, '../../test-data/tasks-temp');

function createTestContext(name: string): TaskContext {
	return {
		name,
		projDir: TEST_DATA_DIR,
		dataDir: resolve(TEST_TEMP_DIR, 'data', name),
		tempDir: resolve(TEST_TEMP_DIR, 'temp', name),
	};
}

async function cleanupTestTemp(): Promise<void> {
	await safeRemoveDir(TEST_TEMP_DIR);
}

Deno.test('runTask - throws on unknown task number', async () => {
	const ctx = createTestContext('test-region');
	await assertRejects(
		() => runTask(99, ctx),
		Error,
		'Unknown task: 99',
	);
	await cleanupTestTemp();
});

Deno.test('runTask - throws on negative task number', async () => {
	const ctx = createTestContext('test-region');
	await assertRejects(
		() => runTask(-1, ctx),
		Error,
		'Unknown task: -1',
	);
	await cleanupTestTemp();
});

Deno.test('runTask - task 6 (delete) removes directories', async () => {
	const ctx = createTestContext('delete-test');

	// Create test directories
	await Deno.mkdir(ctx.dataDir, { recursive: true });
	await Deno.mkdir(ctx.tempDir, { recursive: true });
	await Deno.writeTextFile(resolve(ctx.dataDir, 'test.txt'), 'content');
	await Deno.writeTextFile(resolve(ctx.tempDir, 'temp.txt'), 'temp');

	// Run delete task
	await runTask(6, ctx);

	// Verify directories are removed
	let dataExists = true;
	let tempExists = true;
	try {
		await Deno.stat(ctx.dataDir);
	} catch {
		dataExists = false;
	}
	try {
		await Deno.stat(ctx.tempDir);
	} catch {
		tempExists = false;
	}

	assertEquals(dataExists, false, 'Data directory should be deleted');
	assertEquals(tempExists, false, 'Temp directory should be deleted');

	await cleanupTestTemp();
});

Deno.test('runTask - task 6 (delete) handles non-existent directories', async () => {
	const ctx = createTestContext('nonexistent');

	// Ensure directories don't exist
	await safeRemoveDir(ctx.dataDir);
	await safeRemoveDir(ctx.tempDir);

	// Should not throw
	await runTask(6, ctx);

	await cleanupTestTemp();
});

// Note: Tasks 0-5 require external tools, rsync configuration, or actual region scripts.
// They would need more extensive mocking or integration test setup to test fully.
// The following tests verify task routing by checking that tasks fail appropriately
// when required resources are missing.

Deno.test({
	name: 'runTask - task 0 (download) requires rsync config',
	fn: async () => {
		const ctx = createTestContext('download-test');

		// Save current env
		const savedHost = Deno.env.get('rsync_host');
		const savedPort = Deno.env.get('rsync_port');
		const savedId = Deno.env.get('rsync_id');

		// Clear rsync env vars
		Deno.env.delete('rsync_host');
		Deno.env.delete('rsync_port');
		Deno.env.delete('rsync_id');

		try {
			await assertRejects(
				() => runTask(0, ctx),
				Error,
				'rsync_host',
			);
		} finally {
			// Restore env
			if (savedHost) Deno.env.set('rsync_host', savedHost);
			if (savedPort) Deno.env.set('rsync_port', savedPort);
			if (savedId) Deno.env.set('rsync_id', savedId);
			await cleanupTestTemp();
		}
	},
	sanitizeOps: false,
	sanitizeResources: false,
});

Deno.test({
	name: 'runTask - task 5 (upload) requires rsync config',
	fn: async () => {
		const ctx = createTestContext('upload-test');

		// Save current env
		const savedHost = Deno.env.get('rsync_host');
		const savedPort = Deno.env.get('rsync_port');
		const savedId = Deno.env.get('rsync_id');

		// Clear rsync env vars
		Deno.env.delete('rsync_host');
		Deno.env.delete('rsync_port');
		Deno.env.delete('rsync_id');

		try {
			await assertRejects(
				() => runTask(5, ctx),
				Error,
				'rsync_host',
			);
		} finally {
			// Restore env
			if (savedHost) Deno.env.set('rsync_host', savedHost);
			if (savedPort) Deno.env.set('rsync_port', savedPort);
			if (savedId) Deno.env.set('rsync_id', savedId);
			await cleanupTestTemp();
		}
	},
	sanitizeOps: false,
	sanitizeResources: false,
});
