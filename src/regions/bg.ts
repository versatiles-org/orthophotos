import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runCommand } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { computeWmsBlocks, generateWmsXml, type WmsBbox } from '../lib/wms.ts';
import { runMosaicTile } from '../run/commands.ts';

const WMS_URL = 'http://inspire.mzh.government.bg:8080/geoserver/ows';

// Stack all years newest-first — GeoServer composites layers in order (first on top)
const LAYERS = [
	'RasterDataSet:Orthoimagery_2025',
	'RasterDataSet:Orthoimagery_2024',
	'RasterDataSet:Orthoimagery_2023',
	'RasterDataSet:Orthoimagery_2022',
	'RasterDataSet:Orthoimagery_2021',
	'RasterDataSet:Orthoimagery_2020',
].join(',');

const ZOOM = 17;

// Union bounding box covering all years (EPSG:3857), derived from LatLonBoundingBox of all layers
const BBOX: WmsBbox = {
	xmin: 2479000, // ~lon 22.27
	ymin: 5020000, // ~lat 41.14
	xmax: 3190000, // ~lon 28.66
	ymax: 5510000, // ~lat 44.33
};

export default defineTileRegion({
	name: 'bg',
	meta: {
		status: 'scraping',
		notes: [
			'Only WMS available.',
			'Server is slow.',
			'Multiple years (2020-2025) stacked to achieve full coverage.',
			'Nodata value is 255,255,255.',
		],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'Министерство на земеделието и храните',
			url: 'https://www.mzh.government.bg/bg/politiki-i-programi/programi-za-finansirane/direktni-plashaniya/cifrova-ortofotokarta/',
		},
		date: '2020-2025',
	},
	init: async (ctx) => {
		const wmsXmlPath = join(ctx.tempDir, 'wms.xml');
		if (!existsSync(wmsXmlPath)) {
			await generateWmsXml(WMS_URL, LAYERS, wmsXmlPath);
		}

		// maxWidth/maxHeight default to 8192 when not set by server
		const { items, blockPx } = computeWmsBlocks(BBOX, ZOOM, 8192, 8192);
		console.log(`  ${items.length} blocks at ${blockPx}x${blockPx}px`);

		return items.map((item) => ({ ...item, wmsXmlPath, blockPx }));
	},
	downloadConcurrency: 2,
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
			try {
				rmSync(tifPath, { force: true });
			} catch {}
			throw err;
		}
	},
	convert: async ({ srcPath }, { dest }) => {
		try {
			await runMosaicTile(srcPath as string, dest, { nodata: '255,255,255' });
		} finally {
			try {
				rmSync(srcPath as string, { force: true });
			} catch {}
		}
	},
	minFiles: 500,
});
