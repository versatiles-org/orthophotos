import { existsSync } from 'node:fs';
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
	MAX_ZOOM,
	parseWmsCapabilities,
	runMosaicTile,
	type WmsBbox,
	type WmsBlockItem,
	withRetry,
} from '../lib/region-api.ts';

const WMS_URL = 'http://inspire.mzh.government.bg:8080/geoserver/ows';

// One layer per capture year. Listed oldest → newest so the alpha-aware composite
// in `convert` lets newer years overlay older ones via gdalwarp's `-srcalpha`.
// Each layer only covers part of the country; the stack provides full coverage.
// `Orthoimagery_2025_TB` is a small SE strip that the regular `Orthoimagery_2025`
// (north only) doesn't reach, so it goes last to overlay anything beneath it.
const YEAR_LAYERS = [
	'RasterData:Orthoimagery_2020',
	'RasterData:Orthoimagery_2021',
	'RasterData:Orthoimagery_2022',
	'RasterData:Orthoimagery_2023',
	'RasterData:Orthoimagery_2024',
	'RasterData:Orthoimagery_2025',
	'RasterData:Orthoimagery_2025_TB',
];

interface YearLayer {
	layer: string;
	wmsXmlPath: string;
	bbox: WmsBbox;
}

interface BgItem extends WmsBlockItem {
	years: YearLayer[];
	blockPx: number;
}

export default defineTileRegion<BgItem, { id: string; tifPaths: string[] }>({
	name: 'bg',
	meta: {
		status: 'scraping',
		notes: [
			'Only WMS available.',
			'Server is slow.',
			'Multiple years (2020-2025) fetched per block and composited locally.',
			'GeoServer rejects multi-layer GetMap (returns transparent), so each year is fetched on its own and merged via `gdalwarp -srcalpha`. Per-block fetch cost scales with the number of overlapping years (1–7).',
			'`format=image/png&transparent=TRUE` makes the per-year alpha band the coverage mask, so no separate `nodata: 255,255,255` step is needed.',
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
		const capsPath = join(ctx.tempDir, 'caps.xml');
		if (!existsSync(capsPath)) {
			console.log('  Fetching WMS capabilities...');
			await withRetry(() => downloadFile(`${WMS_URL}?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0`, capsPath), {
				maxAttempts: 3,
			});
		}

		const yearLayers: YearLayer[] = [];
		let unionBbox: WmsBbox | undefined;
		for (const layer of YEAR_LAYERS) {
			const wmsXmlPath = join(ctx.tempDir, `wms-${layer.replace(/^.*:/, '')}.xml`);
			if (!existsSync(wmsXmlPath)) {
				await generateWmsXml(WMS_URL, layer, wmsXmlPath);
			}
			const { bbox } = await parseWmsCapabilities(capsPath, layer);
			yearLayers.push({ layer, wmsXmlPath, bbox });
			unionBbox = unionBbox
				? {
						xmin: Math.min(unionBbox.xmin, bbox.xmin),
						ymin: Math.min(unionBbox.ymin, bbox.ymin),
						xmax: Math.max(unionBbox.xmax, bbox.xmax),
						ymax: Math.max(unionBbox.ymax, bbox.ymax),
					}
				: { ...bbox };
		}
		if (!unionBbox) throw new Error('bg: no year layers resolved');

		// MaxWidth/MaxHeight default to 8192 when the server doesn't advertise.
		const { items, blockPx } = computeWmsBlocks(unionBbox, MAX_ZOOM, 8192, 8192);

		const bgItems: BgItem[] = [];
		for (const item of items) {
			const blockBbox: WmsBbox = { xmin: item.x0, ymin: item.y0, xmax: item.x1, ymax: item.y1 };
			const overlapping = yearLayers.filter((yl) => bboxesOverlap(yl.bbox, blockBbox));
			if (overlapping.length === 0) continue;
			bgItems.push({ ...item, years: overlapping, blockPx });
		}
		console.log(
			`  ${bgItems.length} blocks at ${blockPx}x${blockPx}px (skipped ${items.length - bgItems.length} outside any year layer)`,
		);

		return bgItems;
	},
	downloadLimit: 2,
	download: async (item, ctx) => {
		const tifPaths: string[] = [];
		for (const year of item.years) {
			const tifPath = ctx.tempFile(join(ctx.tempDir, `${item.id}_${year.layer.replace(/^.*:/, '')}.tif`));
			try {
				await withRetry(
					() =>
						extractWmsBlock(
							{
								wmsXmlPath: year.wmsXmlPath,
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
			} catch (err) {
				// GeoServer throws `java.awt.image.RasterFormatException: x lies outside the raster`
				// for blocks that fall just outside an internal source raster's actual data extent
				// (the layer-level EX_GeographicBoundingBox is a loose envelope, not a true mask).
				// Treat as "no data for this year here" and let the other overlapping years cover it.
				const msg = err instanceof Error ? err.message : String(err);
				if (msg.includes('RasterFormatException')) continue;
				throw err;
			}
			if (!(await isValidRaster(tifPath))) {
				ctx.errors.add(`${item.id}_${year.layer}.tif`);
				continue;
			}
			tifPaths.push(tifPath);
		}
		if (tifPaths.length === 0) return 'empty';
		return { id: item.id, tifPaths };
	},
	convert: async ({ id, tifPaths }, ctx) => {
		if (tifPaths.length === 1) {
			await runMosaicTile(tifPaths[0], ctx.dest);
			return;
		}
		const compositePath = ctx.tempFile(join(ctx.tempDir, `${id}_composite.tif`));
		await compositeRastersWithAlpha(tifPaths, compositePath);
		await runMosaicTile(compositePath, ctx.dest);
	},
	minFiles: 500,
});
