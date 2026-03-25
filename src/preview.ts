#!/usr/bin/env node

/**
 * Downloads the frontend, generates the VPL file, and starts the preview server.
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.ts';
import { runCommand } from './lib/command.ts';
import { downloadFrontend } from './server/frontend.ts';
import { generateVPL } from './server/vpl.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const config = getConfig();
const vplFilename = 'orthophotos.vpl';

await downloadFrontend();
generateVPL(vplFilename, true);

const vplPath = resolve(config.dirData, vplFilename);
const frontendPath = resolve(config.dirData, 'frontend.br.tar.gz');
const webDir = resolve(__dirname, '../web');

const args = ['serve', '-p', '8080', '-s', webDir, '-s', frontendPath, `[satellite]${vplPath}`];
if (config.ssh?.keyFile) {
	args.push('--ssh-identity', config.ssh.keyFile);
}

console.log('Starting preview server on port 8080...');
await runCommand('versatiles', args);
