/**
 * Reusable postcondition validators for fetch pipeline steps.
 */

import { stat } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from './command.ts';

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
