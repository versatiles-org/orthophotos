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
import { getConfig } from './config.ts';
import { getHelpText, parseArgs } from './run/args.ts';
import { formatErrorChain } from './lib/command.ts';
import { checkRequiredCommands, remoteFileExists, runSshCommand } from './run/commands.ts';
import { formatUnknownRegionError, runTask, type TaskContext } from './run/tasks.ts';
import { getRegionPipeline } from './regions/index.ts';

async function checkRemoteServer(): Promise<void> {
	console.log('Checking remote server...');
	try {
		await runSshCommand('exit');
	} catch (err) {
		// SSH returns 255 for connection failures; other exit codes mean the connection worked
		if (err instanceof Error && err.message.includes('Exit code: 255')) {
			throw new Error(`Cannot connect to remote server`);
		}
	}
	console.log('  Remote server is accessible.');
}

async function main(): Promise<void> {
	// Parse command line arguments
	const args = parseArgs(process.argv.slice(2));

	if (args === null) {
		console.log(getHelpText());
		process.exit(0);
	}

	// Fail fast (before SSH/command checks) if the region name isn't registered.
	if (!getRegionPipeline(args.name)) {
		throw new Error(formatUnknownRegionError(args.name));
	}

	// Check required commands
	console.log('Checking required commands...');
	await checkRequiredCommands();

	// If fetch or merge is requested and the final file already exists on the
	// remote, skip those tasks — nothing to scrape or re-upload.
	const ssh = getConfig().ssh;
	if (ssh && (args.tasks.includes(1) || args.tasks.includes(2))) {
		const remotePath = `${ssh.dir}/${args.name}.versatiles`;
		if (await remoteFileExists(remotePath)) {
			console.log(`Remote file already exists at ${remotePath} — skipping fetch and merge.`);
			args.tasks = args.tasks.filter((t) => t !== 1 && t !== 2);
		}
	}

	// If merge task is still requested, verify remote is accessible before starting
	if (args.tasks.includes(2)) {
		await checkRemoteServer();
	}

	// Build paths
	const dataDir = resolve(getConfig().dirData, args.name);
	const tempDir = resolve(getConfig().dirTemp, args.name);

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
	console.error(`Error: ${formatErrorChain(error)}`);
	process.exit(1);
});
