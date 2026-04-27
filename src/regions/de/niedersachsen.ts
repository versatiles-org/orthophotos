import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { defineTileRegion, downloadFile, downloadRaster, runMosaicTile, withRetry } from '../lib.ts';

const GEOJSON_URL =
	'https://arcgis-geojson.s3.eu-de.cloud-object-storage.appdomain.cloud/dop20/lgln-opengeodata-dop20.geojson';

export function parseTileUrls(geojson: string): string[] {
	const data = JSON.parse(geojson) as {
		features: { properties: { tile_id: string; Aktualitaet: string; rgb: string } }[];
	};

	// Group by tile_id, keep the most recent (highest Aktualitaet)
	const byTileId = new Map<string, { url: string; date: string }>();
	for (const feature of data.features) {
		const { tile_id, Aktualitaet, rgb } = feature.properties;
		const existing = byTileId.get(tile_id);
		if (!existing || Aktualitaet > existing.date) {
			byTileId.set(tile_id, { url: rgb, date: Aktualitaet });
		}
	}

	return [...byTileId.values()].map((v) => v.url);
}

export default defineTileRegion({
	name: 'de/niedersachsen',
	meta: {
		status: 'released',
		notes: [
			'License requires attribution.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'GeoBasis-DE/LGLN, 2026',
			url: 'https://ni-lgln-opengeodata.hub.arcgis.com/apps/lgln-opengeodata::digitales-orthophoto-dop/about',
		},
		date: '2025',
		releaseDate: '2026-03-24',
	},
	init: async (ctx) => {
		const geojsonPath = join(ctx.tempDir, 'lgln-opengeodata-dop20.geojson');
		if (!existsSync(geojsonPath)) {
			console.log('  Fetching GeoJSON...');
			await withRetry(() => downloadFile(GEOJSON_URL, geojsonPath), { maxAttempts: 3 });
		}
		const content = await readFile(geojsonPath, 'utf-8');
		const urls = parseTileUrls(content);
		return urls.map((url) => ({ id: basename(url, '.tif'), url }));
	},
	download: async ({ url, id }, ctx) => {
		const src = ctx.tempFile(join(ctx.tempDir, `${id}.tif`));
		const result = await downloadRaster(url, src, ctx.errors, `${id}.tif`);
		if (result === 'invalid') return 'invalid';
		return { src };
	},
	convert: async ({ src }, { dest }) => {
		await runMosaicTile(src, dest);
	},
	minFiles: 14900,
});
