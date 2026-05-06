#!/usr/bin/env node

/**
 * Downloads the frontend, generates the VPL file, and starts the preview server.
 * Uses a local .preview/ directory for generated files (VPL, masks, frontend).
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig } from './config.ts';
import { runCommand } from './lib/index.ts';
import { downloadFrontend } from './server/index.ts';
import { generateVPL } from './server/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const previewDir = resolve(__dirname, '../.preview');
const vplFilename = 'satellite.vpl';

await downloadFrontend(previewDir);
generateVPL(previewDir, vplFilename, true);

const config = getConfig();
const vplPath = resolve(previewDir, vplFilename);
const frontendPath = resolve(previewDir, 'frontend.br.tar.gz');
const webDir = resolve(__dirname, '../web');

const args = ['serve', '-p', '8080', '-s', webDir, '-s', frontendPath, `[satellite]${vplPath}`];
if (config.ssh?.keyFile) {
	args.push('--ssh-identity', config.ssh.keyFile);
}

console.log('Starting preview server on port 8080...');
await runCommand('versatiles', args);
