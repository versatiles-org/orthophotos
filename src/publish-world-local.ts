#!/usr/bin/env node

/**
 * Syncs all source .versatiles files from remote to local, generates a local VPL,
 * and converts it to a .versatiles container streamed directly to remote storage.
 */

import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.ts';
import { runCommand } from './lib/command.ts';
import { safeRm } from './lib/fs.ts';
import { runScpUpload, runSshCommand } from './run/commands.ts';
import { generateVPL } from './server/vpl.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(__dirname, '../.publish');
const vplFilename = 'satellite.vpl';

const config = getConfig();
if (!config.ssh) {
	throw new Error('SSH configuration is required for publishing. Check config.env.');
}

const { host, port, keyFile, dir } = config.ssh;
const localDir = resolve(config.dirData, 'publish');
mkdirSync(resolve(localDir, 'satellite/s2gm/'), { recursive: true });
mkdirSync(resolve(localDir, 'satellite/bluemarble/'), { recursive: true });

// Build rsync SSH transport command
const sshCmd = ['ssh'];
if (port) sshCmd.push('-p', port);
if (keyFile) sshCmd.push('-i', keyFile);
const sshArg = sshCmd.join(' ');

// Sync orthophoto .versatiles files from remote
console.log('Syncing orthophoto sources...');
await runCommand('rsync', [
	'-az',
	'--progress',
	'-e',
	sshArg,
	`${host}:${dir}/`,
	resolve(localDir, 'regions/'),
	'--include=*/',
	'--include=*.versatiles',
	'--exclude=*',
]);

// Sync satellite base layers
console.log('Syncing satellite base layers...');
await runCommand('rsync', [
	'-az',
	'--progress',
	'-e',
	sshArg,
	`${host}:/home/satellite/s2gm/s2gm_overview.versatiles`,
	resolve(localDir, 'satellite/s2gm/'),
]);

// Sync satellite base layers
console.log('Syncing satellite base layers...');
await runCommand('rsync', [
	'-az',
	'--progress',
	'-e',
	sshArg,
	`${host}:/home/satellite/bluemarble/bluemarble.versatiles`,
	resolve(localDir, 'satellite/bluemarble/'),
]);

// Generate VPL with local file paths
generateVPL(outputDir, vplFilename, { localDir });

// Convert locally
const vplPath = resolve(outputDir, vplFilename);
const localOutput = resolve(localDir, 'satellite.versatiles');
const tmpLocalOutput = resolve(localDir, '.tmp.satellite.versatiles');

console.log('Converting VPL to .versatiles container...');
try {
	await runCommand('versatiles', ['convert', vplPath, tmpLocalOutput]);
	const { renameSync } = await import('node:fs');
	renameSync(tmpLocalOutput, localOutput);
} catch (err) {
	safeRm(tmpLocalOutput);
	throw err;
}

// Upload to remote
const remotePath = '/home/incoming/satellite.versatiles';
const tmpRemotePath = '/home/incoming/.tmp.satellite.versatiles';

console.log(`Uploading to ${remotePath}...`);
try {
	await runScpUpload(localOutput, tmpRemotePath);
	await runSshCommand(`mv '${tmpRemotePath}' '${remotePath}'`);
	console.log('Done.');
} catch (err) {
	try {
		await runSshCommand(`rm -f '${tmpRemotePath}'`);
	} catch {}
	throw err;
}
