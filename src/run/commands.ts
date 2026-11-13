/**
 * Remote-storage plumbing for the run script: required-CLI check + SSH/SCP wrappers.
 *
 * GDAL and versatiles wrappers live in `src/lib/gdal.ts` and `src/lib/versatiles.ts`
 * — they're consumed by region scrapers via `src/lib/region-api.ts`.
 */

import { statSync } from 'node:fs';
import { createProgress, runCommand } from '../lib/index.ts';
import { getConfig } from '../lib/index.ts';

/** Required CLI tools */
const REQUIRED_COMMANDS = ['7z', 'curl', 'gdal_translate', 'gdalbuildvrt', 'ssh', 'unzip', 'versatiles'];

/** `versatiles mosaic` subcommands the scrapers depend on. Both must be present. */
const REQUIRED_VERSATILES_MOSAIC_SUBCOMMANDS = ['tile', 'assemble'];

/**
 * Checks if a command is available in PATH.
 */
async function commandExists(cmd: string): Promise<boolean> {
	try {
		await runCommand('which', [cmd], { stdout: 'null', stderr: 'null' });
		return true;
	} catch {
		return false;
	}
}

/**
 * Returns the list of subcommands `versatiles mosaic --help` advertises, or
 * throws if the help text can't be parsed. Used to detect installs where the
 * binary exists but a subcommand was added or removed (e.g. v4.0.0 briefly
 * shipped without `mosaic tile`).
 */
async function listVersatilesMosaicSubcommands(): Promise<string[]> {
	const result = await runCommand('versatiles', ['mosaic', '--help'], {
		stdout: 'piped',
		stderr: 'piped',
		quietOnError: true,
	});
	const text = Buffer.from(result.stdout).toString('utf-8');
	// Help block we parse:
	//   Commands:
	//     tile      Tile a georeferenced raster ...
	//     assemble  Combine many tile containers ...
	// The outer regex deliberately omits the `m` flag — with `m`, `$` matches
	// end-of-line and the lazy capture stops at the first command instead of
	// running to the blank line / `Options:` section that ends the block.
	const match = /Commands:\n([\s\S]*?)(?:\n\n|\nOptions:|$)/.exec(text);
	if (!match) throw new Error(`Could not parse 'versatiles mosaic --help' output:\n${text}`);
	return [...match[1].matchAll(/^\s{2,}([a-z][a-z0-9_-]*)\b/gm)].map((m) => m[1]);
}

/**
 * Checks that all required CLI tools are available.
 * Throws an error with a list of missing commands if any are not found.
 */
export async function checkRequiredCommands(): Promise<void> {
	const missing: string[] = [];

	for (const cmd of REQUIRED_COMMANDS) {
		if (!(await commandExists(cmd))) {
			missing.push(cmd);
		}
	}

	if (missing.length > 0) {
		const list = missing.map((cmd) => `  - ${cmd}`).join('\n');
		throw new Error(`Missing required commands:\n${list}`);
	}

	// `versatiles` is on PATH; confirm every `versatiles mosaic` subcommand we
	// depend on is actually compiled in. The 4.0.0 release line dropped and then
	// re-added `mosaic tile`, so a binary on PATH is no longer sufficient proof.
	const subcommands = await listVersatilesMosaicSubcommands();
	const missingSubs = REQUIRED_VERSATILES_MOSAIC_SUBCOMMANDS.filter((s) => !subcommands.includes(s));
	if (missingSubs.length > 0) {
		throw new Error(
			`'versatiles mosaic' is missing required subcommand${missingSubs.length === 1 ? '' : 's'}: ${missingSubs.join(', ')}. ` +
				`Installed binary advertises: [${subcommands.join(', ')}]. Upgrade the versatiles CLI.`,
		);
	}
}

/**
 * Runs a command on the remote server via SSH.
 */
export async function runSshCommand(command: string): Promise<void> {
	const sshConfig = getConfig().ssh;
	if (!sshConfig) {
		throw new Error('SSH configuration is missing');
	}
	const { host, port, keyFile } = sshConfig;
	const sshArgs = [];
	if (port) sshArgs.push('-p', port);
	if (keyFile) sshArgs.push('-i', keyFile);
	await runCommand('ssh', [...sshArgs, host, command]);
}

