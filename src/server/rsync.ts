import { resolve } from '@std/path';
import { ensureDir } from '@std/fs';
import { getDataDir, requireRsyncConfig } from '../config.ts';
import { runCommandWithRetry } from '../lib/command.ts';

/**
 * Downloads orthophoto VersaTiles containers from the remote server.
 * Uses rsync with retry logic for resilience.
 */
export async function downloadOrthophotos() {
	await rsync('orthophoto', 'orthophotos');
}

/**
 * Downloads satellite imagery VersaTiles containers from the remote server.
 * Includes S2GM and Blue Marble data.
 */
export async function downloadSatellite() {
	await rsync('satellite', 'satellite');
}

async function rsync(srcDir: string, dstDir: string) {
	const { host, port, id } = requireRsyncConfig();
	const src = `${host}:${srcDir}/`;
	const dst = resolve(getDataDir(), dstDir + '/');
	await ensureDir(dst);

	const args = [
		'-avhtW',
		'-e',
		`ssh -p ${port} -i ${id} -o StrictHostKeyChecking=no`,
		'--info=progress',
		//'--delete',
		'--prune-empty-dirs',
		'--include',
		'*/',
		'--exclude',
		'**/s2gm_original.versatiles',
		'--include',
		'*.versatiles',
		'--exclude',
		'*',
		src,
		dst,
	];

	await runCommandWithRetry('rsync', args);
}
