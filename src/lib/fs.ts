/**
 * Filesystem helper utilities.
 */

import { readdirSync, type Dirent } from 'node:fs';
import { rm } from 'node:fs/promises';
import { extname, join } from 'node:path';

/**
 * Safely removes a directory, ignoring NotFound errors.
 * @param path Path to the directory to remove
 */
export async function safeRemoveDir(path: string): Promise<void> {
	try {
		await rm(path, { recursive: true });
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
			throw e;
		}
	}
}

export interface WalkEntry {
	path: string;
	name: string;
	isFile: boolean;
	isDirectory: boolean;
}

/**
 * Recursively walks a directory, yielding entries that match the given criteria.
 * @param dir Directory to walk
 * @param options Options for filtering (exts, includeDirs)
 */
export function* walkSync(dir: string, options?: { exts?: string[]; includeDirs?: boolean }): Generator<WalkEntry> {
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (options?.includeDirs !== false && options?.includeDirs) {
				yield {
					path: fullPath,
					name: entry.name,
					isFile: false,
					isDirectory: true,
				};
			}
			yield* walkSync(fullPath, options);
		} else if (entry.isFile()) {
			if (options?.exts) {
				const ext = extname(entry.name);
				if (!options.exts.includes(ext)) continue;
			}
			yield {
				path: fullPath,
				name: entry.name,
				isFile: true,
				isDirectory: false,
			};
		}
	}
}
