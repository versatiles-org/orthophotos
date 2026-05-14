/**
 * Wrappers around the `versatiles` CLI (`mosaic tile`, `mosaic assemble`).
 */

import { renameSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { runCommand } from './command.ts';
import { MAX_ZOOM, QUALITY } from './constants.ts';
import { safeRm } from './fs.ts';

/**
 * Verifies that command output contains the expected success marker.
 */
function assertOutputContains(result: { stderr: Uint8Array }, marker: string, context: string): void {
	const stderr = new TextDecoder().decode(result.stderr);
	if (!stderr.includes(marker)) {
		throw new Error(`${context}: expected "${marker}" in output but got:\n${stderr.trim()}`);
	}
}

/**
 * Runs `versatiles mosaic tile` to tile a single raster image into a .versatiles container.
 */
export async function runMosaicTile(
	input: string,
	output: string,
	options?: { bands?: string; nodata?: string; crs?: string; cacheDirectory?: string; gdalConcurrency?: number },
): Promise<void> {
	// Always cap at MAX_ZOOM so output pyramids across regions are consistent —
	// sources finer than that (e.g. 12.5cm DK, 15cm FR) stop at the same zoom
	// instead of producing extra levels nobody serves.
	const args = ['mosaic', 'tile', '--quality', QUALITY, '--max-zoom', String(MAX_ZOOM)];
	if (options?.bands) {
		args.push('--bands', options.bands);
	}
	if (options?.nodata) {
		args.push('--nodata', options.nodata);
	}
	if (options?.crs) {
		args.push('--crs', options.crs);
	}
	if (options?.cacheDirectory) {
		args.push('--cache-dir', options.cacheDirectory);
	}
	if (options?.gdalConcurrency !== undefined) {
		args.push('--gdal-concurrency', String(options.gdalConcurrency));
	}
	const tmpOutput = join(dirname(output), `.tmp.${basename(output)}`);
	args.push(input, tmpOutput);
	try {
		const result = await runCommand('versatiles', args, { quiet: true });
		assertOutputContains(result, 'finished mosaic tile', `runMosaicTile for "${input}"`);
		renameSync(tmpOutput, output);
	} catch (cause) {
		safeRm(tmpOutput);
		throw new Error(`runMosaicTile failed for "${input}"`, { cause });
	}
}

/**
 * Runs `versatiles mosaic assemble` to assemble multiple tile containers into one.
 */
export async function runMosaicAssemble(
	filelistPath: string,
	output: string,
	options?: { lossless?: boolean; quiet?: boolean; quietOnError?: boolean },
): Promise<void> {
	// Defence in depth: reject any path containing whitespace, quotes, or shell
	// metacharacters before concatenating it into the `@<path>` versatiles
	// file-list argument. `runCommand` uses `spawn` without `shell: true` so this
	// can't reach a shell anyway, but the validation also silences the
	// `js/shell-command-constructed-from-input` CodeQL warning and catches
	// obviously-malformed callers early.
	if (!/^[\w./\-+]+$/.test(filelistPath)) {
		throw new Error(`runMosaicAssemble: filelist path contains unsafe characters: ${JSON.stringify(filelistPath)}`);
	}
	// No --max-zoom: include every zoom level present in the inputs.
	const args = ['mosaic', 'assemble', '--max-buffer-size', '50%', '--quality', QUALITY];
	if (options?.lossless) {
		args.push('--lossless');
	}
	args.push('@' + filelistPath, output);
	const result = await runCommand('versatiles', args, { quiet: options?.quiet, quietOnError: options?.quietOnError });
	assertOutputContains(result, 'finished mosaic assemble', `runMosaicAssemble for "${filelistPath}"`);
}
