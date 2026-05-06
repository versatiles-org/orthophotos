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
} from '../lib/region-api.ts';

// INSPIRE View Service for Orthoimagery (Annex II) published by the Cyprus
// Department of Lands and Surveys. The single layer carries the 2014 50 cm
// aerial photography mosaic of the Republic of Cyprus.
const WMS_URL = 'https://eservices.dls.moi.gov.cy/inspire/services/INSPIRE/OI_Orthoimagery/MapServer/WmsServer';
// ArcGIS Server names INSPIRE WMS layers by index; "0" is OI.OrthoimageCoverage_Orthophotos.
const LAYER = '0';

interface CyItem extends WmsBlockItem {
	wmsXmlPath: string;
	blockPx: number;
}

export default defineTileRegion<CyItem, { srcPath: string }>({
	name: 'cy',
	meta: {
		status: 'released',
		notes: [
			'INSPIRE View Service for Orthoimagery from the Department of Lands and Surveys.',
			'Source data: 50 cm aerial photography from 2014.',
			'WMS only — no documented open download service for the rasters themselves.',
			'GetCapabilities advertises EPSG:4326 / EPSG:3048 (UTM 36N on ED50); the server also accepts EPSG:3857 in practice (verified by smoke-test).',
			'No explicit licence terms published with the WMS — treated as freely usable per the INSPIRE Directive convention used elsewhere in this project (see `lt`).',
			'Coverage: Republic of Cyprus only (lat 34.55–35.21, lon 32.26–34.10). Excludes the unrecognised TRNC in the north.',
		],
		entries: ['result'],
		license: {
			name: 'CC0',
			url: 'https://creativecommons.org/publicdomain/zero/1.0/',
			requiresAttribution: false,
		},
		creator: {
			name: 'Department of Lands and Surveys, Cyprus',
			url: 'https://portal.dls.moi.gov.cy/',
		},
		date: '2014',
		releaseDate: '2026-05-05',
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
	// ArcGIS Server tends to throttle aggressive parallel WMS render requests; 2 streams
	// is a polite ceiling that still keeps the pipeline saturated for a small island.
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
	// Cyprus is small (~9,250 km²); even at MAX_ZOOM=17 with 8192-px blocks we expect
	// only a few dozen blocks. Tighten this once the first run gives a real count.
	minFiles: 30,
});
