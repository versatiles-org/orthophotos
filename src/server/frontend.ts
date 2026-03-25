import { resolve } from 'node:path';
import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { runCommandWithRetry } from '../lib/command.ts';

/**
 * Downloads the VersaTiles frontend archive from GitHub releases.
 * Skips download if the archive already exists.
 * @param targetDir - Directory to download the frontend into
 */
export async function downloadFrontend(targetDir: string) {
	mkdirSync(targetDir, { recursive: true });
	const filename = resolve(targetDir, 'frontend.br.tar.gz');
	if (existsSync(filename)) {
		console.log('Frontend archive already exists, skipping download.');
		return;
	}

	console.log('Downloading frontend archive...');
	await runCommandWithRetry('curl', [
		'-L',
		'-o',
		filename + '.tmp',
		'-z',
		filename,
		'https://github.com/versatiles-org/versatiles-frontend/releases/latest/download/frontend.br.tar.gz',
	]);

	if (existsSync(filename + '.tmp')) {
		renameSync(filename + '.tmp', filename);
	}
}
