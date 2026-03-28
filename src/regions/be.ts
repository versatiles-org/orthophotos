import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { downloadFile } from '../lib/command.ts';
import { safeRm } from '../lib/fs.ts';
import { MAX_ZOOM } from '../lib/constants.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { computeWmsBlocks, generateWmsXml, parseWmsCapabilities } from '../lib/wms.ts';
import { extractWmsBlock, runMosaicTile } from '../run/commands.ts';

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

		const { bbox } = await parseWmsCapabilities(capsPath, LAYER);
		// Server MaxWidth/MaxHeight is 4000 (from WMS 1.3.0 caps) but not advertised in 1.1.1
		const { items, blockPx } = computeWmsBlocks(bbox, MAX_ZOOM, 4000, 4000);
		console.log(`  ${items.length} blocks at ${blockPx}x${blockPx}px`);

		return items.map((item) => ({ ...item, wmsXmlPath, blockPx }));
	},
	downloadLimit: 2,
	download: async (item, { tempDir }) => {
		const tifPath = join(tempDir, `${item.id}.tif`);

		try {
			await withRetry(
				() =>
					extractWmsBlock(
						{
							wmsXmlPath: item.wmsXmlPath as string,
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
