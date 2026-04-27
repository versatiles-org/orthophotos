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
} from './lib.ts';

const WMS_URL = 'https://wms.ngi.be/inspire/ortho/service';
const LAYER = 'orthoimage_coverage';

interface BeItem extends WmsBlockItem {
	wmsXmlPath: string;
	blockPx: number;
}

export default defineTileRegion<BeItem, { srcPath: string }>({
	name: 'be',
	meta: {
		status: 'released',
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
		releaseDate: '2026-03-29',
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
