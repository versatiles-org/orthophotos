/**
 * Task implementations for the run script.
 * Tasks 0-6 matching the original run.sh functionality.
 */

import { mkdirSync } from 'node:fs';
import { rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runBashScript, runGdalwarp, runRsyncDownload, runRsyncUpload, runVersatiles } from './commands.ts';
import { TASK_NUMBER_TO_NAME } from './tasks.constants.ts';
import { readStatusEntries } from '../lib/yaml.ts';
import { safeRemoveDir, safeRemoveFile } from '../lib/fs.ts';
import { getRegionPipeline } from '../regions/index.ts';
import { runPipeline } from '../lib/framework.ts';

export interface TaskContext {
	name: string; // Region identifier (e.g., "de/bw")
	projDir: string; // Path to regions/<name>
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
			await taskVrt(ctx);
			break;
		case 3:
			await taskPreview(ctx);
			break;
		case 4:
			await taskConvert(ctx);
			break;
		case 5:
			await taskUpload(ctx);
			break;
		case 6:
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
 * Runs the region's 1_fetch.sh script.
 */
async function taskFetch(ctx: TaskContext): Promise<void> {
	console.log('Fetching new data...');
	mkdirSync(ctx.tempDir, { recursive: true });

	const pipeline = getRegionPipeline(ctx.name);
	if (pipeline) {
		await runPipeline(pipeline, {
			name: ctx.name,
			projDir: ctx.projDir,
			dataDir: ctx.dataDir,
			tempDir: ctx.tempDir,
		});
	} else {
		const scriptPath = resolve(ctx.projDir, '1_fetch.sh');
		const env = {
			DATA: ctx.dataDir,
			TEMP: ctx.tempDir,
			PROJ: ctx.projDir,
		};
		await runBashScript(scriptPath, env, ctx.tempDir);
	}

	// Clean up temp directory after successful completion
	await safeRemoveDir(ctx.tempDir);
}

/**
 * Task 2: Build VRTs.
 * Runs the region's 2_build_vrt.sh script.
 */
async function taskVrt(ctx: TaskContext): Promise<void> {
	console.log('Building VRT...');
	mkdirSync(ctx.tempDir, { recursive: true });

	const scriptPath = resolve(ctx.projDir, '2_build_vrt.sh');
	const env = {
		DATA: ctx.dataDir,
		TEMP: ctx.tempDir,
		PROJ: ctx.projDir,
	};

	await runBashScript(scriptPath, env, ctx.dataDir);

	// Clean up temp directory after successful completion
	await safeRemoveDir(ctx.tempDir);
}

/**
 * Task 3: Create preview TIFFs.
 * Uses gdalwarp to create 200x200 pixel preview images.
 */
async function taskPreview(ctx: TaskContext): Promise<void> {
	console.log('Creating preview images...');

	const statusPath = resolve(ctx.projDir, 'status.yml');
	const sources = readStatusEntries(statusPath);

	for (const source of sources) {
		console.log(`  Processing ${source}...`);
		mkdirSync(ctx.tempDir, { recursive: true });

		const inputVrt = resolve(ctx.dataDir, `${source}.vrt`);
		const tempTif = resolve(ctx.tempDir, `${source}.tif`);
		const outputTif = resolve(ctx.dataDir, `${source}.tif`);

		await runGdalwarp(inputVrt, tempTif, ctx.dataDir);

		// Move temp file to final location
		await rename(tempTif, outputTif);
	}
}

/**
 * Task 4: Convert to .versatiles format.
 * Creates .vpl pipeline files and runs versatiles convert.
 */
async function taskConvert(ctx: TaskContext): Promise<void> {
	console.log('Converting data...');

	const statusPath = resolve(ctx.projDir, 'status.yml');
	const sources = readStatusEntries(statusPath);

	for (const source of sources) {
		console.log(`  Converting ${source}...`);
		mkdirSync(ctx.tempDir, { recursive: true });

		const inputVrt = resolve(ctx.dataDir, `${source}.vrt`);
		const vplPath = resolve(ctx.tempDir, `${source}.vpl`);
		const tempVersatiles = resolve(ctx.tempDir, `${source}.versatiles`);
		const outputVersatiles = resolve(ctx.dataDir, `${source}.versatiles`);

		// Create .vpl pipeline file
		const vplContent = `from_gdal_raster filename="${inputVrt}" level_max=17 max_reuse_gdal=8 | raster_overview | raster_format format=webp quality="70,16:50,17:30" speed=0`;
		await writeFile(vplPath, vplContent);

		// Run versatiles convert
		await runVersatiles(vplPath, tempVersatiles);

		// Move to final location
		await rename(tempVersatiles, outputVersatiles);

		// Clean up temp files
		await safeRemoveFile(vplPath);
	}
}

/**
 * Task 5: Upload data to remote server.
 * Excludes tiles/ and tiles_{*}/ directories.
 */
async function taskUpload(ctx: TaskContext): Promise<void> {
	console.log('Uploading data to server...');
	await runRsyncUpload(ctx.dataDir, ctx.name);
}

/**
 * Task 6: Delete local data.
 * Removes both data and temp directories.
 */
async function taskDelete(ctx: TaskContext): Promise<void> {
	console.log('Deleting local data...');

	await safeRemoveDir(ctx.dataDir);
	await safeRemoveDir(ctx.tempDir);

	console.log('  Local data deleted.');
}
