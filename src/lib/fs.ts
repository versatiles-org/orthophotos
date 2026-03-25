/**
 * Filesystem helper utilities.
 */

import { readdirSync, renameSync, rmSync, type Dirent } from 'node:fs';
import { extname, join } from 'node:path';
import { runCommand } from './command.ts';

/**
 * Safely removes a file or directory, ignoring errors.
 */
export function safeRm(path: string): void {
	try {
		rmSync(path, { recursive: true, force: true });
	} catch {}
}

/**
 * Extracts a ZIP file to a target directory atomically.
 * Extracts to a temporary directory first, then renames on success.
 * If the target directory already exists, extraction is skipped.
 */
export async function extractZipFile(zipPath: string, targetDir: string): Promise<void> {
	const tmpDir = `${targetDir}.tmp`;
	safeRm(tmpDir);
	await runCommand('unzip', ['-qo', zipPath, '-d', tmpDir]);
	safeRm(targetDir);
	renameSync(tmpDir, targetDir);
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
