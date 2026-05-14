import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	computeWmsBlocks,
	defineTileRegion,
	downloadFile,
	extractWmsBlock,
	generateWmsXml,
	isValidRaster,
	MAX_ZOOM,
	parseWmsCapabilities,
	runMosaicTile,
	type WmsBlockItem,
	withRetry,
} from '../lib/index.ts';

// Uprava za nekretnine (Real Estate Administration of Montenegro) operates an
// ERDAS APOLLO WMS server for the national orthophoto. The endpoint is exposed
// by the public viewer at geoportal.co.me but lives on a sibling host.
const WMS_URL = 'https://geoportalcg.me/erdas-iws/ogc/wms/Ortofoto';
// Year-suffixed layers exist for 2007, 2011, 2017, 2018. The 2018 layer covers
// all of Montenegro at 20 cm resolution — verified by a full-country render —
// so a single-layer fetch is enough. Older years would only add legacy imagery.
const LAYER = 'Ortofoto_DOF2018';

interface MeItem extends WmsBlockItem {
	wmsXmlPath: string;
	blockPx: number;
}

export default defineTileRegion<MeItem, { srcPath: string }>({
	name: 'me',
	meta: {
		status: 'scraping',
		notes: [
			'WMS published by Uprava za nekretnine (Real Estate Administration of Montenegro) via the ERDAS APOLLO server at https://geoportalcg.me/erdas-iws/ogc/wms/Ortofoto. The public viewer at https://geoportal.co.me/ embeds this endpoint.',
			'Source data: 20 cm RGB orthophoto from the DOF 2018 campaign — verified to cover all of Montenegro by a full-country render.',
			'Server is ERDAS APOLLO, caps GetMap requests at 4000 px per dimension; computeWmsBlocks picks 2048-px blocks accordingly.',
			'AccessConstraints in capabilities: None. Fees: None. No explicit licence terms published — treated as freely usable per the INSPIRE Directive convention used elsewhere in this project (see `lt`, `cy`, `hr`).',
			"PNG responses come back as 8-bit paletted; GDAL's WMS driver expands them transparently to RGBA when `BandsCount=4` is set in the generated wms.xml.",
		],
		entries: ['result'],
		license: {
			name: 'CC0',
			url: 'https://creativecommons.org/publicdomain/zero/1.0/',
			requiresAttribution: false,
		},
		creator: {
			name: 'Uprava za nekretnine (Real Estate Administration of Montenegro)',
			url: 'https://www.gov.me/en/uzn',
		},
		date: '2018',
		mask: true,
	},
	init: async (ctx) => {
		const capsPath = join(ctx.tempDir, 'caps.xml');
		if (!existsSync(capsPath)) {
			console.log('  Fetching WMS capabilities...');
			await withRetry(() => downloadFile(`${WMS_URL}?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.1.1`, capsPath), {
				maxAttempts: 3,
			});
		}

		const wmsXmlPath = join(ctx.tempDir, 'wms.xml');
		if (!existsSync(wmsXmlPath)) {
			await generateWmsXml(WMS_URL, LAYER, wmsXmlPath);
		}

		const { bbox, maxWidth, maxHeight } = await parseWmsCapabilities(capsPath, LAYER);
		const { items, blockPx } = computeWmsBlocks(bbox, MAX_ZOOM, maxWidth, maxHeight);
		console.log(`  ${items.length} blocks at ${blockPx}x${blockPx}px`);

		return items.map((item) => ({ ...item, wmsXmlPath, blockPx }));
	},
	// Single ERDAS APOLLO server for a small country; 2 streams keeps us a polite peer.
	downloadLimit: 2,
	download: async (item, ctx) => {
		const tifPath = ctx.tempFile(join(ctx.tempDir, `${item.id}.tif`));
		try {
			await withRetry(
				() =>
					extractWmsBlock(
						{ wmsXmlPath: item.wmsXmlPath, x0: item.x0, y0: item.y0, x1: item.x1, y1: item.y1, blockPx: item.blockPx },
						tifPath,
					),
				{
					maxAttempts: 3,
					// ERDAS APOLLO returns `LayerNotDefined: Dataset Ortofoto_DOF2018
					// not found in the datastore` for blocks that fall outside the
					// actual data extent (the layer-level EX_GeographicBoundingBox is
					// a loose envelope, not a true coverage mask). It's deterministic
					// — retrying just wastes time and amplifies log noise.
					shouldRetry: (err) => !err.message.includes('LayerNotDefined'),
				},
			);
		} catch (err) {
			// Either `LayerNotDefined` (skipped the retry above) or the retried call
			// exhausted attempts on a different error. Only the former is a legitimate
			// "no data here" — anything else propagates.
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes('LayerNotDefined')) {
				writeFileSync(ctx.skipDest, '');
				return 'empty';
			}
			throw err;
		}
		if (!(await isValidRaster(tifPath))) {
			ctx.errors.add(`${item.id}.tif`);
			return 'invalid';
		}
		return { srcPath: tifPath };
	},
	convert: async ({ srcPath }, { dest }) => {
		await runMosaicTile(srcPath, dest);
	},
	// Montenegro ≈ 13,800 km². Init computes 696 blocks at 8192×8192 px (the
	// `<MaxWidth>4000</MaxWidth>` advertised in the caps is per-pixel — GDAL's WMS
	// driver fans each block out to 1024-px sub-tile fetches, well under the cap).
	// First full run produced 489 `.versatiles` files after ERDAS APOLLO's
	// `LayerNotDefined` peripheral blocks were skipped; floor below that with
	// a small slack for future re-runs.
	minFiles: 450,
});
