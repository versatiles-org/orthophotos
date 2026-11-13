import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { defineTileRegion, downloadFile, extractZipAndBuildVrt, runMosaicTile, withRetry } from '../../lib/index.ts';

/**
 * The leaf-on ("belaubt") time series, newest 2024. Hamburg also publishes leaf-off imagery
 * ("unbelaubt", 2025 and 2026), but bare trees would stand out next to the summer imagery of
 * the neighbouring states, so we wait for the next leaf-on year (decided November 2026).
 */
const DATASET_NAME = 'luftbilder-hamburg-dop-zeitreihe-belaubt';

/**
 * Hamburg's transparency portal publishes each revision of the dataset as a new CKAN package,
 * named `<DATASET_NAME><n>`, and the old ones keep links that no longer work (in November 2026,
 * revision 2 still pointed at a folder that had moved). So search for all revisions and take
 * the newest.
 */
const CKAN_SEARCH_URL =
	'https://suche.transparenz.hamburg.de/api/3/action/package_search?' +
	new URLSearchParams({ q: `name:${DATASET_NAME}*`, rows: '1000' }).toString();

interface CkanPackage {
	name: string;
	resources: {
		url: string;
		name: string;
		format: string;
	}[];
}

interface CkanSearchResponse {
	result: { results: CkanPackage[] };
}

/** The newest revision of the dataset: the package with the highest number after `DATASET_NAME`. */
export function findNewestRevision(data: CkanSearchResponse): CkanPackage {
	let newest: { revision: number; pkg: CkanPackage } | undefined;
	for (const pkg of data.result.results) {
		const match = pkg.name.match(new RegExp(`^${DATASET_NAME}(\\d*)$`));
		if (!match) continue;
		const revision = match[1] === '' ? 0 : parseInt(match[1], 10);
		if (!newest || revision > newest.revision) newest = { revision, pkg };
	}
	if (!newest) throw new Error(`No CKAN package named ${DATASET_NAME}… found`);
	return newest.pkg;
}

export function parseResources(pkg: Pick<CkanPackage, 'resources'>): { id: string; url: string }[] {
	return pkg.resources
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
			'Each update of the dataset is published as a new CKAN package, and the old ones keep download links that no longer work.',
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
		resolution: 20,
		checked: '2026-11-12',
		releaseDate: '2026-03-24',
		// 20 cm source pixels: zoom 18 (0.18–0.20 m on the ground in Germany) shows their full detail.
		maxZoom: 18,
	},
	init: async ({ tempDir }) => {
		const apiPath = join(tempDir, 'ckan-search.json');
		if (!existsSync(apiPath)) {
			console.log('  Fetching dataset metadata from CKAN API...');
			await withRetry(() => downloadFile(CKAN_SEARCH_URL, apiPath), { maxAttempts: 3 });
		}
		const pkg = findNewestRevision(JSON.parse(await readFile(apiPath, 'utf-8')));
		console.log(`  Newest revision: ${pkg.name}`);
		return parseResources(pkg);
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

		await runMosaicTile(vrtPath, ctx.dest, { maxZoom: ctx.maxZoom });
	},
	minFiles: 7,
});
