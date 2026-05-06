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
} from '../lib/region-api.ts';

const WMS_URL = 'https://geoportal.asig.gov.al/service/orthophoto_2015/wms';
const LAYER = 'OrthoImagery_20cm';

interface AlItem extends WmsBlockItem {
	wmsXmlPath: string;
	blockPx: number;
}

export default defineTileRegion<AlItem, { srcPath: string }>({
	name: 'al',
	meta: {
		status: 'released',
		notes: ['Only WMS found.', 'Server is very slow.', 'Full coverage only for 2015.'],
		entries: ['result'],
		license: {
			name: 'CC0',
			url: 'https://creativecommons.org/publicdomain/zero/1.0/',
			requiresAttribution: false,
		},
		creator: {
			name: 'ASIG',
			url: 'https://geoportal.asig.gov.al/geonetwork/srv/alb/catalog.search#/metadata/b50abc17-b932-4a96-b97a-ae6cba52c2fb',
		},
		date: '2015',
		releaseDate: '2026-05-01',
	},
	init: async (ctx) => {
		const capsPath = join(ctx.tempDir, 'caps.xml');
		if (!existsSync(capsPath)) {
			console.log('  Fetching WMS capabilities...');
			await withRetry(() => downloadFile(`${WMS_URL}?service=WMS&request=GetCapabilities&version=1.1.1`, capsPath), {
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
	downloadLimit: 1,
	download: async (item, ctx) => {
		const tifPath = ctx.tempFile(join(ctx.tempDir, `${item.id}.tif`));
		await withRetry(
			() =>
				extractWmsBlock(
					{
						wmsXmlPath: item.wmsXmlPath,
						x0: item.x0,
						y0: item.y0,
						x1: item.x1,
						y1: item.y1,
						blockPx: item.blockPx,
					},
					tifPath,
				),
			{ maxAttempts: 3 },
		);

		// WMS returns an XML error blob (not a valid raster) for blocks outside coverage.
		// Persist a `.skip` marker since coverage is fixed — re-running won't change it.
		if (!(await isValidRaster(tifPath))) {
			writeFileSync(ctx.skipDest, '');
			return 'empty';
		}

		return { srcPath: tifPath };
	},
	convert: async ({ srcPath }, { dest }) => {
		await runMosaicTile(srcPath, dest);
	},
	minFiles: 500,
});
