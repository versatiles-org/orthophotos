import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { defineRegion, step } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { shuffle } from '../lib/array.ts';
import { downloadFile } from '../lib/command.ts';
import { CONCURRENCY, concurrent } from '../lib/concurrent.ts';
import { withRetry } from '../lib/retry.ts';

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

export default defineRegion(
	'de/niedersachsen',
	{
		status: 'success',
		notes: [
			'License requires attribution.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
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
	},
	[
		step('fetch-geojson', async (ctx) => {
			const geojsonPath = join(ctx.tempDir, 'lgln-opengeodata-dop20.geojson');
			if (!existsSync(geojsonPath)) {
				console.log('  Fetching GeoJSON...');
				await withRetry(() => downloadFile(GEOJSON_URL, geojsonPath), { maxAttempts: 3 });
			}

			const content = await readFile(geojsonPath, 'utf-8');
			const urls = parseTileUrls(content);
			await writeFile(join(ctx.tempDir, 'urls.json'), JSON.stringify(urls));
			console.log(`  Found ${urls.length} unique tile URLs`);
		}),

		step('download-tiles', async (ctx) => {
			const tilesDir = join(ctx.dataDir, 'tiles');
			mkdirSync(tilesDir, { recursive: true });

			const urls: string[] = JSON.parse(await readFile(join(ctx.tempDir, 'urls.json'), 'utf-8'));

			await concurrent(
				shuffle(urls),
				CONCURRENCY,
				async (url) => {
					const filename = basename(url);
					const dest = join(tilesDir, filename);
					if (existsSync(dest)) return 'skipped';

					await withRetry(() => downloadFile(url, dest), { maxAttempts: 3 });
					return 'downloaded';
				},
				{ labels: ['downloaded', 'skipped'] },
			);

			await expectMinFiles(tilesDir, '*', 50);
		}),
	],
);
