/**
 * Task implementations for the run script.
 * Task implementations for the pipeline (tasks 1-3).
 */

import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { posix, resolve } from 'node:path';
import { runScpUpload, runSshCommand } from './commands.ts';
import { runMosaicAssemble } from '../lib/versatiles.ts';
import { TASK_NUMBER_TO_NAME } from './tasks.constants.ts';
import { safeRm } from '../lib/fs.ts';
import { getRegionPipeline, suggestSimilarRegions } from '../regions/index.ts';
import { getConfig } from '../config.ts';

export interface TaskContext {
	name: string; // Region identifier (e.g., "de/bw")
	dataDir: string; // Path to $dir_data/<name>
	tempDir: string; // Path to $dir_temp/<name>
}

/**
 * Builds a "No pipeline defined …" error message enriched with fuzzy suggestions.
 * Exported so `src/run.ts` can fail fast with the same wording before any I/O.
 */
export function formatUnknownRegionError(name: string): string {
	const suggestions = suggestSimilarRegions(name);
	const base = `No pipeline defined for region "${name}"`;
	if (suggestions.length === 0) return base;
	return `${base}. Did you mean: ${suggestions.join(', ')}?`;
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
 * Runs the region's pipeline (which downloads, converts, and writes filelist.txt).
 */
async function taskFetch(ctx: TaskContext): Promise<void> {
	console.log('Fetching new data...');

	mkdirSync(ctx.tempDir, { recursive: true });

	const pipeline = getRegionPipeline(ctx.name);
	if (!pipeline?.run) {
		throw new Error(formatUnknownRegionError(ctx.name));
	}

	await pipeline.run({
		name: ctx.name,
		dataDir: ctx.dataDir,
		tempDir: ctx.tempDir,
	});

	const filelistPath = resolve(ctx.dataDir, 'filelist.txt');
	if (!existsSync(filelistPath)) {
		throw new Error(`filelist.txt not found after pipeline run. This should not happen.`);
	}
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
		safeRm(localTmp);
		throw err;
	}

	await uploadToRemote(localFinal, ctx.name);
}

/**
 * Uploads a local file to the remote server via scp.
 * The remote destination is `${ssh_dir}/${regionName}.versatiles`; the parent
 * directory is created if needed (e.g. for slashed region IDs like `de/bayern`).
 * Writes to a temp file first, then atomically renames on success.
 */
async function uploadToRemote(localPath: string, regionName: string): Promise<void> {
	const { dir } = getConfig().ssh!;
	const finalRemote = `${dir}/${regionName}.versatiles`;
	const tmpRemote = `${finalRemote}.tmp`;
	const parentDir = posix.dirname(finalRemote);

	await runSshCommand(`mkdir -p '${parentDir}'`);

	console.log(`  Uploading to ${finalRemote}...`);
	try {
		await runScpUpload(localPath, tmpRemote);
		await runSshCommand(`mv '${tmpRemote}' '${finalRemote}'`);
		console.log(`  Upload complete.`);
	} catch (err) {
		try {
			await runSshCommand(`rm -f '${tmpRemote}'`);
		} catch {}
		throw err;
	}
}

/**
 * Task 3: Delete local data.
 * Asks for confirmation, then removes both data and temp directories.
 */
async function taskDelete(ctx: TaskContext): Promise<void> {
	console.log(`This will delete:`);
	console.log(`  ${ctx.dataDir}`);
	console.log(`  ${ctx.tempDir}`);

	if (process.stdin.isTTY) {
		const rl = createInterface({ input: process.stdin, output: process.stdout });
		const answer = await new Promise<string>((resolve) => rl.question('Are you sure? (y/N) ', resolve));
		rl.close();

		if (answer.trim().toLowerCase() !== 'y') {
			console.log('  Aborted.');
			return;
		}
	}

	safeRm(ctx.dataDir);
	safeRm(ctx.tempDir);

	console.log('  Local data deleted.');
}
