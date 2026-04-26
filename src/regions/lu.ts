import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
	computeWmsBlocks,
	defineTileRegion,
	downloadFile,
	extractWmsBlock,
	generateWmsXml,
	MAX_ZOOM,
	parseWmsCapabilities,
	runMosaicTile,
	safeRm,
	withRetry,
} from './lib.ts';

// GML source: https://download.data.public.lu/resources/inspire-annex-ii-theme-orthoimagery-orthoimagecoverage-2025-summer/20260324-074957/oi.ortho-rgb-2025-summer.gml
const WMS_URL = 'https://wms.geoportail.lu/opendata/service';
const LAYER = 'ortho_2025';

export default defineTileRegion({
	name: 'lu',
	meta: {
		status: 'released',
		notes: ['JP2 download is corrupt; using WMS instead.'],
		entries: ['result'],
		license: {
			name: 'CC0',
			url: 'https://creativecommons.org/publicdomain/zero/1.0/',
			requiresAttribution: false,
		},
		creator: {
			name: 'Administration du Cadastre et de la Topographie',
			url: 'https://data.public.lu/fr/datasets/orthophoto-officielle-du-grand-duche-de-luxembourg-edition-ete-2025/',
		},
		date: '2025',
		releaseDate: '2026-03-25',
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

		const { bbox, maxWidth, maxHeight } = await parseWmsCapabilities(capsPath, LAYER);
		const { items, blockPx } = computeWmsBlocks(bbox, MAX_ZOOM, maxWidth, maxHeight);
		console.log(`  ${items.length} blocks at ${blockPx}x${blockPx}px`);

		return items.map((item) => ({ ...item, wmsXmlPath, blockPx }));
	},
	downloadLimit: 2,
	download: async (item, { tempDir }) => {
		const tifPath = join(tempDir, `${item.id}.tif`);

		await extractWmsBlock(
			{ wmsXmlPath: item.wmsXmlPath, x0: item.x0, y0: item.y0, x1: item.x1, y1: item.y1, blockPx: item.blockPx },
			tifPath,
		);

		return { srcPath: tifPath };
	},
	convert: async ({ srcPath }, { dest }) => {
		await runMosaicTile(srcPath, dest, { nodata: '255,255,255' });
		safeRm(srcPath);
	},
	minFiles: 50,
});
