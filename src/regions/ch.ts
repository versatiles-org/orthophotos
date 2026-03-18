import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { defineRegion, step } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { shuffle } from '../lib/array.ts';
import { downloadFile } from '../lib/command.ts';
import { CONCURRENCY, concurrent } from '../lib/concurrent.ts';
import { withRetry } from '../lib/retry.ts';

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

export default defineRegion(
	'ch',
	{
		status: 'success',
		notes: [
			'You have to use an undocumented API to get a constantly changing URL for a CSV file that contains the URLs for the actual tiles.',
			'License requires attribution.',
			'National license instead of an international standard.',
		],
		entries: ['tiles'],
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
		vrt: { defaults: { ext: 'tif', useFileList: true } },
	},
	[
		step('fetch-index', async (ctx) => {
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
			await writeFile(join(ctx.tempDir, 'urls.json'), JSON.stringify(urls));
			console.log(`  Found ${allUrls.length} URLs, ${urls.length} unique coordinates`);
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

			await expectMinFiles(tilesDir, '*.tif', 50);
		}),
	],
);
