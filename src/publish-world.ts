#!/usr/bin/env node

/**
 * Generates the VPL file and converts it to a .versatiles container,
 * streaming the output directly to remote storage via SFTP.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.ts';
import { runCommand } from './lib/command.ts';
import { runSshCommand } from './run/commands.ts';
import { generateVPL } from './server/vpl.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(__dirname, '../.publish');
const vplFilename = 'satellite.vpl';

const config = getConfig();
if (!config.ssh) {
	throw new Error('SSH configuration is required for publishing. Check config.env.');
}

generateVPL(outputDir, vplFilename);

const vplPath = resolve(outputDir, vplFilename);
const { host, port, keyFile } = config.ssh;
const remotePath = '/home/incoming/satellite.versatiles';
const tmpRemotePath = '/home/incoming/.tmp.satellite.versatiles';
const sftpTmpUrl = `sftp://${host}:${port ?? ''}${tmpRemotePath}`;

const args = ['convert'];
if (keyFile) {
	args.push('--ssh-identity', keyFile);
}
args.push(vplPath, sftpTmpUrl);

console.log(`Publishing to ${remotePath}...`);
try {
	await runCommand('versatiles', args);
	await runSshCommand(`mv '${tmpRemotePath}' '${remotePath}'`);
	console.log('Done.');
} catch (err) {
	try {
		await runSshCommand(`rm -f '${tmpRemotePath}'`);
	} catch {}
	throw err;
}
