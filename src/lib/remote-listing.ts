/**
 * One-shot recursive listing of `.versatiles` files on the remote SSH host.
 *
 * Uses a single `ls -lR --time-style=full-iso` over the configured `ssh_dir`,
 * because `find` is not present on restricted shells (e.g. Hetzner Storage Box)
 * but `ls` is — same constraint as `remoteFileExists` documents.
 */

import { runCommand } from './command.ts';
import { getConfig } from './config.ts';

export interface RemoteFile {
	/** Path relative to ssh_dir (e.g. "de/bayern.versatiles"). */
	path: string;
	size: number;
	/** Modification date as a Date object (parsed from `--time-style=full-iso`). */
	mtime: Date;
}

/**
 * Lists every `*.versatiles` file under `ssh_dir`, with size and mtime.
 *
 * One SSH round-trip; throws if the SSH connection itself fails.
 */
export async function listRemoteVersatilesFiles(): Promise<RemoteFile[]> {
	const ssh = getConfig().ssh;
	if (!ssh) throw new Error('SSH configuration is missing');

	const { host, port, keyFile, dir } = ssh;
	const sshArgs: string[] = ['-o', 'ConnectTimeout=15'];
	if (port) sshArgs.push('-p', port);
	if (keyFile) sshArgs.push('-i', keyFile);

	// `--time-style=full-iso` produces "2025-03-27 14:25:01.000000000 +0000",
	// trivial to parse. `-R` recurses into subdirs (e.g. de/, fr/).
	const escaped = dir.replace(/'/g, `'\\''`);
	const result = await runCommand('ssh', [...sshArgs, host, `ls -lR --time-style=full-iso '${escaped}'`], {
		stdout: 'piped',
		stderr: 'piped',
		quietOnError: true,
	});

	return parseLsLR(Buffer.from(result.stdout).toString('utf-8'), dir);
}

/**
 * Parses `ls -lR --time-style=full-iso` output, returning only `*.versatiles`
 * files with paths relative to the listed root.
 *
 * Exported for testing.
 */
export function parseLsLR(output: string, rootDir: string): RemoteFile[] {
	const files: RemoteFile[] = [];
	let currentDir = rootDir;

	for (const rawLine of output.split('\n')) {
		const line = rawLine.trimEnd();
		if (!line) continue;

		// Section header for each directory: "/path/to/dir:"
		if (line.endsWith(':') && !line.startsWith('-') && !line.startsWith('d')) {
			currentDir = line.slice(0, -1);
			continue;
		}

		// "total NN" line at the start of every directory listing
		if (line.startsWith('total ')) continue;

		// File line: "perms links owner group size YYYY-MM-DD HH:MM:SS.fff +ZZZZ name"
		// Only process regular files (`-` prefix). Skip dirs (`d`), symlinks (`l`), etc.
		if (!line.startsWith('-')) continue;

		const parts = line.split(/\s+/);
		if (parts.length < 9) continue;

		const size = Number(parts[4]);
		const date = parts[5];
		const time = parts[6];
		const tz = parts[7];
		const name = parts.slice(8).join(' ');

		if (!name.endsWith('.versatiles')) continue;
		if (!Number.isFinite(size)) continue;

		const mtime = new Date(`${date}T${time}${formatTz(tz)}`);
		if (Number.isNaN(mtime.getTime())) continue;

		const fullPath = `${currentDir}/${name}`;
		const relPath = fullPath.startsWith(rootDir + '/') ? fullPath.slice(rootDir.length + 1) : fullPath;

		files.push({ path: relPath, size, mtime });
	}

	return files;
}

/** "+0000" → "+00:00" (the form `Date` accepts). */
function formatTz(tz: string): string {
	const m = /^([+-])(\d{2})(\d{2})$/.exec(tz);
	if (!m) return tz;
	return `${m[1]}${m[2]}:${m[3]}`;
}
