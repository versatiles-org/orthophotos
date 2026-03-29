import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { downloadFile } from '../lib/command.ts';
import { safeRm } from '../lib/fs.ts';
import { MAX_ZOOM } from '../lib/constants.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { computeWmsBlocks, generateWmsXml, parseWmsCapabilities } from '../lib/wms.ts';
import { extractWmsBlock, runMosaicTile } from '../run/commands.ts';

const WMS_URL = 'https://geoportal.asig.gov.al/service/orthophoto_2015/wms';
const LAYER = 'OrthoImagery_20cm';

export default defineTileRegion({
	name: 'al',
	meta: {
		status: 'scraping',
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
		releaseDate: '2025-10-05',
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
	download: async (item, { tempDir, skipDest }) => {
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
		} catch {
			// WMS returns errors for blocks outside coverage — mark as empty
			safeRm(tifPath);
			const { writeFileSync } = await import('node:fs');
			writeFileSync(skipDest, '');
			return 'empty';
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
