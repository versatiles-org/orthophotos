/**
 * Reads size and tile counts of every region file on the remote and writes
 * `data/region-stats.json` for the status page (`npm run build:status`).
 *
 * `versatiles probe` reads only the container header over sftp, about 4 s per file.
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig, listRemoteVersatilesFiles, runCommand } from './lib/index.ts';
import { getAllRegionMetadata } from './regions/index.ts';
import { parseProbePyramid, summarizeStats, type RegionStatsFile } from './status/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(__dirname, '../data/region-stats.json');

const ssh = getConfig().ssh;
if (!ssh) throw new Error('SSH configuration is required for reading the remote files. Check config.env.');

const regionIds = new Set(getAllRegionMetadata().keys());

console.log('Listing remote .versatiles files...');
const files = (await listRemoteVersatilesFiles())
	.map((f) => ({ ...f, id: f.path.replace(/\.versatiles$/, '') }))
	.filter((f) => regionIds.has(f.id))
	.sort((a, b) => a.id.localeCompare(b.id));
console.log(`Found ${files.length} region files.`);

const stats: RegionStatsFile = { generated: new Date().toISOString().slice(0, 10), regions: {} };
for (const file of files) {
	const path = `/${ssh.dir}/${file.path}`.replace(/\/\/+/g, '/');
	const url = `sftp://${ssh.host}:${ssh.port ?? ''}${path}`;
	const args = ['probe', ...(ssh.keyFile ? ['--ssh-identity', ssh.keyFile] : []), url];
	// `versatiles probe` prints its report to stderr.
	const { stderr } = await runCommand('versatiles', args, { stdout: 'piped', stderr: 'piped', quietOnError: true });
	const region = summarizeStats(file.size, parseProbePyramid(new TextDecoder().decode(stderr)));
	stats.regions[file.id] = region;
	console.log(`  ${file.id}: ${(region.size / 1e6).toFixed(0)} MB, ${region.tiles} tiles, z${region.maxZoom}`);
}

writeFileSync(OUTPUT, JSON.stringify(stats, null, '\t') + '\n');
console.log(`Wrote stats of ${files.length} regions to data/region-stats.json`);
