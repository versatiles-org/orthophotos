import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { downloadFile, runCommand } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { isValidRaster } from '../lib/validators.ts';
import { runMosaicTile } from '../run/commands.ts';

const OPEN_ACCESS_URL = 'https://ac.ngi.be/catalogue/getopenaccess/ngi-standard-open';
const INDEX_PATH = 'ngi-standard-open/Rasterdata/Orthos/Y2024/JP2';

interface IndexEntry {
	name: string;
	url: string;
	size: number;
	type: string;
}

interface IndexResponse {
	children: IndexEntry[];
}

/**
 * Requests a session access code from the NGI open-access catalogue.
 * The /catalogue/getopenaccess/ endpoint returns a 303 redirect whose
 * Location header contains the access code in the URL path.
 */
async function getAccessCode(): Promise<string> {
	const result = await runCommand('curl', ['-so', '/dev/null', '-w', '%{redirect_url}', OPEN_ACCESS_URL], {
		stdout: 'piped',
	});
	const redirectUrl = new TextDecoder().decode(result.stdout).trim();
	const match = redirectUrl.match(/\/client-open\/([^/?]+)/);
	if (!match) {
		throw new Error(`Failed to obtain access code from ${OPEN_ACCESS_URL} (redirect: ${redirectUrl})`);
	}
	return match[1];
}

export function parseIndex(data: IndexResponse): { id: string; path: string }[] {
	return data.children
		.filter((c) => c.type === 'FILE' && c.name.endsWith('.jp2'))
		.map((c) => ({
			id: c.name.replace('.jp2', ''),
			path: c.url,
		}));
}

export default defineTileRegion({
	name: 'be',
	meta: {
		status: 'scraping',
		notes: ['License requires attribution.'],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'National Geographic Institute (NGI) of Belgium',
			url: 'https://www.ngi.be/en',
		},
		date: '2024',
	},
	init: async (ctx) => {
		const indexPath = join(ctx.tempDir, 'index.json');
		if (!existsSync(indexPath)) {
			console.log('  Obtaining access code...');
			const accessCode = await getAccessCode();
			const indexUrl = `https://ac.ngi.be/client-open/${accessCode}/${INDEX_PATH}?editingType=info&editingData=%7B%22addServiceLayers%22%3Atrue%7D`;
			console.log('  Fetching file index...');
			await withRetry(() => downloadFile(indexUrl, indexPath), { maxAttempts: 3 });
		}
		const content = await readFile(indexPath, 'utf-8');
		return parseIndex(JSON.parse(content));
	},
	download: async ({ path, id }, { tempDir, errors }) => {
		const jp2Path = join(tempDir, `${id}.jp2`);
		try {
			const accessCode = await getAccessCode();
			const url = `https://ac.ngi.be/client-open/${accessCode}/${path}`;
			await withRetry(() => downloadFile(url, jp2Path), { maxAttempts: 3 });
			if (!(await isValidRaster(jp2Path))) {
				errors.add(`${id}.jp2 (${url})`);
				return 'invalid';
			}
			return { jp2Path };
		} catch (err) {
			try {
				rmSync(jp2Path, { force: true });
			} catch {}
			throw err;
		}
	},
	convertCores: 5,
	convert: async ({ jp2Path }, { dest, tempDir }) => {
		try {
			await runMosaicTile(jp2Path, dest, { cacheDirectory: tempDir });
		} finally {
			try {
				rmSync(jp2Path, { force: true });
			} catch {}
		}
	},
	minFiles: 720,
});
