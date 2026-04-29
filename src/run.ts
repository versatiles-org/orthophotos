#!/usr/bin/env node

/**
 * Main entry point for the orthophoto processing pipeline.
 *
 * Usage:
 *   ./run.sh <name> <task>            (preferred)
 *   npm run pipeline -- <name> <task>
 *
 * Example:
 *   ./run.sh de/bw 1        # run fetch
 *   ./run.sh de/bw 2        # run merge
 *   ./run.sh de/bw all      # full pipeline (1 2 3)
 */

import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { getConfig } from './config.ts';
import { expandRegionPattern, getHelpText, parseArgs } from './run/args.ts';
import { formatErrorChain } from './lib/command.ts';
import { checkRequiredCommands, remoteFileExists, runSshCommand } from './run/commands.ts';
import { formatUnknownRegionError, runTask, type TaskContext } from './run/tasks.ts';
import { getAllRegionMetadata, getRegionPipeline } from './regions/index.ts';

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

	// Resolve the region pattern against the registry. Single names stay as-is;
	// glob patterns like "fr/*" expand to every matching registered ID.
	const allIds = [...getAllRegionMetadata().keys()];
	const names = expandRegionPattern(args.name, allIds);
	if (names.length === 0) {
		throw new Error(formatUnknownRegionError(args.name));
	}
	for (const name of names) {
		if (!getRegionPipeline(name)) throw new Error(formatUnknownRegionError(name));
	}

	// Check required commands once for the whole batch.
	console.log('Checking required commands...');
	await checkRequiredCommands();

	// If merge is requested anywhere, verify the remote up front so we fail fast.
	if (args.tasks.includes(2)) {
		await checkRemoteServer();
	}

	const ssh = getConfig().ssh;

	for (const name of names) {
		if (names.length > 1) console.log(`\n=== Region: ${name} ===`);

		let tasks = [...args.tasks];

		// If fetch or merge is requested and the final file already exists on
		// the remote, skip those tasks — nothing to scrape or re-upload.
		if (ssh && (tasks.includes(1) || tasks.includes(2))) {
			const remotePath = `${ssh.dir}/${name}.versatiles`;
			if (await remoteFileExists(remotePath)) {
				console.log(`Remote file already exists at ${remotePath} — skipping fetch and merge.`);
				tasks = tasks.filter((t) => t !== 1 && t !== 2);
			}
		}

		if (tasks.length === 0) continue;

		const dataDir = resolve(getConfig().dirData, name);
		const tempDir = resolve(getConfig().dirTemp, name);
		mkdirSync(dataDir, { recursive: true });

		const ctx: TaskContext = { name, dataDir, tempDir };

		console.log(`Running tasks: ${tasks.join(' ')}`);
		for (const taskNum of tasks) {
			await runTask(taskNum, ctx);
		}
	}

	console.log('\nDone.');
}

// Run main
main().catch((error) => {
	console.error(`Error: ${formatErrorChain(error)}`);
	process.exit(1);
});
