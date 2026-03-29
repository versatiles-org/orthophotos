#!/usr/bin/env node

/**
 * Generates the VPL file and converts it to a .versatiles container,
 * streaming the output directly to remote storage via SFTP.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.ts';
import { runCommand } from './lib/command.ts';
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
const sftpUrl = `sftp://${host}:${port ?? ''}/home/incoming/satellite.versatiles`;

const args = ['convert'];
if (keyFile) {
	args.push('--ssh-identity', keyFile);
}
args.push(vplPath, sftpUrl);

console.log(`Publishing to ${sftpUrl}...`);
await runCommand('versatiles', args);
console.log('Done.');
