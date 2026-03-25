/**
 * External command execution utilities for the run script.
 */

import { renameSync, rmSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
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
 * Builds an sftp:// URL for remote storage.
 */
export function buildSftpUrl(host: string, port: string, remotePath: string): string {
	return `sftp://${host}:${port}/${remotePath}`;
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

import { MAX_ZOOM, QUALITY } from '../lib/constants.ts';

/**
 * Runs `versatiles mosaic tile` to tile a single raster image into a .versatiles container.
 */
export async function runMosaicTile(
	input: string,
	output: string,
	options?: { bands?: string; nodata?: string; crs?: string; cacheDirectory?: string },
): Promise<void> {
	const args = ['mosaic', 'tile', '--max-zoom', String(MAX_ZOOM), '--quality', QUALITY];
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
		await runCommand('versatiles', args, { quiet: true });
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
	options?: { lossless?: boolean; quiet?: boolean; quietOnError?: boolean },
): Promise<void> {
	const args = ['mosaic', 'assemble', '--prescan', '--max-zoom', String(MAX_ZOOM), '--quality', QUALITY];
	if (options?.lossless) {
		args.push('--lossless');
	}
	args.push(filelistPath, output);
	await runCommand('versatiles', args, { quiet: options?.quiet, quietOnError: options?.quietOnError });
}
