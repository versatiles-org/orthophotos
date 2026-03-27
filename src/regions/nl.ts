import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { downloadFile } from '../lib/command.ts';
import { safeRm } from '../lib/fs.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runMosaicTile } from '../run/commands.ts';

const GEOJSON_URL =
	'https://fsn1.your-objectstorage.com/hwh-portal/20230609_tmp/links/nationaal/Nederland/BM_LRL2024O_RGB.json';

export default defineTileRegion({
	name: 'nl',
	meta: {
		status: 'released',
		notes: ['License requires attribution.'],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'beeldmateriaal.nl',
			url: 'https://www.beeldmateriaal.nl/dataroom',
		},
		date: '2024',
		releaseDate: '2025-10-04',
	},
	init: async (ctx) => {
		const geojsonPath = join(ctx.tempDir, 'features.geojson');
		if (!existsSync(geojsonPath)) {
			console.log('  Fetching features.geojson...');
			await withRetry(() => downloadFile(GEOJSON_URL, geojsonPath), { maxAttempts: 3 });
		}
		const content = await readFile(geojsonPath, 'utf-8');
		const data = JSON.parse(content) as {
			features: { properties: { file: string } }[];
		};
		const urls = data.features.map((f) => f.properties.file);
		return urls.map((url) => ({ id: basename(url, '.tif'), url }));
	},
	download: async ({ url, id }, { tempDir }) => {
		const src = join(tempDir, `${id}.tif`);
		await withRetry(() => downloadFile(url, src), { maxAttempts: 3 });
		return { src };
	},
	convert: async ({ src }, { dest }) => {
		await runMosaicTile(src, dest);
		safeRm(src);
	},
	minFiles: 123456,
});
