import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { downloadFile, runCommand } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runMosaicTile } from '../run/commands.ts';

const GML_URL =
	'https://download.data.public.lu/resources/inspire-annex-ii-theme-orthoimagery-orthoimagecoverage-2025-summer/20260324-074957/oi.ortho-rgb-2025-summer.gml';
const JP2_URL = 'https://data.public.lu/fr/datasets/r/db28baa5-3bd2-45ed-980d-5b8de1f452b0';

export default defineTileRegion({
	name: 'lu',
	meta: {
		status: 'scraping',
		notes: ['Single 69 GB JP2 file for all of Luxembourg.', 'CRS is EPSG:2169 (Luxembourg 1930 Gauss).'],
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
	},
	init: async () => {
		return [{ id: 'orthophoto_2025', url: JP2_URL }];
	},
	download: async ({ url, id }, { tempDir }) => {
		const jp2Path = join(tempDir, `${id}.jp2`);
		const tifPath = join(tempDir, `${id}.tif`);
		try {
			console.log(`  Downloading ${id}.jp2 (~69 GB)...`);
			await withRetry(() => downloadFile(url, jp2Path), { maxAttempts: 3 });

			// Convert JP2 to uncompressed tiled GeoTIFF — versatiles crashes reading JP2 directly.
			console.log(`  Converting JP2 to GeoTIFF...`);
			await runCommand('gdal_translate', ['-q', '-of', 'GTiff', '-co', 'TILED=YES', jp2Path, tifPath]);
			rmSync(jp2Path, { force: true });

			return { tifPath };
		} catch (err) {
			for (const p of [jp2Path, tifPath]) {
				try {
					rmSync(p, { force: true });
				} catch {}
			}
			throw err;
		}
	},
	convert: async ({ tifPath }, { dest, tempDir }) => {
		try {
			await runMosaicTile(tifPath, dest, { crs: '2169', cacheDirectory: tempDir });
		} finally {
			try {
				rmSync(tifPath, { force: true });
			} catch {}
		}
	},
	minFiles: 1,
});
