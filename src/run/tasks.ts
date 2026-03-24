/**
 * Task implementations for the run script.
 * Task implementations for the pipeline (tasks 1-3).
 */

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { runCommand } from '../lib/command.ts';
import { runSshCommand, runMosaicAssemble } from './commands.ts';
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

	// Clean up any leftover temp files from a previous interrupted run
	await safeRemoveDir(ctx.tempDir);
	mkdirSync(ctx.tempDir, { recursive: true });

	const pipeline = getRegionPipeline(ctx.name);
	if (!pipeline?.run) {
		throw new Error(`No pipeline defined for region "${ctx.name}"`);
	}
	try {
		await pipeline.run({
			name: ctx.name,
			dataDir: ctx.dataDir,
			tempDir: ctx.tempDir,
		});
	} finally {
		// Clean up temp directory regardless of success or failure
		await safeRemoveDir(ctx.tempDir);
	}

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
}

/**
 * Task 2: Merge all per-file .versatiles into one result, then upload.
 * Reads filelist.txt, runs `versatiles mosaic assemble` to write a local file,
 * then uploads it to the remote server via scp.
 */
async function taskMerge(ctx: TaskContext): Promise<void> {
	console.log('Merging .versatiles files...');

	const filelistPath = resolve(ctx.dataDir, 'filelist.txt');
	if (!existsSync(filelistPath)) {
		throw new Error(`filelist.txt not found in ${ctx.dataDir}. Run the fetch task first.`);
	}

	const localTmp = resolve(ctx.dataDir, 'tmp.result.versatiles');
	const localFinal = resolve(ctx.dataDir, 'result.versatiles');

	try {
		await runMosaicAssemble(filelistPath, localTmp);
		renameSync(localTmp, localFinal);
		console.log(`  Merged into ${localFinal}`);
	} catch (err) {
		try {
			rmSync(localTmp, { force: true });
		} catch {}
		throw err;
	}

	await uploadToRemote(localFinal, ctx.name, 'result.versatiles');
}

/**
 * Uploads a local file to the remote server via scp.
 * Writes to a temp file first, then atomically renames on success.
 */
async function uploadToRemote(localPath: string, regionName: string, filename: string): Promise<void> {
	const { host, port, id, dir } = requireSshConfig();
	const remoteDir = `${dir}/${regionName}`;
	const finalRemote = `${remoteDir}/${filename}`;
	const tmpRemote = `${finalRemote}.tmp`;

	await runSshCommand(host, port, id, `mkdir -p '${remoteDir}'`);

	console.log(`  Uploading to ${finalRemote}...`);
	try {
		await runCommand('scp', ['-P', port, '-i', id, localPath, `${host}:${tmpRemote}`]);
		await runSshCommand(host, port, id, `mv '${tmpRemote}' '${finalRemote}'`);
		console.log(`  Upload complete.`);
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
