import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { downloadFile, runCommand } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { computeWmsBlocks, generateWmsXml, parseWmsCapabilities } from '../lib/wms.ts';
import { runVersatilesRasterConvert } from '../run/commands.ts';

const WMS_URL = 'http://www.geoportal.lt/arcgis/services/NZT/ORT10LT_Web_Mercator_102100/MapServer/WMSServer';
const LAYER = '0';
const ZOOM = 17;

export default defineTileRegion({
	name: 'lt',
	meta: {
		status: 'success',
		notes: [
			'Atom feed provides only proprietary data formats.',
			'Only WMS is usable.',
			'Server is very, very slow.',
			'No license information found.',
		],
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
		const { items, blockPx } = computeWmsBlocks(bbox, ZOOM, maxWidth, maxHeight);
		console.log(`  ${items.length} blocks at ${blockPx}x${blockPx}px`);

		return items.map((item) => ({ ...item, wmsXmlPath, blockPx }));
	},
	downloadConcurrency: 1,
	download: async (item, { tempDir }) => {
		const tifPath = join(tempDir, `${item.id}.tif`);

		try {
			await runCommand('gdal_translate', [
				'-q',
				item.wmsXmlPath as string,
				tifPath,
				'-projwin',
				String(item.x0),
				String(item.y1),
				String(item.x1),
				String(item.y0),
				'-projwin_srs',
				'EPSG:3857',
				'-outsize',
				String(item.blockPx),
				String(item.blockPx),
				'-of',
				'GTiff',
				'-co',
				'COMPRESS=DEFLATE',
				'-co',
				'PREDICTOR=2',
				'-co',
				'ALPHA=YES',
			]);

			// No mask color — pass TIF directly
			return { srcPath: tifPath };
		} catch (err) {
			try {
				rmSync(tifPath, { force: true });
			} catch {}
			throw err;
		}
	},
	convert: async ({ srcPath }, { dest }) => {
		try {
			await runVersatilesRasterConvert(srcPath as string, dest);
		} finally {
			try {
				rmSync(srcPath as string, { force: true });
			} catch {}
		}
	},
	minFiles: 10,
});
