/**
 * Task implementations for the run script.
 * Tasks 0-4 matching the new pipeline structure.
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { runRsyncDownload, runRsyncUpload, runVersatilesRasterMerge } from './commands.ts';
import { TASK_NUMBER_TO_NAME } from './tasks.constants.ts';
import { safeRemoveDir } from '../lib/fs.ts';
import { getRegionPipeline } from '../regions/index.ts';
import { runPipeline } from '../lib/framework.ts';

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
		case 0:
			await taskDownload(ctx);
			break;
		case 1:
			await taskFetch(ctx);
			break;
		case 2:
			await taskMerge(ctx);
			break;
		case 3:
			await taskUpload(ctx);
			break;
		case 4:
			await taskDelete(ctx);
			break;
		default:
			throw new Error(`Unknown task: ${taskNum}`);
	}
}

/**
 * Task 0: Download existing data from remote server.
 */
async function taskDownload(ctx: TaskContext): Promise<void> {
	console.log('Downloading existing data from server...');
	mkdirSync(ctx.dataDir, { recursive: true });
	await runRsyncDownload(ctx.name, ctx.dataDir);
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
	if (!pipeline) {
		throw new Error(`No pipeline defined for region "${ctx.name}"`);
	}
	await runPipeline(pipeline, {
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
 * Reads filelist.txt and runs `versatiles raster merge`.
 */
async function taskMerge(ctx: TaskContext): Promise<void> {
	console.log('Merging .versatiles files...');

	const filelistPath = resolve(ctx.dataDir, 'filelist.txt');
	if (!existsSync(filelistPath)) {
		throw new Error(`filelist.txt not found in ${ctx.dataDir}. Run the fetch task first.`);
	}

	const outputPath = resolve(ctx.dataDir, 'result.versatiles');
	await runVersatilesRasterMerge(filelistPath, outputPath);
	console.log(`  Merged into ${outputPath}`);
}

/**
 * Task 3: Upload data to remote server.
 * Excludes tiles/ and tiles_{*}/ directories.
 */
async function taskUpload(ctx: TaskContext): Promise<void> {
	console.log('Uploading data to server...');
	await runRsyncUpload(ctx.dataDir, ctx.name);
}

/**
 * Task 4: Delete local data.
 * Removes both data and temp directories.
 */
async function taskDelete(ctx: TaskContext): Promise<void> {
	console.log('Deleting local data...');

	await safeRemoveDir(ctx.dataDir);
	await safeRemoveDir(ctx.tempDir);

	console.log('  Local data deleted.');
}
