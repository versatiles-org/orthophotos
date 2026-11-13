/**
 * Global satellite base layer from the Copernicus Sentinel-2 quarterly mosaics.
 *
 * Source: the "Sentinel-2 Global Mosaics" collection of the Copernicus Data Space Ecosystem
 * (CDSE), product S2MSI_L3__MCQ: one mosaic per quarter, 10 m, in the Sentinel-2 tiling grid
 * (about 100 km per tile, in the tile's UTM zone). Each band is a 16-bit Cloud-Optimized GeoTIFF
 * with nodata −32768 in the `eodata` S3 bucket, readable with free CDSE S3 credentials
 * (`cdse_s3_access_key`, `cdse_s3_secret_key` in config.env).
 *
 * Per tile: read the red, green and blue bands over S3, convert them losslessly to an 8-bit RGBA
 * GeoTIFF (alpha from the nodata mask), and tile it with `versatiles mosaic tile`. The merge
 * assembles all tiles; where neighbouring UTM zones overlap, alpha compositing joins them.
 *
 * Replaces the S2GM pipeline of the former `versatiles-satellite` repository, whose newest
 * complete global mosaic was 2024 Q3. See `docs/satellite.md`.
 */

import { existsSync, renameSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineTileRegion, getConfig, isValidRaster, runCommand, runMosaicTile, withRetry } from '../lib/index.ts';

const STAC_SEARCH_URL = 'https://stac.dataspace.copernicus.eu/v1/search';
const COLLECTION = 'sentinel-2-global-mosaics';

/** First day of the quarter to build. 2025 Q3 is the newest complete summer mosaic (November 2026). */
export const QUARTER = '2025-07-01';

/**
 * Colour stretch from 16-bit reflectance (× 10,000) to 8 bits: `BLACK` → 0, `WHITE` → 255, with a
 * gamma of `EXPONENT` in between. Tuned so that Berlin and Venice match the brightness and contrast
 * of the previous S2GM layer; bright glaciers keep their texture.
 */
const BLACK = 100;
const WHITE = 3250;
const EXPONENT = 0.5;

export interface Sentinel2Item {
	/** e.g. `2025_Q3_33UUU_0_0` */
	id: string;
	/** `/vsis3/` paths of the red, green and blue band. */
	red: string;
	green: string;
	blue: string;
}

interface StacFeature {
	id: string;
	assets: Record<string, { href?: string }>;
}

interface StacLink {
	rel?: string;
	href?: string;
	method?: string;
	body?: unknown;
}

