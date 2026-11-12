import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	createXmlParser,
	defineTileRegion,
	downloadFile,
	downloadRaster,
	runMosaicTile,
	withRetry,
} from '../../lib/index.ts';

/**
 * The geoportal generates this feed from the WMS layer "SL DOP20rgb (2023)" (layer 46747): a grid of
 * 19,024 GetMap requests of 500 × 500 m at 2500 px, against `freewms/dop2023`. The 2025 WMS has the
 * same layer, CRS and format, but isn't registered in the geoportal, so there is no feed for it.
 * We take the grid from the 2023 feed and send its requests to `WMS_URL` instead.
 */
const ATOM_URL =
	'https://geoportal.saarland.de/mapbender/php/mod_inspireDownloadFeed.php?id=e7995adf-2aeb-4fa4-a536-041e3cc8b24a&type=DATASET&generateFrom=wmslayer&layerid=46747';
const WMS_URL = 'https://geoportal.saarland.de/freewms/dop2025';

const xmlParser = createXmlParser();

export function parseAtomEntries(xml: string): { url: string; id: string }[] {
	const parsed = xmlParser.parse(xml);
	const entries: unknown[] = [parsed.feed?.entry ?? []].flat();
	const tiles: { url: string; id: string }[] = [];
	for (const entry of entries) {
		const links: unknown[] = [(entry as Record<string, unknown>).link ?? []].flat();
		for (const link of links) {
			const attrs = link as Record<string, string>;
			const href = (attrs['@_href'] ?? '').replace(/amp;/g, '');
			const title = attrs['@_title'] ?? '';
			if (href.includes('mapbender')) continue;
			const match = title.match(/Teil (\S+)/);
			if (match && href) {
				tiles.push({ url: useWms(href), id: match[1] });
			}
		}
	}
	return tiles;
}

/** Points a GetMap request from the feed at `WMS_URL`. Throws if the feed uses another service. */
function useWms(href: string): string {
	const url = href.replace(/^https:\/\/geoportal\.saarland\.de\/freewms\/dop\d{4}\?/, `${WMS_URL}?`);
	if (url === href && !href.startsWith(`${WMS_URL}?`)) {
		throw new Error(`Saarland feed points at an unexpected service, check WMS_URL: ${href}`);
	}
	return url;
}

export default defineTileRegion({
	name: 'de/saarland',
	meta: {
		status: 'released',
		notes: [
			'WMS fallback: 500 × 500 m GetMap requests, using the grid of the geoportal feed generated for the 2023 WMS, sent to the 2025 WMS.',
			'Server is slow.',
			'License requires attribution.',
			'National license instead of an international standard.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['result'],
		license: {
			name: 'DL-DE->BY-2.0',
			url: 'https://www.govdata.de/dl-de/by-2-0',
			requiresAttribution: true,
		},
		creator: {
			name: 'GeoBasis DE/LVGL-SL (2025)',
			url: 'https://geoportal.saarland.de/app-article/geobasisdatenuebersicht/',
		},
		date: '2025',
		releaseDate: '2026-03-22',
		// 20 cm source pixels: zoom 18 (0.18–0.20 m on the ground in Germany) shows their full detail.
		maxZoom: 18,
	},
	init: async (ctx) => {
		const atomPath = join(ctx.tempDir, 'atom.xml');
		if (!existsSync(atomPath)) {
			console.log('  Fetching atom.xml...');
			await withRetry(() => downloadFile(ATOM_URL, atomPath), { maxAttempts: 3 });
		}
		const xml = await readFile(atomPath, 'utf-8');
		return parseAtomEntries(xml);
	},
	download: async ({ url, id }, ctx) => {
		const tifPath = ctx.tempFile(join(ctx.tempDir, `${id}.tif`));
		const result = await downloadRaster(url, tifPath, ctx.errors, `${id}.tif`);
		if (result === 'invalid') return 'invalid';
		return { tifPath };
	},
	convert: async ({ tifPath }, { dest, maxZoom }) => {
		await runMosaicTile(tifPath, dest, { maxZoom });
	},
	minFiles: 19000,
});
