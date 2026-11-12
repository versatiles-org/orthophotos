import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	convertToTiledTiff,
	defineTileRegion,
	downloadFile,
	downloadRaster,
	runMosaicTile,
	safeRm,
	withRetry,
} from '../lib/index.ts';

/**
 * The summer 2025 orthophoto, as one 10 cm JPEG 2000 per municipality (100 files, about 69 GB).
 * The file URLs contain upload timestamps and some files get replaced, so they are read from the
 * dataset API. The country-wide JPEG 2000 of the same dataset was corrupt when we tried it, so we
 * used the WMS until the per-municipality files appeared; they decode cleanly (November 2026).
 */
const DATASET_API =
	'https://data.public.lu/api/1/datasets/orthophoto-officielle-du-grand-duche-de-luxembourg-edition-ete-2025/';

interface DatasetResource {
	title?: string;
	url?: string;
}

/** The per-municipality RGB files in the dataset, one item per municipality. */
export function parseMunicipalityFiles(dataset: { resources?: DatasetResource[] }): { id: string; url: string }[] {
	const items: { id: string; url: string }[] = [];
	for (const { url } of dataset.resources ?? []) {
		const match = url?.match(/\/orthophoto-2025-ete-10cm-rgb-([a-z0-9-]+)\.jp2$/);
		if (url && match) items.push({ id: match[1], url });
	}
	return items.sort((a, b) => (a.id < b.id ? -1 : 1));
}

export default defineTileRegion({
	name: 'lu',
	meta: {
		status: 'released',
		notes: ['One JPEG 2000 per municipality, clipped to the municipality with a white background.'],
		entries: ['result'],
		license: {
			name: 'CC0',
			url: 'https://creativecommons.org/publicdomain/zero/1.0/',
			requiresAttribution: false,
		},
		creator: {
			name: 'Administration du Cadastre et de la Topographie',
			url: 'https://data.public.lu/fr/datasets/orthophoto-officielle-du-grand-duche-de-luxembourg-edition-ete-2025/',
		},
		date: '2025',
		resolution: 10,
		checked: '2026-11-12',
		releaseDate: '2026-03-28',
		// Clips the near-white JPEG 2000 rim the white nodata leaves along the national border.
		mask: true,
		// 10 cm source pixels: zoom 19 (about 0.10 m on the ground at 49.7° N) shows their full detail.
		maxZoom: 19,
	},
	init: async (ctx) => {
		const datasetPath = join(ctx.tempDir, 'dataset.json');
		if (!existsSync(datasetPath)) {
			await withRetry(() => downloadFile(DATASET_API, datasetPath), { maxAttempts: 3 });
		}
		const items = parseMunicipalityFiles(JSON.parse(await readFile(datasetPath, 'utf-8')));
		console.log(`  ${items.length} municipalities`);
		return items;
	},
	downloadLimit: 2,
	download: async ({ url, id }, ctx) => {
		const jp2Path = ctx.tempFile(join(ctx.tempDir, `${id}.jp2`));
		const result = await downloadRaster(url, jp2Path, ctx.errors, `${id}.jp2`);
		if (result === 'invalid') return 'invalid';
		return { jp2Path, id };
	},
	// Decoding the largest files (up to 2.7 GB of JPEG 2000) needs a lot of memory.
	convertLimit: { memoryGB: 20 },
	convert: async ({ jp2Path, id }, ctx) => {
		const tifPath = ctx.tempFile(join(ctx.tempDir, `${id}.tif`));
		// GDAL's JPEG 2000 decoder is more robust than versatiles's; a tiled TIFF is fast to read.
		await convertToTiledTiff(jp2Path, tifPath, { compress: 'lzw', predictor: false });
		safeRm(jp2Path);
		await runMosaicTile(tifPath, ctx.dest, { maxZoom: ctx.maxZoom, nodata: '255,255,255' });
	},
	// 100 municipalities in November 2026.
	minFiles: 95,
});
