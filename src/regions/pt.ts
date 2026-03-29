import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { downloadFile } from '../lib/command.ts';
import { safeRm } from '../lib/fs.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { isValidRaster } from '../lib/validators.ts';
import { convertToTiledTiff, runMosaicTile } from '../run/commands.ts';

const OGC_API_MAP_URL = 'https://ogcapi.dgterritorio.gov.pt/collections/ortos-rgb/map';
const CRS_3857 = 'http://www.opengis.net/def/crs/EPSG/0/3857';

// Bounding box in EPSG:3857 covering continental Portugal
const XMIN = -1135000;
const YMIN = 4406000;
const XMAX = -636000;
const YMAX = 5203000;

const BLOCK_SIZE = 5000; // 5km blocks in meters
const BLOCK_PX = 4096; // pixels per block

interface GridItem {
	id: string;
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	[key: string]: unknown;
}

function generateGrid(): GridItem[] {
	const items: GridItem[] = [];
	for (let x0 = XMIN; x0 < XMAX; x0 += BLOCK_SIZE) {
		for (let y0 = YMIN; y0 < YMAX; y0 += BLOCK_SIZE) {
			const x1 = x0 + BLOCK_SIZE;
			const y1 = y0 + BLOCK_SIZE;
			const id = `${x0}_${y0}`.replace(/-/g, 'm'); // Replace negative sign with 'm' for better readability
			items.push({ id, x0, y0, x1, y1 });
		}
	}
	return items;
}

function buildTileUrl(item: GridItem): string {
	return `${OGC_API_MAP_URL}?f=png&bbox=${item.x0},${item.y0},${item.x1},${item.y1}&width=${BLOCK_PX}&height=${BLOCK_PX}&bbox-crs=${encodeURIComponent(CRS_3857)}`;
}

export default defineTileRegion({
	name: 'pt',
	meta: {
		status: 'released',
		notes: [
			'No WMS available; uses OGC API Maps endpoint.',
			'Server returns PNG tiles that need georeferencing.',
			'Resolution is ~1.2m/px at zoom 17.',
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
		date: '2018-2023',
		releaseDate: '2026-03-29',
		mask: true,
		maskBuffer: 3000,		
	},
	init: async () => {
		const items = generateGrid();
		console.log(`  Generated ${items.length} grid cells`);
		return items;
	},
	downloadLimit: 2,
	download: async (item, { tempDir, skipDest, errors }) => {
		const pngPath = join(tempDir, `${item.id}.png`);
		const tifPath = join(tempDir, `${item.id}.tif`);
		const url = buildTileUrl(item);

		await withRetry(() => downloadFile(url, pngPath, { minSize: 500 }), { maxAttempts: 3 });

		// Empty tiles (outside Portugal) are ~2KB; real imagery is >10KB
		const { statSync, writeFileSync } = await import('node:fs');
		if (statSync(pngPath).size < 10000) {
			safeRm(pngPath);
			writeFileSync(skipDest, '');
			return 'empty';
		}

		// The PNG has no georeference — create a GeoTIFF with the correct extent
		await convertToTiledTiff(pngPath, tifPath, {
			expand: 'rgba',
			srs: 'EPSG:3857',
			ullr: [item.x0, item.y1, item.x1, item.y0],
		});
		rmSync(pngPath, { force: true });

		if (!(await isValidRaster(tifPath))) {
			errors.add(`${item.id}.tif (${url})`);
			return 'invalid';
		}

		return { tifPath };
	},
	convert: async ({ tifPath }, { dest }) => {
		await runMosaicTile(tifPath, dest);
		safeRm(tifPath);
	},
	minFiles: 500,
});
