#!/usr/bin/env -S deno run -A

/**
 * Main entry point for the orthophoto processing pipeline.
 * Migrated from run.sh to TypeScript/Deno.
 *
 * Usage:
 *   deno task run <name> <task>
 *
 * Example:
 *   deno task run de/bw 1        # run fetch
 *   deno task run de/bw 2-4      # run vrt, preview, convert
 *   deno task run de/bw all      # full pipeline
 */

import { resolve } from '@std/path';
import { ensureDir } from '@std/fs';
import { getDataDir, getTempDir } from './config.ts';
import { getHelpText, parseArgs } from './run/args.ts';
import { checkRequiredCommands } from './run/commands.ts';
import { runTask, type TaskContext } from './run/tasks.ts';

async function main(): Promise<void> {
	// Parse command line arguments
	const args = parseArgs(Deno.args);

	if (args === null) {
		console.log(getHelpText());
		Deno.exit(0);
	}

	// Check required commands
	console.log('Checking required commands...');
	await checkRequiredCommands();

	// Build paths
	const rootDir = resolve(import.meta.dirname!, '..');
	const projDir = resolve(rootDir, 'regions', args.name);
	const dataDir = resolve(getDataDir(), args.name);
	const tempDir = resolve(getTempDir(), args.name);

	// Ensure data directory exists
	await ensureDir(dataDir);

	// Create task context
	const ctx: TaskContext = {
		name: args.name,
		projDir,
		dataDir,
		tempDir,
	};

	// Run tasks
	console.log(`Running tasks: ${args.tasks.join(' ')}`);

	for (const taskNum of args.tasks) {
		await runTask(taskNum, ctx);
	}

	console.log('\nDone.');
}

// Run main
main().catch((error) => {
	console.error(`Error: ${error.message}`);
	Deno.exit(1);
});
