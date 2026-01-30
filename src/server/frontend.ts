import { resolve } from '@std/path';
import { move } from '@std/fs/move';
import { existsSync } from '@std/fs/exists';
import { getDataDir } from '../config.ts';
import { withRetry } from '../retry.ts';

/**
 * Downloads the VersaTiles frontend archive from GitHub releases.
 * Skips download if the archive already exists.
 * Uses retry logic for resilience against transient network failures.
 */
export async function downloadFrontend() {
	const path = resolve(getDataDir());
	const filename = resolve(path, 'frontend-dev.br.tar.gz');
	if (existsSync(filename)) {
		console.log('Frontend archive already exists, skipping download.');
		return;
	}

	console.log('Downloading frontend archive...');
	await withRetry(async () => {
		const command = new Deno.Command('curl', {
			args: [
				'-L',
				'-o',
				filename + '.tmp',
				'-z',
				filename,
				'https://github.com/versatiles-org/versatiles-frontend/releases/latest/download/frontend-dev.br.tar.gz',
			],
			stdout: 'inherit',
			stderr: 'inherit',
		});
		const output = await command.output();
		if (!output.success) {
			throw new Error(`curl exited with code ${output.code}`);
		}
	});

	if (existsSync(filename + '.tmp')) {
		move(filename + '.tmp', filename, { overwrite: true });
	}
}
