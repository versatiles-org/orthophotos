#!/usr/bin/env node

/**
 * Main entry point for the orthophoto processing pipeline.
 *
 * Usage:
 *   npm run run -- <name> <task>
 *
 * Example:
 *   npm run run -- de/bw 1        # run fetch
 *   npm run run -- de/bw 2        # run merge
 *   npm run run -- de/bw all      # full pipeline (1 2 3)
 */

import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { getDataDir, getTempDir } from './config.ts';
import { getHelpText, parseArgs } from './run/args.ts';
import { checkRequiredCommands } from './run/commands.ts';
import { runTask, type TaskContext } from './run/tasks.ts';

async function main(): Promise<void> {
	// Parse command line arguments
	const args = parseArgs(process.argv.slice(2));

	if (args === null) {
		console.log(getHelpText());
		process.exit(0);
	}

	// Check required commands
	console.log('Checking required commands...');
	await checkRequiredCommands();

	// Build paths
	const dataDir = resolve(getDataDir(), args.name);
	const tempDir = resolve(getTempDir(), args.name);

	// Ensure data directory exists
	mkdirSync(dataDir, { recursive: true });

	// Create task context
	const ctx: TaskContext = {
		name: args.name,
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
	process.exit(1);
});
