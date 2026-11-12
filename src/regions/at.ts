import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
	createXmlParser,
	defineTileRegion,
	downloadFile,
	downloadRaster,
	pipeline,
	runMosaicTile,
	withRetry,
} from '../lib/index.ts';

const ATOM_URL =
	'https://data.bev.gv.at/geonetwork/srv/atom/describe/service?uuid=7f047345-4ebf-45cd-8900-6edf50a84638';

/**
 * The BEV "Operate" (flight blocks, named year + block code) to download. BEV flies Austria in a
 * three-year cycle, so each year's blocks replace those from three years earlier, but the block
 * outlines change a little each time.
 *
 * Selected in November 2026 from the footprints of all 2021–2025 operats (the mask band of each
 * RGB mosaic at about 100 m, reprojected to EPSG:31287, since the operats use the three
 * Gauss-Krüger zones 31254–31256): from newest to oldest, an operat is kept if more than 5 km² of
 * it is not covered by a newer one. 2022260 still shows about 2,200 km² where 2025260 is smaller.
 * The 32 operats cover about 87,900 km², the same as all 53. Newer operats are drawn on top
 * (`priority` below), so where they overlap the newest imagery shows.
 */
const OPERATS = [
	2022260, 2023150, 2023160, 2023250, 2023260, 2023270, 2023350, 2023360, 2023370, 2023450, 2023460, 2024150, 2024250,
	2024260, 2024350, 2024450, 2024460, 2024470, 2025150, 2025160, 2025250, 2025260, 2025350, 2025360, 2025370, 2025450,
	2025460, 2025470, 2025650, 2025750, 2025850, 2025950,
];

/** The operat number at the start of a tile ID like `2025150_Mosaik_RGB`: newer operats rank higher. */
export function operatPriority(id: string): number {
	const operat = Number(id.slice(0, 7));
	if (!/^\d{7}_/.test(id)) throw new Error(`Unexpected Austrian tile ID: ${id}`);
	return operat;
}

const xmlParser = createXmlParser();

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

export default defineTileRegion({
	name: 'at',
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
			name: 'BEV',
			url: 'https://data.bev.gv.at/geonetwork/srv/api/records/3c3803b3-1b53-4fb5-9595-9217b9891862',
		},
		date: '2022-2025',
		releaseDate: '2026-03-25',
	},
	init: async (ctx) => {
		const feedPath = join(ctx.tempDir, 'service.xml');
		if (!existsSync(feedPath)) {
			console.log('  Fetching service atom feed...');
			await withRetry(() => downloadFile(ATOM_URL, feedPath), { maxAttempts: 3 });
		}

		const urlsPath = join(ctx.tempDir, 'tile_urls.json');
		if (!existsSync(urlsPath)) {
			const feedXml = await readFile(feedPath, 'utf-8');
			const datasets = parseServiceFeed(feedXml, OPERATS);
			console.log(`  Found ${datasets.length} matching Operat entries`);

			const tileUrls: string[] = [];
			await pipeline(datasets, { progress: { labels: ['resolved', 'empty'] } }).forEach(
				4,
				async ({ operat, feedUrl }) => {
					const datasetPath = join(ctx.tempDir, `dataset_${operat}.xml`);
					if (!existsSync(datasetPath)) {
						await withRetry(() => downloadFile(feedUrl, datasetPath), { maxAttempts: 3 });
					}
					const datasetXml = await readFile(datasetPath, 'utf-8');
					const rgbUrl = parseDatasetFeed(datasetXml);
					if (rgbUrl) {
						tileUrls.push(rgbUrl);
						return 'resolved';
					}
					console.warn(`  Operat ${operat}: no RGB mosaic found`);
					return 'empty';
				},
			);

			await writeFile(urlsPath, JSON.stringify(tileUrls));
			console.log(`  Resolved ${tileUrls.length} RGB tile URLs`);
		}

		const urls: string[] = JSON.parse(await readFile(urlsPath, 'utf-8'));
		return urls.map((url) => ({ id: basename(url, '.tif'), url }));
	},
	// Server is rate-limited; one download at a time avoids 429s.
	downloadLimit: 1,
	download: async ({ url, id }, ctx) => {
		const src = ctx.tempFile(join(ctx.tempDir, `${id}.tif`));
		const result = await downloadRaster(url, src, ctx.errors, `${id}.tif`);
		if (result === 'invalid') return 'invalid';
		return { src };
	},
	// runMosaicTile builds a large random-access cache; one per ~8 GB of host RAM is safe.
	convertLimit: { memoryGB: 8 },
	convert: async ({ src }, ctx) => {
		await runMosaicTile(src, ctx.dest, { maxZoom: ctx.maxZoom, cacheDirectory: ctx.tempDir });
	},
	// Newer operats are drawn over older ones where they overlap.
	priority: operatPriority,
	minFiles: OPERATS.length,
});
