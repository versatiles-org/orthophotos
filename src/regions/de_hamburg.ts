import { existsSync, rmSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { downloadFile, runCommand } from '../lib/command.ts';
import { extractZipFile, safeRemoveDir } from '../lib/fs.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runVersatilesRasterConvert } from '../run/commands.ts';

const CKAN_API_URL =
	'https://suche.transparenz.hamburg.de/api/3/action/package_show?id=luftbilder-hamburg-dop-zeitreihe-belaubt2';

interface CkanResponse {
	result: {
		resources: {
			url: string;
			name: string;
			format: string;
		}[];
	};
}

export function parseResources(data: CkanResponse): { id: string; url: string }[] {
	return data.result.resources
		.filter((r) => r.format === 'GEOTIFF' && r.url.endsWith('.zip'))
		.map((r) => ({
			id: basename(r.url, '.zip'),
			url: r.url,
		}));
}

export default defineTileRegion({
	name: 'de/hamburg',
	meta: {
		status: 'success',
		notes: [
			'Images are unnecessarily packed into container files, such as ZIP.',
			'License requires attribution.',
			'National license instead of an international standard.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['result'],
		license: {
			name: 'DL-DE->BY-2.0',
			url: 'https://www.govdata.de/dl-de/by-2-0',
			requiresAttribution: true,
		},
		creator: {
			name: 'Freie und Hansestadt Hamburg, Landesbetrieb Geoinformation und Vermessung (LGV)',
			url: 'https://metaver.de/trefferanzeige?docuuid=5DF0990B-9195-41E7-9960-9214BC85B4DA',
		},
		date: '2024',
	},
	init: async ({ tempDir }) => {
		const apiPath = join(tempDir, 'ckan.json');
		if (!existsSync(apiPath)) {
			console.log('  Fetching dataset metadata from CKAN API...');
			await withRetry(() => downloadFile(CKAN_API_URL, apiPath), { maxAttempts: 3 });
		}
		const content = await readFile(apiPath, 'utf-8');
		return parseResources(JSON.parse(content));
	},
	download: async ({ url, id }, { tempDir }) => {
		const zipPath = join(tempDir, `${id}.zip`);
		console.log(`  Downloading ${id}.zip...`);
		await withRetry(() => downloadFile(url, zipPath), { maxAttempts: 3 });
		return { zipPath };
	},
	convert: async ({ zipPath }, { dest, tempDir }) => {
		const extractDir = join(tempDir, basename(zipPath, '.zip'));
		const vrtPath = `${dest}.vrt`;
		try {
			console.log(`  Extracting ${basename(zipPath)}...`);
			await extractZipFile(zipPath, extractDir);

			// Find all .tif files in the extracted directory
			const files = await readdir(extractDir, { recursive: true });
			const tifFiles = files
				.map((f) => (typeof f === 'string' ? f : String(f)))
				.filter((f) => f.endsWith('.tif'))
				.map((f) => join(extractDir, f));

			if (tifFiles.length === 0) {
				throw new Error(`No .tif files found in ${extractDir}`);
			}

			// Build VRT from all TIFs
			await runCommand('gdalbuildvrt', [vrtPath, ...tifFiles]);

			// Convert VRT to versatiles
			await runVersatilesRasterConvert(vrtPath, dest);
		} finally {
			try {
				rmSync(vrtPath, { force: true });
				rmSync(zipPath, { force: true });
			} catch {}
			await safeRemoveDir(extractDir);
		}
	},
	minFiles: 7,
});
