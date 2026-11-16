import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	computeWmsBlocks,
	defineTileRegion,
	downloadFile,
	extractWmsBlock,
	filterBlocksByPolygon,
	generateWmsXml,
	isValidRaster,
	loadKnownRegions,
	parseWmsCapabilities,
	projectGeometry3857,
	runMosaicTile,
	withRetry,
} from '../lib/index.ts';

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../data');

const WMS_URL = 'http://www.geoportal.lt/arcgis/services/NZT/ORT10LT_Web_Mercator_102100/MapServer/WMSServer';
const LAYER = '0';

/**
 * The layer's bbox reaches from 17.2° to 29.8° E, so most blocks of its grid lie far outside
 * Lithuania. The WMS has imagery up to 10.7 km (EPSG:3857 metres) beyond the NUTS 1:3M outline,
 * measured on a 500 m overview in November 2026, so blocks within 12 km of it are kept.
 */
const OUTLINE_MARGIN = 12000;

export default defineTileRegion({
	name: 'lt',
	meta: {
		status: 'released',
		notes: [
			'Atom feed provides only proprietary data formats.',
			'Only WMS is usable.',
			'Server is very, very slow.',
			'No license information found.',
			'The national mosaic ORT10LT is patched every year: aerial imagery from 2022 to 2026, partly satellite imagery from 2024 to 2026 (per the flight-date layers of the same service).',
		],
		entries: ['result'],
		license: {
			name: 'CC0',
			url: 'https://creativecommons.org/publicdomain/zero/1.0/',
			requiresAttribution: false,
		},
		creator: {
			name: 'Nacionalinė žemės tarnyba prie Aplinkos ministerijos',
			url: 'https://www.geoportal.lt/geoportal/paieska',
		},
		date: '2022-2026',
		checked: '2026-11-12',
		releaseDate: '2025-10-06',
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
		const { items, blockPx } = computeWmsBlocks(bbox, ctx.maxZoom, maxWidth, maxHeight);

		const lithuania = loadKnownRegions(DATA_DIR).find((r) => r.properties.id === 'lt');
		if (!lithuania) throw new Error('NUTS geometry for lt not found');
		const inside = filterBlocksByPolygon(items, projectGeometry3857(lithuania.geometry), OUTLINE_MARGIN);
		console.log(
			`  ${inside.length} blocks at ${blockPx}x${blockPx}px (skipped ${items.length - inside.length} outside the lt outline)`,
		);

		return inside.map((item) => ({ ...item, wmsXmlPath, blockPx }));
	},
	download: async (item, ctx) => {
		const tifPath = ctx.tempFile(join(ctx.tempDir, `${item.id}.tif`));

		await withRetry(
			() =>
				extractWmsBlock(
					{ wmsXmlPath: item.wmsXmlPath, x0: item.x0, y0: item.y0, x1: item.x1, y1: item.y1, blockPx: item.blockPx },
					tifPath,
				),
			{ maxAttempts: 3 },
		);

		if (!(await isValidRaster(tifPath))) {
			ctx.errors.add(`${item.id}.tif`);
			return 'invalid';
		}

		// No mask color — pass TIF directly
		return { srcPath: tifPath };
	},
	convert: async ({ srcPath }, { dest, maxZoom }) => {
		await runMosaicTile(srcPath, dest, { maxZoom });
	},
	minFiles: 10000,
});
