import { resolve } from '@std/path';
import { ensureDir } from '@std/fs';

export async function downloadOrthophotos() {
	await rsync('orthophoto', 'orthophotos');
}

export async function downloadSatellite() {
	await rsync('satellite', 'satellite');
}

async function rsync(srcDir: string, dstDir: string) {
	const rsync_host = Deno.env.get('rsync_host')!;
	const rsync_port = Deno.env.get('rsync_port')!;
	const rsync_id = Deno.env.get('rsync_id')!;
	const src = `${rsync_host}:${srcDir}/`;
	const dst = resolve(Deno.env.get('dir_data')!, dstDir+'/');
	await ensureDir(dst);

	const args = [
		'-avht',
		'-e', `ssh -p ${rsync_port} -i ${rsync_id} -o StrictHostKeyChecking=no`,
		'--info=progress',
		//'--delete',
		'--prune-empty-dirs',
		'--include', '*/',
		'--exclude', '**/s2gm_original.versatiles',
		'--include', '*.versatiles',
		'--exclude', '*',
		src,
		dst
	]

	const command = new Deno.Command('rsync', { args, stdout: 'inherit', stderr: 'inherit' });
	await command.output();
}