import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { defineTileRegion, downloadFile, downloadRaster, runMosaicTile, withRetry } from '../lib/index.ts';

const SEARCH_URL =
	'https://ogd.swisstopo.admin.ch/services/swiseld/services/assets/ch.swisstopo.swissimage-dop10/search?format=image%2Ftiff%3B%20application%3Dgeotiff%3B%20profile%3Dcloud-optimized&resolution=0.1&srid=2056&state=current&csv=true';

// Filename pattern: swissimage-dop10_{year}_{coord}_0.1_2056.tif
export function deduplicateByCoord(urls: string[]): string[] {
	const byCoord = new Map<string, { url: string; year: string }>();
	for (const url of urls) {
		const match = basename(url).match(/^swissimage-dop10_(\d{4})_(\d+-\d+)_/);
		if (!match) continue;
		const [, year, coord] = match;
		const existing = byCoord.get(coord);
		if (!existing || year > existing.year) {
			byCoord.set(coord, { url, year });
		}
	}
	return [...byCoord.values()].map((v) => v.url);
}

export default defineTileRegion({
	name: 'ch',
	meta: {
		status: 'released',
		notes: [
			'You have to use an undocumented API to get a constantly changing URL for a CSV file that contains the URLs for the actual tiles.',
			'License requires attribution.',
			'National license instead of an international standard.',
		],
		entries: ['result'],
		license: {
			name: 'Open Government Data (OGD)',
			url: 'https://www.swisstopo.admin.ch/de/nutzungsbedingungen-kostenlose-geodaten-und-geodienste',
			requiresAttribution: true,
		},
		creator: {
			name: 'Bundesamt für Landestopografie swisstopo',
			url: 'https://www.swisstopo.admin.ch/de/orthobilder-swissimage-10-cm',
		},
		date: '2017-2024',
		releaseDate: '2026-03-27',
	},
	init: async (ctx) => {
		const csvPath = join(ctx.tempDir, 'index.csv');
		if (!existsSync(csvPath)) {
			console.log('  Fetching index CSV URL...');
			const jsonPath = join(ctx.tempDir, 'index.json');
			await withRetry(() => downloadFile(SEARCH_URL, jsonPath), { maxAttempts: 3 });
			const json = JSON.parse(await readFile(jsonPath, 'utf-8')) as { href: string };

			console.log('  Downloading index CSV...');
			await withRetry(() => downloadFile(json.href, csvPath), { maxAttempts: 3 });
		}
		const csv = await readFile(csvPath, 'utf-8');
		const allUrls = csv.trim().split('\n').filter(Boolean);
		const urls = deduplicateByCoord(allUrls);
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
	minFiles: 42600,
});
