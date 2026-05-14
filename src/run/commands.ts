/**
 * Remote-storage plumbing for the run script: required-CLI check + SSH/SCP wrappers.
 *
 * GDAL and versatiles wrappers live in `src/lib/gdal.ts` and `src/lib/versatiles.ts`
 * — they're consumed by region scrapers via `src/lib/region-api.ts`.
 */

import { runCommand } from '../lib/index.ts';
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

export async function runScpUpload(localPath: string, remotePath: string): Promise<void> {
	const sshConfig = getConfig().ssh;
	if (!sshConfig) {
		throw new Error('SSH configuration is missing');
	}
	const { host, port, keyFile } = sshConfig;
	const scpArgs = [];
	if (port) scpArgs.push('-P', port);
	if (keyFile) scpArgs.push('-i', keyFile);
	await runCommand('scp', [...scpArgs, localPath, `${host}:${remotePath}`]);
}
