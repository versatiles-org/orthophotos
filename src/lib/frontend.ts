import { resolve } from "@std/path";
import { move } from "@std/fs/move";
import { existsSync } from "@std/fs/exists";

export async function downloadFrontend() {
	const path = resolve(Deno.env.get('dir_data')!);
	const filename = resolve(path, 'frontend-dev.br.tar.gz');
	const command = new Deno.Command('curl', {
		args: [
			'-L',
			'-o', filename + '.tmp',
			'-z', filename,
			'https://github.com/versatiles-org/versatiles-frontend/releases/latest/download/frontend-dev.br.tar.gz'
		], stdout: 'inherit', stderr: 'inherit'
	});
	await command.output();

	if (existsSync(filename + '.tmp')) move(filename + '.tmp', filename, { overwrite: true });
}