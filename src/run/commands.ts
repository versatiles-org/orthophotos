/**
 * External command execution utilities for the run script.
 */

import { renameSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { runCommand } from '../lib/command.ts';
import { safeRm } from '../lib/fs.ts';
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

/**
 * Returns true if a file exists on the remote server, false if it does not.
 * Throws if the SSH connection itself fails (so the caller can surface a real
 * connectivity issue rather than silently treat it as "file is missing").
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
		await runCommand('ssh', [...sshArgs, host, `test -f '${escaped}'`], { quiet: true, quietOnError: true });
		return true;
	} catch (err) {
		// ssh itself uses exit code 255 for connection/auth failures; other codes come
		// from the remote command (e.g. `test -f` exits 1 when the file is absent).
		if (err instanceof Error && err.message.includes('Exit code: 255')) {
			throw new Error(`Cannot reach remote server to check ${remotePath}`);
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

import { QUALITY } from '../lib/constants.ts';

/**
 * Verifies that command output contains the expected success marker.
 */
function assertOutputContains(result: { stderr: Uint8Array }, marker: string, context: string): void {
	const stderr = new TextDecoder().decode(result.stderr);
	if (!stderr.includes(marker)) {
		throw new Error(`${context}: expected "${marker}" in output but got:\n${stderr.trim()}`);
	}
}

/**
 * Runs `versatiles mosaic tile` to tile a single raster image into a .versatiles container.
 */
export async function runMosaicTile(
	input: string,
	output: string,
	options?: { bands?: string; nodata?: string; crs?: string; cacheDirectory?: string },
): Promise<void> {
	// Omit --max-zoom so versatiles auto-detects the base zoom from the source's
	// ground resolution. A fixed ceiling would throw away detail on high-res sources
	// (e.g. 15cm JP2s) and over-tile low-res ones.
	const args = ['mosaic', 'tile', '--quality', QUALITY];
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
	const tmpOutput = join(dirname(output), `.tmp.${basename(output)}`);
	args.push(input, tmpOutput);
	try {
		const result = await runCommand('versatiles', args, { quiet: true });
		assertOutputContains(result, 'finished mosaic tile', `runMosaicTile for "${input}"`);
		renameSync(tmpOutput, output);
	} catch (cause) {
		safeRm(tmpOutput);
		throw new Error(`runMosaicTile failed for "${input}"`, { cause });
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
	// No --max-zoom: include every zoom level present in the inputs.
	const args = ['mosaic', 'assemble', '--max-buffer-size', '50%', '--quality', QUALITY];
	if (options?.lossless) {
		args.push('--lossless');
	}
	args.push(`@${filelistPath}`, output);
	const result = await runCommand('versatiles', args, { quiet: options?.quiet, quietOnError: options?.quietOnError });
	assertOutputContains(result, 'finished mosaic assemble', `runMosaicAssemble for "${filelistPath}"`);
}

export interface TiledTiffOptions {
	/** Expand palette to rgb or rgba (e.g., for paletted PNGs) */
	expand?: 'rgb' | 'rgba';
	/** Assign SRS (e.g., 'EPSG:3857') */
	srs?: string;
	/** Assign upper-left / lower-right corners [ulx, uly, lrx, lry] */
	ullr?: [number, number, number, number];
}

/**
 * Converts a raster file to a tiled, compressed GeoTIFF optimized for fast random access.
 * Uses DEFLATE compression with predictor, BIGTIFF and ALPHA support.
 */
export async function convertToTiledTiff(input: string, output: string, options?: TiledTiffOptions): Promise<void> {
	const args = ['-q', '-of', 'GTiff'];
	if (options?.expand) args.push('-expand', options.expand);
	if (options?.srs) args.push('-a_srs', options.srs);
	if (options?.ullr) args.push('-a_ullr', ...options.ullr.map(String));
	args.push(
		'-co',
		'COMPRESS=DEFLATE',
		'-co',
		'PREDICTOR=2',
		'-co',
		'TILED=YES',
		'-co',
		'BIGTIFF=YES',
		'-co',
		'ALPHA=YES',
	);
	args.push(input, output);
	await runCommand('gdal_translate', args);
}

export interface WmsBlockExtractOptions {
	/** WMS XML config file path */
	wmsXmlPath: string;
	/** Block bounds in EPSG:3857 */
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	/** Output pixel size */
	blockPx: number;
}

/**
 * Extracts a block from a WMS source as a tiled, compressed GeoTIFF with alpha.
 */
export async function extractWmsBlock(options: WmsBlockExtractOptions, output: string): Promise<void> {
	await runCommand('gdal_translate', [
		'-q',
		options.wmsXmlPath,
		output,
		'-projwin',
		String(options.x0),
		String(options.y1),
		String(options.x1),
		String(options.y0),
		'-projwin_srs',
		'EPSG:3857',
		'-outsize',
		String(options.blockPx),
		String(options.blockPx),
		'-of',
		'GTiff',
		'-co',
		'COMPRESS=DEFLATE',
		'-co',
		'PREDICTOR=2',
		'-co',
		'ALPHA=YES',
	]);
}
