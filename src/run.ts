#!/usr/bin/env node

/**
 * Main entry point for the orthophoto processing pipeline.
 *
 * Usage:
 *   npm run run -- <name> <task>
 *
 * Example:
 *   npm run run -- de/bw 1        # run fetch
 *   npm run run -- de/bw 2-4      # run vrt, preview, convert
 *   npm run run -- de/bw all      # full pipeline
 */

import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getDataDir, getTempDir } from './config.ts';
import { getHelpText, parseArgs } from './run/args.ts';
import { checkRequiredCommands } from './run/commands.ts';
import { runTask, type TaskContext } from './run/tasks.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
	const rootDir = resolve(__dirname, '..');
	const projDir = resolve(rootDir, 'src', 'regions');
	const dataDir = resolve(getDataDir(), args.name);
	const tempDir = resolve(getTempDir(), args.name);

	// Ensure data directory exists
	mkdirSync(dataDir, { recursive: true });

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
	process.exit(1);
});
