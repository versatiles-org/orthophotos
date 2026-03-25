import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { downloadFile } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { isValidRaster } from '../lib/validators.ts';
import { runMosaicTile } from '../run/commands.ts';

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
	for (let x = XMIN; x < XMAX; x += BLOCK_SIZE) {
		for (let y = YMIN; y < YMAX; y += BLOCK_SIZE) {
			const x1 = x + BLOCK_SIZE;
			const y1 = y + BLOCK_SIZE;
			items.push({ id: `${x}_${y}`, x0: x, y0: y, x1, y1 });
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
		status: 'scraping',
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
	},
	init: async () => {
		const items = generateGrid();
		console.log(`  Generated ${items.length} grid cells`);
		return items;
	},
	downloadConcurrency: 2,
	download: async (item, { tempDir, errors }) => {
		const pngPath = join(tempDir, `${item.id}.png`);
		const tifPath = join(tempDir, `${item.id}.tif`);
		const url = buildTileUrl(item);

		try {
			await withRetry(() => downloadFile(url, pngPath, { minSize: 500 }), { maxAttempts: 3 });

			// The PNG has no georeference — create a GeoTIFF with the correct extent
			const { runCommand } = await import('../lib/command.ts');
			await runCommand('gdal_translate', [
				'-q',
				'-of',
				'GTiff',
				'-expand',
				'rgb',
				'-a_srs',
				'EPSG:3857',
				'-a_ullr',
				String(item.x0),
				String(item.y1),
				String(item.x1),
				String(item.y0),
				'-co',
				'TILED=YES',
				pngPath,
				tifPath,
			]);
			rmSync(pngPath, { force: true });

			if (!(await isValidRaster(tifPath))) {
				errors.add(`${item.id}.tif (${url})`);
				return 'invalid';
			}

			return { tifPath };
		} catch (err) {
			for (const p of [pngPath, tifPath]) {
				try {
					rmSync(p, { force: true });
				} catch {}
			}
			throw err;
		}
	},
	convert: async ({ tifPath }, { dest }) => {
		try {
			await runMosaicTile(tifPath, dest);
		} finally {
			try {
				rmSync(tifPath, { force: true });
			} catch {}
		}
	},
	minFiles: 500,
});
