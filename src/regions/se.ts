import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineTileRegion, downloadRaster, runMosaicTile, withRetry } from '../lib/index.ts';

const STAC_SEARCH = 'https://api.lantmateriet.se/stac-bild/v1/search';
// Sweden's bbox (slightly padded). STAC search will only return tiles inside coverage.
const SWEDEN_BBOX = '10.5,55.0,24.5,69.5';
const PAGE_LIMIT = 200;

// Note: this username/password is intentionally not kept secret. Lantmäteriet publishes the
// orthophoto archive under CC0 (no rights reserved, no attribution required), so the registration
// gate at GeoTorget is purely for traffic / quota management — not a license restriction.
// Open data should be accessible without secret credentials, but in this case the provider
// requires an account, so we provide a shared one here for convenience. Same convention as `dk`.
const API_USER = 'mail@versatiles.org';
const API_PASS = 'Cipbid-wofkuz-5jodxe';
const AUTH_HEADER = `Basic ${Buffer.from(`${API_USER}:${API_PASS}`).toString('base64')}`;

interface SeItem {
	id: string;
	url: string;
}

interface StacFeature {
	id: string;
	properties: {
		datetime: string;
		/** Ground sample distance in metres — smaller is higher resolution. */
		upplosning: number;
		/** Projected bbox in SWEREF99 TM (EPSG:3006): [minX, minY, maxX, maxY]. */
		'proj:bbox': [number, number, number, number];
	};
	assets: {
		data: { href: string };
	};
}

interface StacResponse {
	features: StacFeature[];
	links?: { rel: string; href: string }[];
}

/**
 * Walks the STAC catalog, deduplicating overlapping acquisitions to a single
 * "best" tile per grid cell — preferring higher resolution first, then newer.
 */
async function buildTileIndex(): Promise<SeItem[]> {
	const bestByGrid = new Map<string, StacFeature>();
	let url: string | undefined = `${STAC_SEARCH}?bbox=${SWEDEN_BBOX}&limit=${PAGE_LIMIT}`;
	let pageCount = 0;
	while (url) {
		pageCount++;
		const data = await withRetry(
			async () => {
				const r = await fetch(url!);
				if (!r.ok) throw new Error(`STAC fetch failed (${r.status}) for ${url}`);
				return (await r.json()) as StacResponse;
			},
			{ maxAttempts: 3 },
		);
		for (const f of data.features) {
			const [minX, minY] = f.properties['proj:bbox'];
			const key = `${minX}_${minY}`;
			const prev = bestByGrid.get(key);
			if (
				!prev ||
				f.properties.upplosning < prev.properties.upplosning ||
				(f.properties.upplosning === prev.properties.upplosning && f.properties.datetime > prev.properties.datetime)
			) {
				bestByGrid.set(key, f);
			}
		}
		url = data.links?.find((l) => l.rel === 'next')?.href;
		if (pageCount % 10 === 0) console.log(`    page ${pageCount}: ${bestByGrid.size} unique grid cells so far`);
	}
	console.log(`  Walked ${pageCount} STAC pages → ${bestByGrid.size} unique tiles after dedup`);
	return [...bestByGrid.values()].map((f) => ({ id: f.id, url: f.assets.data.href }));
}

export default defineTileRegion<SeItem, { tifPath: string }>({
	name: 'se',
	meta: {
		status: 'scraping',
		notes: [
			'Lantmäteriet ortofoto, served via STAC API as Cloud-Optimized GeoTIFFs.',
			'Open data: CC0 (no rights reserved, no attribution required).',
			'STAC search is anonymous; downloads require a GeoTorget account — a shared one is hardcoded (see source comments).',
			'Coverage: 0.16 m for southern Sweden / Norrland coast (every 2 years), 0.25–0.37 m elsewhere (every 4–6 years). EPSG:3006 (SWEREF99 TM).',
			'Catalog is deduped per grid cell, preferring higher resolution then newer acquisition.',
		],
		entries: ['result'],
		license: {
			name: 'CC0',
			url: 'https://creativecommons.org/publicdomain/zero/1.0/',
			requiresAttribution: false,
		},
		creator: {
			name: 'Lantmäteriet',
			url: 'https://www.lantmateriet.se/sv/geodata/vara-produkter/produktlista/ortofoto-nedladdning/',
		},
		date: '2018-2025',
		mask: true,
	},
	init: async (ctx) => {
		// Walking the catalog (~70k tiles) takes minutes; cache the result so reruns
		// of `task fetch` after a network blip don't have to re-paginate.
		const cachePath = join(ctx.tempDir, 'tile_index.json');
		if (existsSync(cachePath)) {
			console.log('  Loading cached STAC tile index...');
			return JSON.parse(await readFile(cachePath, 'utf-8')) as SeItem[];
		}
		console.log(`  Walking STAC catalog at ${STAC_SEARCH} ...`);
		const items = await buildTileIndex();
		await writeFile(cachePath, JSON.stringify(items));
		return items;
	},
	// Lantmäteriet's downloader is generous but not unlimited; 4 parallel streams keeps
	// us well under the per-account fair-use limit while saturating a typical home link.
	downloadLimit: 4,
	download: async ({ url, id }, ctx) => {
		const tifPath = ctx.tempFile(join(ctx.tempDir, `${id}.tif`));
		const result = await downloadRaster(url, tifPath, ctx.errors, `${id}.tif`, {
			download: { headers: { Authorization: AUTH_HEADER } },
		});
		if (result === 'invalid') return 'invalid';
		return { tifPath };
	},
	// Each COG is ~600 MB at 16 cm; cap parallel converts by RAM budget.
	convertLimit: { memoryGB: 8 },
	convert: async ({ tifPath }, { dest }) => {
		await runMosaicTile(tifPath, dest);
	},
	// Sweden ≈ 450k km², 2.5 km × 2.5 km tiles → ~72k cells at full coverage.
	// Bump this once the first full run gives a concrete count.
	minFiles: 50000,
});
