import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { defineTileRegion, downloadFile, downloadRaster, runMosaicTile, withRetry } from '../lib/index.ts';
import { deduplicateByCoord } from './ch.ts';

/**
 * swisstopo's SWISSIMAGE 10 cm also covers Liechtenstein, and has 2025 imagery there, while
 * Liechtenstein's own download service only offers its 2022 orthophoto. The STAC search below
 * covers Liechtenstein plus some of Switzerland; the NUTS mask clips the result to the border.
 */
const STAC_URL =
	'https://data.geo.admin.ch/api/stac/v1/collections/ch.swisstopo.swissimage-dop10/items?bbox=9.47,47.04,9.64,47.28&limit=100';

interface StacPage {
	features?: { assets?: Record<string, { href?: string }> }[];
	links?: { rel?: string; href?: string }[];
}

/** The 10 cm GeoTIFF URLs on one page of STAC items, and the URL of the next page. */
export function parseStacPage(page: StacPage): { urls: string[]; next?: string } {
	const urls: string[] = [];
	for (const feature of page.features ?? []) {
		for (const [key, asset] of Object.entries(feature.assets ?? {})) {
			if (key.endsWith('_0.1_2056.tif') && asset.href) urls.push(asset.href);
		}
	}
	const next = page.links?.find((link) => link.rel === 'next')?.href;
	return { urls, next };
}

export default defineTileRegion({
	name: 'li',
	meta: {
		status: 'released',
		notes: [
			"swisstopo's SWISSIMAGE 10 cm, which also covers Liechtenstein, clipped to the national border.",
			'License requires attribution.',
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
		date: '2025',
		resolution: 10,
		checked: '2026-11-12',
		releaseDate: '2026-04-23',
		mask: true,
		// 10 cm source pixels: zoom 19 (about 0.10 m on the ground at 47° N) shows their full detail.
		maxZoom: 19,
	},
	init: async (ctx) => {
		const urls: string[] = [];
		let next: string | undefined = STAC_URL;
		for (let page = 1; next; page++) {
			const pagePath = join(ctx.tempDir, `stac-${page}.json`);
			const url: string = next;
			if (!existsSync(pagePath)) await withRetry(() => downloadFile(url, pagePath), { maxAttempts: 3 });
			const parsed = parseStacPage(JSON.parse(await readFile(pagePath, 'utf-8')) as StacPage);
			urls.push(...parsed.urls);
			next = parsed.next;
		}
		// Each square kilometre has several years; keep the newest.
		return deduplicateByCoord(urls).map((url) => ({ id: basename(url, '.tif'), url }));
	},
	download: async ({ url, id }, ctx) => {
		const src = ctx.tempFile(join(ctx.tempDir, `${id}.tif`));
		const result = await downloadRaster(url, src, ctx.errors, `${id}.tif`);
		if (result === 'invalid') return 'invalid';
		return { src };
	},
	convert: async ({ src }, { dest, maxZoom }) => {
		await runMosaicTile(src, dest, { maxZoom });
	},
	// 301 squares in November 2026.
	minFiles: 280,
});
