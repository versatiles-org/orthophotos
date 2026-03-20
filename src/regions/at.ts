import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { defineRegion, step } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { downloadFile } from '../lib/command.ts';
import { CONCURRENCY, concurrent } from '../lib/concurrent.ts';
import { withRetry } from '../lib/retry.ts';

const ATOM_URL =
	'https://data.bev.gv.at/geonetwork/srv/atom/describe/service?uuid=7f047345-4ebf-45cd-8900-6edf50a84638';

const OPERATS = [
	2021160, 2021250, 2021360, 2022150, 2022160, 2022250, 2022260, 2022350, 2022360, 2022370, 2022450, 2022460, 2022470,
	2022650, 2023150, 2023160, 2023250, 2023260, 2023270, 2023350, 2023360, 2023370, 2023450, 2023460, 2023470, 2024150,
	2024250, 2024260, 2024350, 2024450, 2024460, 2024470,
];

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export function parseServiceFeed(xml: string, operats: number[]): { operat: number; feedUrl: string }[] {
	const operatSet = new Set(operats.map(String));
	const parsed = xmlParser.parse(xml);
	const entries: unknown[] = [parsed.feed?.entry ?? []].flat();
	const results: { operat: number; feedUrl: string }[] = [];

	for (const entry of entries) {
		const title = String((entry as Record<string, unknown>).title ?? '');
		const match = title.match(/Operat (\d+)$/);
		if (!match || !operatSet.has(match[1])) continue;

		const links: unknown[] = [(entry as Record<string, unknown>).link ?? []].flat();
		for (const link of links) {
			const attrs = link as Record<string, string>;
			if (attrs['@_rel'] === 'alternate' && attrs['@_type'] === 'application/atom+xml') {
				results.push({
					operat: Number(match[1]),
					feedUrl: (attrs['@_href'] ?? '').replace(/amp;/g, ''),
				});
			}
		}
	}
	return results;
}

export function parseDatasetFeed(xml: string): string | undefined {
	const parsed = xmlParser.parse(xml);
	const entries: unknown[] = [parsed.feed?.entry ?? []].flat();

	for (const entry of entries) {
		const links: unknown[] = [(entry as Record<string, unknown>).link ?? []].flat();
		for (const link of links) {
			const attrs = link as Record<string, string>;
			const href = attrs['@_href'] ?? '';
			if (href.endsWith('_Mosaik_RGB.tif')) {
				return href;
			}
		}
	}
	return undefined;
}

export default defineRegion(
	'at',
	{
		status: 'success',
		notes: ['License requires attribution.'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'BEV',
			url: 'https://data.bev.gv.at/geonetwork/srv/api/records/3c3803b3-1b53-4fb5-9595-9217b9891862',
		},
		date: '2021-2024',
	},
	[
		step('fetch-service-feed', async (ctx) => {
			const feedPath = join(ctx.tempDir, 'service.xml');
			if (!existsSync(feedPath)) {
				console.log('  Fetching service atom feed...');
				await withRetry(() => downloadFile(ATOM_URL, feedPath), { maxAttempts: 3 });
			}
		}),

		step('resolve-tile-urls', async (ctx) => {
			const urlsPath = join(ctx.tempDir, 'tile_urls.json');
			if (existsSync(urlsPath)) {
				const urls: string[] = JSON.parse(await readFile(urlsPath, 'utf-8'));
				console.log(`  ${urls.length} tile URLs already cached`);
				return;
			}

			const feedXml = await readFile(join(ctx.tempDir, 'service.xml'), 'utf-8');
			const datasets = parseServiceFeed(feedXml, OPERATS);
			console.log(`  Found ${datasets.length} matching Operat entries`);

			const tileUrls: string[] = [];
			await concurrent(
				datasets,
				CONCURRENCY,
				async ({ operat, feedUrl }) => {
					const datasetPath = join(ctx.tempDir, `dataset_${operat}.xml`);
					await withRetry(() => downloadFile(feedUrl, datasetPath), { maxAttempts: 3 });
					const datasetXml = await readFile(datasetPath, 'utf-8');
					const rgbUrl = parseDatasetFeed(datasetXml);
					if (rgbUrl) {
						tileUrls.push(rgbUrl);
						return 'resolved';
					}
					console.warn(`  Operat ${operat}: no RGB mosaic found`);
					return 'empty';
				},
				{ labels: ['resolved', 'empty'] },
			);

			await writeFile(urlsPath, JSON.stringify(tileUrls));
			console.log(`  Resolved ${tileUrls.length} RGB tile URLs`);
		}),

		step('download-tiles', async (ctx) => {
			const tilesDir = join(ctx.dataDir, 'tiles');
			mkdirSync(tilesDir, { recursive: true });

			const urls: string[] = JSON.parse(await readFile(join(ctx.tempDir, 'tile_urls.json'), 'utf-8'));

			await concurrent(
				urls,
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

			await expectMinFiles(tilesDir, '*.tif', 10);
		}),
	],
);
