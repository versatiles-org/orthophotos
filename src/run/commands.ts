/**
 * External command execution utilities for the run script.
 */

import { spawn } from 'node:child_process';
import { renameSync, rmSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { requireRsyncConfig } from '../config.ts';
import { runCommand } from '../lib/command.ts';

/** Required CLI tools (excluding yq which is replaced by native YAML parsing) */
const REQUIRED_COMMANDS = ['curl', 'gdal_translate', 'unzip', 'versatiles', 'wget'];

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
 * Runs rsync to download data from the remote server.
 */
export async function runRsyncDownload(remotePath: string, localPath: string): Promise<void> {
	const { host, port, id } = requireRsyncConfig();
	const args = [
		'-ahtW',
		'-e',
		`ssh -p ${port} -i ${id}`,
		'--info=progress2',
		`${host}:orthophoto/${remotePath}/`,
		`${localPath}/`,
	];
	await runCommand('rsync', args);
}

/**
 * Runs rsync to upload data to the remote server.
 * Excludes tiles/ and tiles_{*}/ directories.
 */
export async function runRsyncUpload(localPath: string, remotePath: string): Promise<void> {
	const { host, port, id } = requireRsyncConfig();
	const args = [
		'-ahtW',
		'-e',
		`ssh -p ${port} -i ${id}`,
		'--info=progress2',
		'--exclude=tiles/',
		'--exclude=tiles_*/',
		`${localPath}/`,
		`${host}:orthophoto/${remotePath}/`,
	];
	await runCommand('rsync', args);
}

/**
 * Runs a bash script with the specified environment variables.
 * When capture is true, stdout/stderr are piped and returned instead of inherited.
 */
export async function runBashScript(
	scriptPath: string,
	env: { DATA: string; TEMP: string; PROJ: string },
	cwd: string,
	options?: { capture?: boolean },
): Promise<{ stdout: string; stderr: string }> {
	const result = await runCommand('bash', ['-c', scriptPath], {
		cwd,
		env,
		stdout: options?.capture ? 'piped' : undefined,
		stderr: options?.capture ? 'piped' : undefined,
	});
	return {
		stdout: new TextDecoder().decode(result.stdout),
		stderr: new TextDecoder().decode(result.stderr),
	};
}

/**
 * Runs a command with stdout/stderr suppressed. On failure, prints captured output before throwing.
 */
async function runCommandQuiet(cmd: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: ['inherit', 'pipe', 'pipe'] });

		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];

		child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
		child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

		child.on('error', reject);

		child.on('close', (code) => {
			if (code === 0) {
				resolve();
			} else {
				const stdout = Buffer.concat(stdoutChunks).toString();
				const stderr = Buffer.concat(stderrChunks).toString();
				if (stdout) process.stdout.write(stdout);
				if (stderr) process.stderr.write(stderr);
				reject(new Error(`Command "${cmd}" exited with code ${code}`));
			}
		});
	});
}

/**
 * Runs `versatiles raster convert` to convert a single raster file to .versatiles format.
 */
export async function runVersatilesRasterConvert(
	input: string,
	output: string,
	options?: { maxZoom?: number; quality?: number },
): Promise<void> {
	const args = ['raster', 'convert'];
	if (options?.maxZoom != null) {
		args.push('--max-zoom', String(options.maxZoom));
	}
	if (options?.quality != null) {
		args.push('--quality', String(options.quality));
	}
	const tmpOutput = join(dirname(output), `tmp.${basename(output)}`);
	args.push(input, tmpOutput);
	try {
		await runCommandQuiet('versatiles', args);
		renameSync(tmpOutput, output);
	} catch (err) {
		try {
			rmSync(tmpOutput, { force: true });
		} catch {}
		throw err;
	}
}

/**
 * Runs `versatiles raster merge` to merge multiple .versatiles files into one.
 */
export async function runVersatilesRasterMerge(
	filelistPath: string,
	output: string,
	options?: { quality?: number },
): Promise<void> {
	const args = ['raster', 'merge'];
	if (options?.quality != null) {
		args.push('--quality', String(options.quality));
	}
	args.push(filelistPath, output);
	await runCommand('versatiles', args);
}
