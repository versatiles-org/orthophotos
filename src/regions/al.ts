import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { downloadFile, runCommand } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { computeWmsBlocks, generateWmsXml, parseWmsCapabilities } from '../lib/wms.ts';
import { runVersatilesRasterConvert } from '../run/commands.ts';

const WMS_URL = 'https://geoportal.asig.gov.al/service/wms';
const LAYER = 'orthophoto_2015:OrthoImagery_20cm';
const ZOOM = 17;

export default defineTileRegion({
	name: 'al',
	meta: {
		status: 'success',
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
		const maskedPath = join(tempDir, `${item.id}_masked.tif`);

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

			// White background → transparent
			await runCommand('gdal', ['raster', 'edit', '--nodata', '255', tifPath]);
			await runCommand('gdal_translate', [
				'-q',
				'-b',
				'1',
				'-b',
				'2',
				'-b',
				'3',
				'-b',
				'mask',
				'-colorinterp_4',
				'alpha',
				tifPath,
				maskedPath,
			]);

			return { srcPath: maskedPath };
		} catch (err) {
			try {
				rmSync(maskedPath, { force: true });
			} catch {}
			throw err;
		} finally {
			try {
				rmSync(tifPath, { force: true });
			} catch {}
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
	minFiles: 123456,
});
