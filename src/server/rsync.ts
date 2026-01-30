import { resolve } from '@std/path';
import { ensureDir } from '@std/fs';
import { getDataDir, requireRsyncConfig } from '../config.ts';
import { withRetry } from '../retry.ts';

export async function downloadOrthophotos() {
	await rsync('orthophoto', 'orthophotos');
}

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

	await withRetry(async () => {
		const command = new Deno.Command('rsync', { args, stdout: 'inherit', stderr: 'inherit' });
		const output = await command.output();
		if (!output.success) {
			throw new Error(`rsync exited with code ${output.code}`);
		}
	});
}
