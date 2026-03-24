/**
 * External command execution utilities for the run script.
 */

import { spawn } from 'node:child_process';
import { renameSync, rmSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { runCommand } from '../lib/command.ts';

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
 * Builds an sftp:// URL for remote storage.
 */
export function buildSftpUrl(host: string, port: string, remotePath: string): string {
	return `sftp://${host}:${port}/${remotePath}`;
}

/**
 * Runs a command on the remote server via SSH.
 */
export async function runSshCommand(host: string, port: string, keyFile: string, command: string): Promise<void> {
	await runCommand('ssh', ['-p', port, '-i', keyFile, host, command]);
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

const MAX_ZOOM = '17';
const QUALITY = '70,16:50,17:30';

/**
 * Runs `versatiles mosaic tile` to tile a single raster image into a .versatiles container.
 */
export async function runMosaicTile(
	input: string,
	output: string,
	options?: { bands?: string; nodata?: string; crs?: string; cacheDirectory?: string },
): Promise<void> {
	const args = ['mosaic', 'tile', '--max-zoom', MAX_ZOOM, '--quality', QUALITY];
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
 * Runs `versatiles mosaic assemble` to assemble multiple tile containers into one.
 */
export async function runMosaicAssemble(
	filelistPath: string,
	output: string,
	options?: { lossless?: boolean },
): Promise<void> {
	const args = ['mosaic', 'assemble', '--prescan', '--max-zoom', MAX_ZOOM, '--quality', QUALITY];
	if (options?.lossless) {
		args.push('--lossless');
	}
	args.push(filelistPath, output);
	await runCommand('versatiles', args);
}
