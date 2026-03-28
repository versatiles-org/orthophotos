import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { downloadFile, runCommand } from '../lib/command.ts';
import { safeRm } from '../lib/fs.ts';
import { MAX_ZOOM } from '../lib/constants.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { computeWmsBlocks, generateWmsXml, parseWmsCapabilities } from '../lib/wms.ts';
import { runMosaicTile } from '../run/commands.ts';

const WMS_URL = 'https://wms.ngi.be/inspire/ortho/service';
const LAYER = 'orthoimage_coverage';

export default defineTileRegion({
	name: 'be',
	meta: {
		status: 'scraping',
		notes: ['License requires attribution.', 'JPEG2000 without alpha channel'],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'National Geographic Institute (NGI) of Belgium',
			url: 'https://www.ngi.be/en',
		},
		date: '2024',
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
	downloadLimit: 2,
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

			return { srcPath: tifPath };
		} catch (err) {
			safeRm(tifPath);
			throw err;
		}
	},
	convert: async ({ srcPath }, { dest }) => {
		try {
			await runMosaicTile(srcPath as string, dest);
		} finally {
			safeRm(srcPath as string);
		}
	},
	minFiles: 500,
});
