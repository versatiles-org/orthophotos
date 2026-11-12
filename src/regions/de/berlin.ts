import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
	createXmlParser,
	defineTileRegion,
	downloadFile,
	downloadRaster,
	runMosaicTile,
	withRetry,
} from '../../lib/index.ts';

// Each campaign gets its own feed (oi_dop2025_sommer, oi_dop2026, …), so a new year needs a new URL.
const ATOM_URL = 'https://gdi.berlin.de/data/oi_dop2026/atom/';
const xmlParser = createXmlParser();

export function parseTileUrls(xml: string): string[] {
	const parsed = xmlParser.parse(xml);

	// Top-level feed may point to a dataset feed via entry > link[rel=alternate]
	// The dataset feed (0.atom) contains entries with direct .jp2 links
	const entries: unknown[] = [parsed.feed?.entry ?? []].flat();
	const urls: string[] = [];
	for (const entry of entries) {
		const links: unknown[] = [(entry as Record<string, unknown>).link ?? []].flat();
		for (const link of links) {
			const attrs = link as Record<string, string>;
			if (attrs['@_rel'] !== 'alternate') continue;
			const href = attrs['@_href'] ?? '';
			if (href.endsWith('.jp2')) {
				urls.push(href);
			}
		}
	}
	return urls;
}

export default defineTileRegion({
	name: 'de/berlin',
	meta: {
		status: 'released',
		notes: ['Atom feed with direct .jp2 download links.'],
		entries: ['result'],
		license: {
			name: 'DL-DE/ZERO-2.0',
			url: 'https://www.govdata.de/dl-de/zero-2-0',
			requiresAttribution: false,
		},
		creator: {
			name: 'Geoportal Berlin',
			url: 'https://gdi.berlin.de/geonetwork/srv/ger/catalog.search#/metadata/ba965749-6f08-4f81-ba98-f46e569d3e57',
		},
		date: '2026',
		mask: 'de_berlin.geojson.gz',
		releaseDate: '2026-03-24',
		// 20 cm source pixels: zoom 18 (0.18–0.20 m on the ground in Germany) shows their full detail.
		maxZoom: 18,
	},
	init: async (ctx) => {
		const feedPath = join(ctx.tempDir, 'feed.xml');
		if (!existsSync(feedPath)) {
			console.log('  Fetching atom feed...');
			await withRetry(() => downloadFile(ATOM_URL, join(ctx.tempDir, 'index.xml')), { maxAttempts: 3 });

			const indexXml = await readFile(join(ctx.tempDir, 'index.xml'), 'utf-8');
			const parsed = xmlParser.parse(indexXml);
			const entries: unknown[] = [parsed.feed?.entry ?? []].flat();
			let datasetFeedUrl: string | undefined;
			for (const entry of entries) {
				const links: unknown[] = [(entry as Record<string, unknown>).link ?? []].flat();
				for (const link of links) {
					const attrs = link as Record<string, string>;
					if (attrs['@_rel'] === 'alternate' && attrs['@_type'] === 'application/atom+xml') {
						datasetFeedUrl = attrs['@_href'];
					}
				}
			}
			if (!datasetFeedUrl) throw new Error('No dataset feed URL found in atom index');

			console.log(`  Fetching dataset feed: ${datasetFeedUrl}`);
			await withRetry(() => downloadFile(datasetFeedUrl!, feedPath), { maxAttempts: 3 });
		}

		const feedXml = await readFile(feedPath, 'utf-8');
		const urls = parseTileUrls(feedXml);
		return urls.map((url) => ({ id: basename(url, '.jp2'), url }));
	},
	download: async ({ url, id }, ctx) => {
		const src = ctx.tempFile(join(ctx.tempDir, `${id}.jp2`));
		const result = await downloadRaster(url, src, ctx.errors, `${id}.jp2`);
		if (result === 'invalid') return 'invalid';
		return { src };
	},
	convert: async ({ src }, { dest, maxZoom }) => {
		await runMosaicTile(src, dest, { maxZoom });
	},
	minFiles: 280,
});
