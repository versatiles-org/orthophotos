import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { defineTileRegion, downloadFile, extractZipAndBuildVrt, runMosaicTile, withRetry } from '../lib.ts';

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
		status: 'released',
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
		releaseDate: '2026-03-24',
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
	download: async ({ url, id }, ctx) => {
		const zipPath = ctx.tempFile(join(ctx.tempDir, `${id}.zip`));
		console.log(`  Downloading ${id}.zip...`);
		await withRetry(() => downloadFile(url, zipPath), { maxAttempts: 3 });
		return { zipPath };
	},
	// gdal_translate fans out per-tile readers; cap concurrent regions by RAM budget.
	convertLimit: { memoryGB: 8 },
	convert: async ({ zipPath }, ctx) => {
		const extractDir = ctx.tempFile(join(ctx.tempDir, basename(zipPath, '.zip')));
		const vrtPath = ctx.tempFile(`${ctx.dest}.vrt`);

		console.log(`  Extracting ${basename(zipPath)}...`);
		const { fileCount } = await extractZipAndBuildVrt(zipPath, extractDir, vrtPath, { recursive: true });
		if (fileCount === 0) throw new Error(`No .tif files found in ${extractDir}`);

		await runMosaicTile(vrtPath, ctx.dest);
	},
	minFiles: 7,
});