/**
 * Returns true if a file exists on the remote server, false if it does not.
 *
 * Uses `ls` rather than `test -f` because restricted shells (e.g. Hetzner
 * Storage Box) don't ship a `test` builtin and reject anything beyond a small
 * whitelist of file commands. `ls` is supported on both standard POSIX shells
 * and on those restricted environments.
 *
 * Convention:
 *   - `ls` exits 0  → path is listable → file exists → return true
 *   - `ls` exits ≠0 → path is not listable → return false
 *   - ssh exits 255 → connection / auth / DNS failure → throw, with the
 *     original stderr available via `cause`
 *
 * For "permission denied" or other access problems we err on the side of
 * `false` (re-upload) rather than throwing, since misclassifying as "missing"
 * just causes a re-merge — much milder than aborting the whole pipeline.
 */
export async function remoteFileExists(remotePath: string): Promise<boolean> {
	const sshConfig = getConfig().ssh;
	if (!sshConfig) {
		throw new Error('SSH configuration is missing');
	}
	const { host, port, keyFile } = sshConfig;
	const sshArgs: string[] = ['-o', 'ConnectTimeout=10'];
	if (port) sshArgs.push('-p', port);
	if (keyFile) sshArgs.push('-i', keyFile);
	const escaped = remotePath.replace(/'/g, `'\\''`);

	try {
		await runCommand('ssh', [...sshArgs, host, `ls '${escaped}'`], {
			stdout: 'piped',
			stderr: 'piped',
			quietOnError: true,
		});
		return true;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes('Exit code: 255')) {
			throw new Error(`Cannot reach remote server to check ${remotePath}`, { cause: err });
		}
		return false;
	}
}

/**
 * Size in bytes of a remote file, from `ls -l` (the Storage Box has no `stat`), or `undefined`
 * if it can't be listed, e.g. because scp hasn't created it yet.
 */
export async function remoteFileSize(remotePath: string): Promise<number | undefined> {
	const sshConfig = getConfig().ssh;
	if (!sshConfig) {
		throw new Error('SSH configuration is missing');
	}
	const { host, port, keyFile } = sshConfig;
	const sshArgs: string[] = ['-o', 'ConnectTimeout=10'];
	if (port) sshArgs.push('-p', port);
	if (keyFile) sshArgs.push('-i', keyFile);
	const escaped = remotePath.replace(/'/g, `'\\''`);
	try {
		const { stdout } = await runCommand('ssh', [...sshArgs, host, `ls -l '${escaped}'`], {
			stdout: 'piped',
			stderr: 'piped',
			quietOnError: true,
		});
		// -rw-r--r-- 1 user group 398731465 Aug 20  2025 /path
		const size = Number(new TextDecoder().decode(stdout).trim().split(/\s+/)[4]);
		return Number.isFinite(size) ? size : undefined;
	} catch {
		return undefined;
	}
}

/** How often the upload progress asks the remote for the size of the file so far. */
const UPLOAD_POLL_MS = 5000;

const MIB = 1024 * 1024;

/**
 * Uploads a file with scp and shows a progress bar in MiB. scp shows its own progress meter only
 * when its output is a terminal, which it isn't under `runCommand`, so the bar follows the size of
 * the remote file instead.
 */
export async function runScpUpload(localPath: string, remotePath: string): Promise<void> {
	const sshConfig = getConfig().ssh;
	if (!sshConfig) {
		throw new Error('SSH configuration is missing');
	}
	const { host, port, keyFile } = sshConfig;
	const scpArgs = [];
	if (port) scpArgs.push('-P', port);
	if (keyFile) scpArgs.push('-i', keyFile);

	const totalMiB = Math.ceil(statSync(localPath).size / MIB);
	const progress = createProgress(totalMiB, { labels: ['MiB uploaded'], logInterval: 1024 });
	let reportedMiB = 0;
	let finished = false;
	function report(mib: number): void {
		const next = Math.min(mib, totalMiB);
		if (finished || next <= reportedMiB) return;
		progress.tick('MiB uploaded', next - reportedMiB);
		reportedMiB = next;
	}

	let polling = false;
	const timer = setInterval(() => {
		if (polling) return;
		polling = true;
		remoteFileSize(remotePath)
			.then((size) => {
				if (size !== undefined) report(Math.floor(size / MIB));
			})
			// A failed check only skips one update of the bar; scp reports real failures.
			.catch(() => {})
			.finally(() => {
				polling = false;
			});
	}, UPLOAD_POLL_MS);

	try {
		await runCommand('scp', [...scpArgs, localPath, `${host}:${remotePath}`]);
		report(totalMiB);
	} finally {
		clearInterval(timer);
		finished = true;
		progress.done();
	}
}
