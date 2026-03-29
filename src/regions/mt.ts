import { join } from 'node:path';
import { downloadFile } from '../lib/command.ts';
import { safeRm } from '../lib/fs.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { convertToTiledTiff, runMosaicTile } from '../run/commands.ts';

/**
 * Malta WMS returns paletted PNG and does not support EPSG:3857.
 * We download in EPSG:4326, expand palette to RGB, georeference, and let
 * versatiles handle the reprojection via --crs.
 */
const WMS_BASE = 'https://malta.coverage.wetransform.eu/wms/ortho_2018/ows';
const LAYER = 'OI.OrthoimageCoverage';

/** Malta bbox in EPSG:4326 */
const BBOX = { xmin: 14.18, ymin: 35.8, xmax: 14.58, ymax: 36.08 };
const BLOCK_DEG = 0.043;
const BLOCK_PX = 4000;

interface MtItem {
	id: string;
	xmin: number;
	ymin: number;
	xmax: number;
	ymax: number;
	[key: string]: unknown;
}

interface MtDownload {
	pngPath: string;
	xmin: number;
	ymin: number;
	xmax: number;
	ymax: number;
}

function generateGrid(): MtItem[] {
	const items: MtItem[] = [];
	let col = 0;
	for (let x = BBOX.xmin; x < BBOX.xmax; x += BLOCK_DEG, col++) {
		let row = 0;
		for (let y = BBOX.ymin; y < BBOX.ymax; y += BLOCK_DEG, row++) {
			items.push({
				id: `${col}_${row}`,
				xmin: x,
				ymin: y,
				xmax: Math.min(x + BLOCK_DEG, BBOX.xmax),
				ymax: Math.min(y + BLOCK_DEG, BBOX.ymax),
			});
		}
		row = 0;
	}
	return items;
}

export default defineTileRegion<MtItem, MtDownload>({
	name: 'mt',
	meta: {
		status: 'released',
		notes: [
			'WMS returns paletted PNG',
			'low resolution and bad quality',
			'no EPSG:3857 support',
			'black border around the island',
		],
		entries: ['result'],
		license: {
			name: 'No limitations',
			url: 'https://inspire-geoportal.ec.europa.eu/srv/eng/catalog.search#/metadata/bb75c532-6846-4a74-8ef6-d097228dc6a4',
			requiresAttribution: false,
		},
		creator: {
			name: 'Malta Planning Authority',
			url: 'https://www.pa.org.mt/',
		},
		date: '2018',
		releaseDate: '2026-03-29',
	},
	init: () => generateGrid(),
	downloadLimit: 2,
	download: async (item, { tempDir }) => {
		const pngPath = join(tempDir, `${item.id}.png`);
		const url =
			`${WMS_BASE}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap` +
			`&LAYERS=${LAYER}&STYLES=default&SRS=EPSG:4326` +
			`&BBOX=${item.xmin},${item.ymin},${item.xmax},${item.ymax}` +
			`&WIDTH=${BLOCK_PX}&HEIGHT=${BLOCK_PX}&FORMAT=image/png&TRANSPARENT=TRUE`;

		await withRetry(() => downloadFile(url, pngPath), { maxAttempts: 3 });

		return { pngPath, xmin: item.xmin, ymin: item.ymin, xmax: item.xmax, ymax: item.ymax } satisfies MtDownload;
	},
	convert: async (data, { dest }) => {
		const tifPath = data.pngPath.replace(/\.png$/, '.tif');
		try {
			await convertToTiledTiff(data.pngPath, tifPath, {
				expand: 'rgb',
				srs: 'EPSG:4326',
				ullr: [data.xmin, data.ymax, data.xmax, data.ymin],
			});
			await runMosaicTile(tifPath, dest, { nodata: '0,0,0', crs: '4326' });
		} finally {
			safeRm(data.pngPath);
			safeRm(tifPath);
		}
	},
	minFiles: 70,
});
