/**
 * Task implementations for the run script.
 * Task implementations for the pipeline (tasks 1-3).
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { buildSftpUrl, runSshCommand, runVersatilesRasterMerge } from './commands.ts';
import { TASK_NUMBER_TO_NAME } from './tasks.constants.ts';
import { safeRemoveDir } from '../lib/fs.ts';
import { getRegionPipeline } from '../regions/index.ts';
import { requireSshConfig } from '../config.ts';

export interface TaskContext {
	name: string; // Region identifier (e.g., "de/bw")
	dataDir: string; // Path to $dir_data/<name>
	tempDir: string; // Path to $dir_temp/<name>
}

/**
 * Runs a single task.
 */
export async function runTask(taskNum: number, ctx: TaskContext): Promise<void> {
	const taskName = TASK_NUMBER_TO_NAME[taskNum] ?? `unknown(${taskNum})`;
	console.log(`\n=== Task ${taskNum}: ${taskName} ===`);

	switch (taskNum) {
		case 1:
			await taskFetch(ctx);
			break;
		case 2:
			await taskMerge(ctx);
			break;
		case 3:
			await taskDelete(ctx);
			break;
		default:
			throw new Error(`Unknown task: ${taskNum}`);
	}
}

/**
 * Task 1: Fetch new source data.
 * Runs the region's pipeline steps (which download and convert rasters to .versatiles),
 * then scans dataDir for .versatiles files and writes filelist.txt.
 */
async function taskFetch(ctx: TaskContext): Promise<void> {
	console.log('Fetching new data...');
	mkdirSync(ctx.tempDir, { recursive: true });

	const pipeline = getRegionPipeline(ctx.name);
	if (!pipeline?.run) {
		throw new Error(`No pipeline defined for region "${ctx.name}"`);
	}
	await pipeline.run({
		name: ctx.name,
		dataDir: ctx.dataDir,
		tempDir: ctx.tempDir,
	});

	// Scan for .versatiles files and write filelist.txt
	const versatilesFiles: string[] = [];

	function scanDir(dir: string): void {
		if (!existsSync(dir)) return;
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				scanDir(join(dir, entry.name));
			} else if (entry.name.endsWith('.versatiles')) {
				versatilesFiles.push(join(dir, entry.name));
			}
		}
	}
	scanDir(ctx.dataDir);

	const filelistPath = resolve(ctx.dataDir, 'filelist.txt');
	writeFileSync(filelistPath, versatilesFiles.join('\n'));
	console.log(`  Wrote filelist.txt with ${versatilesFiles.length} entries.`);

	// Clean up temp directory after successful completion
	await safeRemoveDir(ctx.tempDir);
}

/**
 * Task 2: Merge all per-file .versatiles into one result.
 * Reads filelist.txt, runs `versatiles mosaic assemble` writing directly
 * to remote storage via sftp://, then renames the temp file on success.
 */
async function taskMerge(ctx: TaskContext): Promise<void> {
	console.log('Merging .versatiles files...');

	const filelistPath = resolve(ctx.dataDir, 'filelist.txt');
	if (!existsSync(filelistPath)) {
		throw new Error(`filelist.txt not found in ${ctx.dataDir}. Run the fetch task first.`);
	}

	const { host, port, id, dir } = requireSshConfig();
	const remoteDir = `${dir}/${ctx.name}`;
	const tmpRemote = `${remoteDir}/tmp.result.versatiles`;
	const finalRemote = `${remoteDir}/result.versatiles`;
	const outputUrl = buildSftpUrl(host, port, tmpRemote);

	await runSshCommand(host, port, id, `mkdir -p '${remoteDir}'`);

	try {
		await runVersatilesRasterMerge(filelistPath, outputUrl);
		await runSshCommand(host, port, id, `mv '${tmpRemote}' '${finalRemote}'`);
		console.log(`  Merged into ${finalRemote}`);
	} catch (err) {
		try {
			await runSshCommand(host, port, id, `rm -f '${tmpRemote}'`);
		} catch {}
		throw err;
	}
}

/**
 * Task 3: Delete local data.
 * Removes both data and temp directories.
 */
async function taskDelete(ctx: TaskContext): Promise<void> {
	console.log('Deleting local data...');

	await safeRemoveDir(ctx.dataDir);
	await safeRemoveDir(ctx.tempDir);

	console.log('  Local data deleted.');
}
