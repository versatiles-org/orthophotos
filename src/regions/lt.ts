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
	withRetry,
} from '../lib/region-api.ts';

const WMS_URL = 'http://www.geoportal.lt/arcgis/services/NZT/ORT10LT_Web_Mercator_102100/MapServer/WMSServer';
const LAYER = '0';

export default defineTileRegion({
	name: 'lt',
	meta: {
		status: 'released',
		notes: [
			'Atom feed provides only proprietary data formats.',
			'Only WMS is usable.',
			'Server is very, very slow.',
			'No license information found.',
		],
		entries: ['result'],
		license: {
			name: 'CC0',
			url: 'https://creativecommons.org/publicdomain/zero/1.0/',
			requiresAttribution: false,
		},
		creator: {
			name: 'Nacionalinė žemės tarnyba prie Aplinkos ministerijos',
			url: 'https://www.geoportal.lt/geoportal/paieska',
		},
		date: '2019',
		releaseDate: '2025-10-06',
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

		// No mask color — pass TIF directly
		return { srcPath: tifPath };
	},
	convert: async ({ srcPath }, { dest }) => {
		await runMosaicTile(srcPath, dest);
	},
	minFiles: 123456,
});
