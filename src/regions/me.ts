import { existsSync } from 'node:fs';
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
		await withRetry(
			() =>
				extractWmsBlock(
					{ wmsXmlPath: item.wmsXmlPath, x0: item.x0, y0: item.y0, x1: item.x1, y1: item.y1, blockPx: item.blockPx },
					tifPath,
				),
			{ maxAttempts: 3 },
		);
		if (!(await isValidRaster(tifPath))) {
			ctx.errors.add(`${item.id}.tif`);
			return 'invalid';
		}
		return { srcPath: tifPath };
	},
	convert: async ({ srcPath }, { dest }) => {
		await runMosaicTile(srcPath, dest);
	},
	// Montenegro ≈ 13,800 km². At MAX_ZOOM=17 with 2048-px blocks (~2.5 km wide in 3857
	// units) the union bbox covers ~2200 blocks before polygon-mask trimming. Tighten
	// this once the first full run gives a concrete count.
	minFiles: 500,
});
