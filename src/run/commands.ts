/**
 * Remote-storage plumbing for the run script: required-CLI check + SSH/SCP wrappers.
 *
 * GDAL and versatiles wrappers live in `src/lib/gdal.ts` and `src/lib/versatiles.ts`
 * — they're consumed by region scrapers via `src/regions/lib.ts`.
 */

import { runCommand } from '../lib/command.ts';
import { getConfig } from '../config.ts';

/** Required CLI tools */
const REQUIRED_COMMANDS = ['7z', 'curl', 'gdal_translate', 'gdalbuildvrt', 'ssh', 'unzip', 'versatiles'];

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
 * The remote command always exits 0 on a working connection; the answer is
 * carried in stdout (`yes`/`no`). This is more robust than dispatching on the
 * exit code, where many non-zero values (permission denied, noisy shell init,
 * exotic remote shells) would otherwise be misread as "file does not exist".
 *
 * Throws with diagnostics if:
 *   - the SSH connection itself fails (exit 255)
 *   - the remote command fails for some other reason (stderr is included)
 *   - the response is neither `yes` nor `no` (full stdout is included)
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
	const remoteCmd = `if [ -f '${escaped}' ]; then echo yes; else echo no; fi`;

	let stdoutText: string;
	try {
		const result = await runCommand('ssh', [...sshArgs, host, remoteCmd], {
			stdout: 'piped',
			stderr: 'piped',
		});
		stdoutText = new TextDecoder().decode(result.stdout);
	} catch (err) {
		// runCommand throws on any non-zero exit. Distinguish:
		//   - 255: ssh-side failure (DNS, auth, network, host key)
		//   - anything else: the remote command itself failed; surface stderr via the cause chain
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes('Exit code: 255')) {
			throw new Error(`Cannot reach remote server to check ${remotePath}`, { cause: err });
		}
		throw new Error(`Remote existence check failed for ${remotePath}`, { cause: err });
	}

	// Tolerate banner/motd noise on stdout — only the last non-empty line matters.
	const lines = stdoutText
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean);
	const verdict = lines[lines.length - 1];
	if (verdict === 'yes') return true;
	if (verdict === 'no') return false;
	throw new Error(
		`Unexpected response from remote existence check of ${remotePath}.\nstdout: ${JSON.stringify(stdoutText)}`,
	);
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
