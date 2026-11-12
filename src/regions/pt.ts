import { join } from 'node:path';
import {
	computeWmsBlocks,
	convertToTiledTiff,
	defineTileRegion,
	downloadFile,
	isValidRaster,
	runMosaicTile,
	type WmsBbox,
	type WmsBlockItem,
	withRetry,
} from '../lib/index.ts';

const OGC_API_MAP_URL = 'https://ogcapi.dgterritorio.gov.pt/collections/ortos-rgb/map';
const CRS_3857 = 'http://www.opengis.net/def/crs/EPSG/0/3857';

// Bounding box in EPSG:3857 covering continental Portugal
const BBOX: WmsBbox = { xmin: -1135000, ymin: 4406000, xmax: -636000, ymax: 5203000 };

/**
 * Pixels per request. The blocks are sized for the region's zoom, so each request already has
 * the resolution the tiles need. The old fixed 5 km blocks at 4096 px asked for 1.22 m per
 * pixel, half of zoom 17, although the source has 30 cm.
 */
const MAX_BLOCK_PX = 4096;

interface PtItem extends WmsBlockItem {
	blockPx: number;
}

function buildTileUrl(item: PtItem): string {
	return `${OGC_API_MAP_URL}?f=png&bbox=${item.x0},${item.y0},${item.x1},${item.y1}&width=${item.blockPx}&height=${item.blockPx}&bbox-crs=${encodeURIComponent(CRS_3857)}`;
}

export default defineTileRegion({
	name: 'pt',
	meta: {
		status: 'released',
		notes: [
			'No WMS available; uses OGC API Maps endpoint.',
			'Server returns PNG tiles that need georeferencing.',
			'Source: OrtoSat 2023, a 30 cm satellite mosaic of continental Portugal.',
		],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'Direção-Geral do Território',
			url: 'https://ogcapi.dgterritorio.gov.pt/collections/ortos-rgb',
		},
		date: '2023',
		resolution: 30,
		checked: '2026-11-12',
		releaseDate: '2026-03-29',
		mask: true,
		maskBuffer: 3000,
	},
	init: async (ctx) => {
		const { items, blockPx } = computeWmsBlocks(BBOX, ctx.maxZoom, MAX_BLOCK_PX, MAX_BLOCK_PX);
		console.log(`  ${items.length} blocks at ${blockPx}x${blockPx}px`);
		return items.map((item): PtItem => ({ ...item, blockPx }));
	},
	downloadLimit: 2,
	download: async (item, ctx) => {
		const pngPath = ctx.tempFile(join(ctx.tempDir, `${item.id}.png`));
		const tifPath = ctx.tempFile(join(ctx.tempDir, `${item.id}.tif`));
		const url = buildTileUrl(item);

		await withRetry(() => downloadFile(url, pngPath, { minSize: 500 }), { maxAttempts: 3 });

		// Empty tiles (outside Portugal) are ~2KB; real imagery is >10KB.
		// Persist a `.skip` marker since the grid is fixed — re-running won't fill these.
		const { statSync, writeFileSync } = await import('node:fs');
		if (statSync(pngPath).size < 10000) {
			writeFileSync(ctx.skipDest, '');
			return 'empty';
		}

		// The PNG has no georeference — create a GeoTIFF with the correct extent
		await convertToTiledTiff(pngPath, tifPath, {
			expand: 'rgba',
			srs: 'EPSG:3857',
			ullr: [item.x0, item.y1, item.x1, item.y0],
		});

		if (!(await isValidRaster(tifPath))) {
			ctx.errors.add(`${item.id}.tif (${url})`);
			return 'invalid';
		}

		return { tifPath };
	},
	convert: async ({ tifPath }, { dest, maxZoom }) => {
		await runMosaicTile(tifPath, dest, { maxZoom });
	},
	// About 25,000 of the 67,035 blocks at zoom 17 contain imagery.
	minFiles: 20000,
});
