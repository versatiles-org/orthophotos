/**
 * External command execution utilities for the run script.
 */

import { requireRsyncConfig } from '../config.ts';
import { runCommand } from '../lib/command.ts';

/** Required CLI tools (excluding yq which is replaced by native YAML parsing) */
const REQUIRED_COMMANDS = [
	'7z',
	'curl',
	'gdal_translate',
	'gdalbuildvrt',
	'gdalwarp',
	'htmlq',
	'jq',
	'parallel',
	'unzip',
	'versatiles',
	'wget',
	'xmlstarlet',
];

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
 */
export async function runBashScript(
	scriptPath: string,
	env: { DATA: string; TEMP: string; PROJ: string },
	cwd: string,
): Promise<void> {
	await runCommand('bash', ['-c', scriptPath], { cwd, env });
}

/**
 * Runs gdalwarp to create a preview image.
 */
export async function runGdalwarp(
	inputPath: string,
	outputPath: string,
	tempDir: string,
): Promise<void> {
	const args = [
		'-tr',
		'200',
		'200',
		'-r',
		'nearest',
		'-overwrite',
		'-multi',
		'-wo',
		'NUM_THREADS=4',
		'-co',
		'COMPRESS=ZSTD',
		'-co',
		'PREDICTOR=2',
		inputPath,
		outputPath,
	];
	await runCommand('gdalwarp', args, { cwd: tempDir });
}

/**
 * Runs versatiles convert with a .vpl pipeline file.
 */
export async function runVersatiles(
	vplPath: string,
	outputPath: string,
	cwd?: string,
): Promise<void> {
	const args = ['convert', vplPath, outputPath];
	await runCommand('versatiles', args, { cwd });
}
