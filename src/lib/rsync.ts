import { resolve } from '@std/path';
import { ensureDir } from '@std/fs';

export async function downloadOrthophotos() {
	const rsync_host = Deno.env.get('rsync_host')!;
	const rsync_port = Deno.env.get('rsync_port')!;
	const rsync_id = Deno.env.get('rsync_id')!;
	const src = `${rsync_host}:orthophoto/`;
	const dst = resolve(Deno.env.get('dir_data')!, 'orthophotos/');

	await ensureDir(dst);

	const args = [
		'-avht',
		'-e', `ssh -p ${rsync_port} -i ${rsync_id} -o StrictHostKeyChecking=no`,
		'--info=progress2',
		'--delete',
		'--prune-empty-dirs',
		'--include', '*/',
		'--include', '*.versatiles',
		'--exclude', '*',
		src,
		dst
	]

	const command = new Deno.Command('rsync', { args, stdout: 'inherit', stderr: 'inherit' });
	await command.output();
}