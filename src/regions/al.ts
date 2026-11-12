import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	bboxesOverlap,
	compositeRastersWithAlpha,
	computeWmsBlocks,
	defineTileRegion,
	downloadFile,
	extractWmsBlock,
	generateWmsXml,
	isValidRaster,
	maskWhiteBackgroundFile,
	parseWmsCapabilities,
	runMosaicTile,
	type WmsBbox,
	type WmsBlockItem,
	withRetry,
} from '../lib/index.ts';

/** National coverage: 2015 at 20 cm. */
const WMS_URL = 'https://geoportal.asig.gov.al/service/orthophoto_2015/wms';
const LAYER = 'OrthoImagery_20cm';

/**
 * 2018 at 8 cm, only for a rectangle around Tirana and Durrës (about 1,100 km²). Laid over 2015
 * per WMS block before tiling, so every tile is compressed lossily only once. Inside its extent
 * the layer fills the area without imagery with opaque white, which is masked first.
 */
const WMS_URL_2018 = 'https://geoportal.asig.gov.al/service/ortofoto_2018/wms';
const LAYER_2018 = 'Ortofoto_2018';

interface AlItem extends WmsBlockItem {
	wmsXmlPath: string;
	blockPx: number;
	/** Set for blocks that touch the 2018 layer. */
	wmsXmlPath2018?: string;
}

interface AlDownload {
	id: string;
	srcPath: string;
	/** The masked 2018 block, if the block touches the 2018 layer and it has data there. */
	overlayPath?: string;
}

/** Fetches one block of a WMS layer; `false` if the WMS returned no raster (outside coverage). */
async function fetchBlock(item: AlItem, wmsXmlPath: string, tifPath: string): Promise<boolean> {
	await withRetry(
		() =>
			extractWmsBlock(
				{ wmsXmlPath, x0: item.x0, y0: item.y0, x1: item.x1, y1: item.y1, blockPx: item.blockPx },
				tifPath,
			),
		{ maxAttempts: 3 },
	);
	return isValidRaster(tifPath);
}

export default defineTileRegion<AlItem, AlDownload>({
	name: 'al',
	meta: {
		status: 'released',
		notes: [
			'Only WMS found.',
			'Server is very slow.',
			'Full coverage only for 2015; 2018 at 8 cm is laid over it around Tirana and Durrës.',
		],
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
		date: '2015-2018',
		resolution: 8,
		checked: '2026-11-12',
		releaseDate: '2026-05-01',
	},
	init: async (ctx) => {
		const capsPath = join(ctx.tempDir, 'caps.xml');
		const capsPath2018 = join(ctx.tempDir, 'caps-2018.xml');
		for (const [url, path] of [
			[WMS_URL, capsPath],
			[WMS_URL_2018, capsPath2018],
		]) {
			if (!existsSync(path)) {
				console.log(`  Fetching WMS capabilities of ${url}...`);
				await withRetry(() => downloadFile(`${url}?service=WMS&request=GetCapabilities&version=1.1.1`, path), {
					maxAttempts: 3,
				});
			}
		}

		const wmsXmlPath = join(ctx.tempDir, 'wms.xml');
		if (!existsSync(wmsXmlPath)) await generateWmsXml(WMS_URL, LAYER, wmsXmlPath);
		const wmsXmlPath2018 = join(ctx.tempDir, 'wms-2018.xml');
		if (!existsSync(wmsXmlPath2018)) await generateWmsXml(WMS_URL_2018, LAYER_2018, wmsXmlPath2018);

		const { bbox, maxWidth, maxHeight } = await parseWmsCapabilities(capsPath, LAYER);
		const { bbox: bbox2018 } = await parseWmsCapabilities(capsPath2018, LAYER_2018);
		const { items, blockPx } = computeWmsBlocks(bbox, ctx.maxZoom, maxWidth, maxHeight);

		const alItems = items.map((item): AlItem => {
			const blockBbox: WmsBbox = { xmin: item.x0, ymin: item.y0, xmax: item.x1, ymax: item.y1 };
			const overlay = bboxesOverlap(bbox2018, blockBbox) ? { wmsXmlPath2018 } : {};
			return { ...item, wmsXmlPath, blockPx, ...overlay };
		});
		const withOverlay = alItems.filter((item) => item.wmsXmlPath2018).length;
		console.log(`  ${alItems.length} blocks at ${blockPx}x${blockPx}px, ${withOverlay} of them with 2018 on top`);
		return alItems;
	},
	downloadLimit: 1,
	download: async (item, ctx) => {
		const tifPath = ctx.tempFile(join(ctx.tempDir, `${item.id}.tif`));
		// WMS returns an XML error blob (not a valid raster) for blocks outside coverage.
		// Persist a `.skip` marker since coverage is fixed — re-running won't change it.
		if (!(await fetchBlock(item, item.wmsXmlPath, tifPath))) {
			writeFileSync(ctx.skipDest, '');
			return 'empty';
		}
		if (!item.wmsXmlPath2018) return { id: item.id, srcPath: tifPath };

		const rawPath = ctx.tempFile(join(ctx.tempDir, `${item.id}_2018_raw.tif`));
		const overlayPath = ctx.tempFile(join(ctx.tempDir, `${item.id}_2018.tif`));
		if (!(await fetchBlock(item, item.wmsXmlPath2018, rawPath))) return { id: item.id, srcPath: tifPath };
		await maskWhiteBackgroundFile(rawPath, overlayPath);
		return { id: item.id, srcPath: tifPath, overlayPath };
	},
	convert: async ({ id, srcPath, overlayPath }, ctx) => {
		let source = srcPath;
		if (overlayPath) {
			// Lossless composite: 2015 underneath, the masked 2018 block on top.
			source = ctx.tempFile(join(ctx.tempDir, `${id}_composite.tif`));
			await compositeRastersWithAlpha([srcPath, overlayPath], source);
		}
		await runMosaicTile(source, ctx.dest, { maxZoom: ctx.maxZoom });
	},
	minFiles: 500,
});