/** The tiles on one page of a STAC search, and the request for the next page. */
export function parseStacPage(page: { features?: StacFeature[]; links?: StacLink[] }): {
	items: Sentinel2Item[];
	next?: { href: string; body?: unknown };
} {
	const items: Sentinel2Item[] = [];
	for (const feature of page.features ?? []) {
		const band = (name: string): string | undefined => feature.assets[name]?.href?.replace(/^s3:\/\//, '/vsis3/');
		const [red, green, blue] = [band('B04'), band('B03'), band('B02')];
		if (!red || !green || !blue) continue;
		items.push({ id: feature.id.replace(/^Sentinel-2_mosaic_/, ''), red, green, blue });
	}
	const link = page.links?.find((l) => l.rel === 'next' && l.href);
	return { items, next: link ? { href: link.href!, body: link.body } : undefined };
}

/** `gdal_translate` arguments that turn the 16-bit RGB VRT into an 8-bit RGBA GeoTIFF. */
export function getConversionArgs(vrtPath: string, output: string): string[] {
	const args = ['-q', '-ot', 'Byte', '-b', '1', '-b', '2', '-b', '3', '-b', 'mask'];
	for (const band of [1, 2, 3]) {
		args.push(`-scale_${band}`, String(BLACK), String(WHITE), '0', '255', `-exponent_${band}`, String(EXPONENT));
	}
	args.push('-colorinterp', 'red,green,blue,alpha', '-a_nodata', 'none');
	for (const co of ['TILED=YES', 'COMPRESS=DEFLATE', 'PREDICTOR=2', 'BIGTIFF=IF_NEEDED', 'ALPHA=YES']) {
		args.push('-co', co);
	}
	args.push(vrtPath, output);
	return args;
}

/** Environment for GDAL to read the CDSE `eodata` bucket. */
function s3Env(): Record<string, string> {
	const cdse = getConfig().cdse;
	if (!cdse) throw new Error('Set cdse_s3_access_key and cdse_s3_secret_key in config.env for the satellite pipeline');
	return {
		AWS_ACCESS_KEY_ID: cdse.accessKey,
		AWS_SECRET_ACCESS_KEY: cdse.secretKey,
		AWS_S3_ENDPOINT: 'eodata.dataspace.copernicus.eu',
		AWS_VIRTUAL_HOSTING: 'FALSE',
		AWS_HTTPS: 'YES',
		GDAL_HTTP_MAX_RETRY: '5',
		GDAL_HTTP_RETRY_DELAY: '2',
	};
}

/** Fetches one STAC search page to `path`: a POST with `body`, or a GET of `href` without one. */
async function fetchStacPage(href: string, body: unknown, path: string): Promise<void> {
	const tmp = `${path}.tmp`;
	const args = ['-s', '--fail', '--max-time', '300', '-o', tmp];
	if (body !== undefined) args.push('-X', 'POST', '-H', 'Content-Type: application/json', '-d', JSON.stringify(body));
	args.push(href);
	await runCommand('curl', args, { quiet: true });
	renameSync(tmp, path);
}

export default defineTileRegion<Sentinel2Item, { tifPath: string }>({
	name: 'satellite/sentinel2',
	meta: {
		status: 'scraping',
		notes: [
			'Copernicus Sentinel-2 Global Mosaics (quarterly, 10 m) from the Copernicus Data Space Ecosystem.',
			'Read over S3 with free CDSE credentials.',
			"Required credit (Sentinel data legal notice, for modified data): 'Contains modified Copernicus Sentinel data 2025'.",
		],
		entries: ['result'],
		license: {
			name: 'Copernicus Sentinel data legal notice',
			url: 'https://sentinels.copernicus.eu/documents/247904/690755/Sentinel_Data_Legal_Notice',
			requiresAttribution: true,
		},
		creator: {
			name: 'Copernicus Data Space Ecosystem',
			url: 'https://browser.stac.dataspace.copernicus.eu/collections/sentinel-2-global-mosaics',
		},
		date: QUARTER.slice(0, 4),
		resolution: 1000,
		checked: '2026-11-12',
		// 10 m source pixels: zoom 13 (about 9.6 m in Web Mercator) matches them.
		maxZoom: 13,
	},
	init: async (ctx) => {
		const items: Sentinel2Item[] = [];
		let request: { href: string; body?: unknown } | undefined = {
			href: STAC_SEARCH_URL,
			body: { collections: [COLLECTION], datetime: `${QUARTER}T00:00:00Z/${QUARTER}T23:59:59Z`, limit: 1000 },
		};
		for (let page = 1; request; page++) {
			const pagePath = join(ctx.tempDir, `stac-${QUARTER}-${page}.json`);
			const { href, body } = request;
			if (!existsSync(pagePath)) await withRetry(() => fetchStacPage(href, body, pagePath), { maxAttempts: 3 });
			const parsed = parseStacPage(JSON.parse(await readFile(pagePath, 'utf-8')));
			items.push(...parsed.items);
			request = parsed.next;
		}
		console.log(`  ${items.length} Sentinel-2 mosaic tiles for ${QUARTER}`);
		return items;
	},
	downloadLimit: 4,
	download: async (item, ctx) => {
		const env = s3Env();
		const vrtPath = ctx.tempFile(join(ctx.tempDir, `${item.id}.vrt`));
		const tifPath = ctx.tempFile(join(ctx.tempDir, `${item.id}.tif`));
		await runCommand('gdalbuildvrt', ['-q', '-overwrite', '-separate', vrtPath, item.red, item.green, item.blue], {
			env,
			quiet: true,
		});
		await withRetry(() => runCommand('gdal_translate', getConversionArgs(vrtPath, tifPath), { env, quiet: true }), {
			maxAttempts: 3,
		});
		if (!(await isValidRaster(tifPath))) {
			ctx.errors.add(`${item.id}.tif`);
			return 'invalid';
		}
		return { tifPath };
	},
	convertLimit: { memoryGB: 8 },
	convert: async ({ tifPath }, { dest, maxZoom }) => {
		// Snow, ice and clouds are white up to the tile edges; that is imagery, not a fill.
		await runMosaicTile(tifPath, dest, { maxZoom, whiteBorder: 'ignore' });
	},
	// 29,513 tiles for 2025 Q3.
	minFiles: 25000,
});
