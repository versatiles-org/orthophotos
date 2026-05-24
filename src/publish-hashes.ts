#!/usr/bin/env node

/**
 * Ensures every published `.versatiles` file on the remote SSH host has matching
 * `.md5` and `.sha256` sidecar files. Computes any missing hashes on the remote
 * via SSH and uploads the sidecars via SCP. Already-hashed files are skipped,
 * so this is safe to re-run; pass `--force` to recompute everything.
 *
 * Covers both the region tiles under `ssh_dir` and the combined
 * `satellite.versatiles` produced by `publish:world`.
 */

import { ensureRemoteHashes, getConfig, listRemoteVersatilesFiles } from './lib/index.ts';

const SATELLITE_REMOTE_PATH = '/home/incoming/satellite.versatiles';

const config = getConfig();
if (!config.ssh) {
	throw new Error('SSH configuration is required for publishing hashes. Check config.env.');
}

const force = process.argv.includes('--force');

console.log('Listing remote .versatiles files...');
const remoteFiles = await listRemoteVersatilesFiles();
const remotePaths = remoteFiles.map((f) => `${config.ssh!.dir}/${f.path}`);
remotePaths.push(SATELLITE_REMOTE_PATH);

console.log(`Found ${remotePaths.length} file(s) to hash${force ? ' (force recompute)' : ''}.`);
const stats = await ensureRemoteHashes(remotePaths, { force });
console.log(`Done. ${stats.computed} computed, ${stats.skipped} already present.`);
