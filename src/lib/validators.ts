/**
 * Reusable postcondition validators for fetch pipeline steps.
 */

import { rmSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { join } from 'node:path';
import { downloadFile, type DownloadOptions, runCommand } from './command.ts';
import { type RetryOptions, withRetry } from './retry.ts';

/**
 * Check that a file is a valid GDAL-readable raster with georeferencing.
 */
export async function isValidRaster(path: string): Promise<boolean> {
	try {
		await runCommand('gdalinfo', ['-json', path], { stdout: 'piped', stderr: 'piped' });
		return true;
	} catch {
		return false;
	}
}

/**
 * Returns true when every band of the raster has a max pixel value of 0 — i.e.
 * the entire image is black (or empty / fully transparent for an alpha band).
 *
 * Uses `gdalinfo -mm` which scans every pixel; for an 8192×8192 deflate-compressed
 * TIFF this typically takes a few seconds. Useful for skipping legitimately-empty
 * tiles (out-of-coverage WMS / WMTS responses) before the convert stage.
 */
export async function isRasterAllZero(path: string): Promise<boolean> {
	const result = await runCommand('gdalinfo', ['-mm', path], {
		stdout: 'piped',
		stderr: 'piped',
		quiet: true,
		quietOnError: true,
	});
	const text = Buffer.from(result.stdout).toString('utf-8');
	const maxes: number[] = [];
	for (const line of text.split('\n')) {
		const m = /Computed Min\/Max=([-\d.]+),([-\d.]+)/.exec(line);
		if (m) maxes.push(Number(m[2]));
	}
	if (maxes.length === 0) return false;
	return maxes.every((max) => max === 0);
}

/**
 * Collects error messages during a concurrent fetch loop.
 * Call `add()` for each error, then `throwIfAny()` after the loop completes.
 */
export class ErrorBucket {
	private errors: string[] = [];

	add(msg: string): void {
		this.errors.push(msg);
	}

	throwIfAny(): void {
		if (this.errors.length === 0) return;
		const list = this.errors.map((msg) => `  ${msg}`).join('\n');
		throw new Error(`${this.errors.length} error(s) occurred:\n${list}`);
	}
}

export interface DownloadRasterOptions {
	/** Retry settings forwarded to withRetry. Default: `{ maxAttempts: 3 }`. */
	retry?: RetryOptions;
	/** Forwarded to downloadFile (headers, minSize, continue). */
	download?: DownloadOptions;
}

/**
 * Download a raster file with retries, then validate it with `isValidRaster`.
 * On validation failure: deletes the bad file, calls `errors.add(\`${id} (${url})\`)`,
 * and returns `'invalid'`. On success: returns `{ ok: true, path: dest }`.
 *
 * Network failures propagate after retries are exhausted (no `.skip` masking).
 */
export async function downloadRaster(
	url: string,
	dest: string,
	errors: ErrorBucket,
	id: string,
	options?: DownloadRasterOptions,
): Promise<{ ok: true; path: string } | 'invalid'> {
	await withRetry(() => downloadFile(url, dest, options?.download), options?.retry ?? { maxAttempts: 3 });
	if (!(await isValidRaster(dest))) {
		try {
			rmSync(dest, { force: true });
		} catch {}
		errors.add(`${id} (${url})`);
		return 'invalid';
	}
	return { ok: true, path: dest };
}

/**
 * Check that a directory contains at least `min` files matching a glob pattern.
 */
export async function expectMinFiles(dir: string, pattern: string, min: number): Promise<void> {
	let count = 0;
	for await (const _path of glob(join(dir, pattern))) {
		count++;
		if (count >= min) return;
	}
	throw new Error(`Expected at least ${min} files matching "${pattern}" in ${dir}, found ${count}`);
}

/**
 * Check that a specific file exists and is non-empty.
 */
export async function expectFile(path: string): Promise<void> {
	let info;
	try {
		info = await stat(path);
	} catch {
		throw new Error(`Expected file does not exist: ${path}`);
	}
	if (info.size === 0) {
		throw new Error(`Expected file is empty: ${path}`);
	}
}

/**
 * Check that files matching a glob are above a minimum size.
 */
export async function expectMinFileSize(dir: string, pattern: string, minBytes: number): Promise<void> {
	let found = false;
	for await (const filePath of glob(join(dir, pattern))) {
		found = true;
		const info = await stat(filePath);
		if (info.size < minBytes) {
			throw new Error(`File ${filePath} is ${info.size} bytes, expected at least ${minBytes}`);
		}
	}
	if (!found) {
		throw new Error(`No files matching "${pattern}" found in ${dir}`);
	}
}
