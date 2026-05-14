import { existsSync } from 'node:fs';
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
} from '../lib/index.ts';

// State Geodetic Administration (Državna geodetska uprava, DGU) of Croatia.
// INSPIRE View Service for the 2022/23 LiDAR-based digital orthophoto: the
// "WMS for anonymous users" variant — no auth required.
const WMS_URL = 'https://geoportal.dgu.hr/services/inspire/orthophoto_lidar_2022_2023/wms';
const LAYER = 'OI.OrthoimageCoverage';

interface HrItem extends WmsBlockItem {
	wmsXmlPath: string;
	blockPx: number;
}

export default defineTileRegion<HrItem, { srcPath: string }>({
	name: 'hr',
	meta: {
		status: 'released',
		releaseDate: '2026-05-13',
		notes: [
			'INSPIRE View Service for Orthoimagery from the State Geodetic Administration (DGU).',
			'Source data: 25 cm RGB orthophoto from 2022–2023 multisensor aerial campaign.',
			'WMS only — DGU charges fees for bulk raster downloads (Pravilnik NN 59/2018), so the public WMS is the practical path.',
			'Native CRS is EPSG:3765 (HTRS96/TM); the server also accepts EPSG:3857 (verified by smoke-test).',
			'AccessConstraints in capabilities: "nema ograničenja javnom pristupu" (no limitations on public access). No explicit licence terms published — treated as freely usable per the INSPIRE Directive convention used elsewhere in this project (see `lt`, `cy`).',
		],
		entries: ['result'],
		license: {
			name: 'CC0',
			url: 'https://creativecommons.org/publicdomain/zero/1.0/',
			requiresAttribution: false,
		},
		creator: {
			name: 'Državna geodetska uprava (DGU)',
			url: 'https://geoportal.dgu.hr/',
		},
		date: '2022-2023',
		mask: true,
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
	// DGU's WMS is shared infrastructure; 2 streams keeps us a polite peer.
	downloadLimit: 2,
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
		return { srcPath: tifPath };
	},
	convert: async ({ srcPath }, { dest }) => {
		await runMosaicTile(srcPath, dest);
	},
	// Croatia ≈ 56,600 km². At MAX_ZOOM=17 with 8192-px blocks (~10 km wide in 3857
	// units) we expect a few hundred land blocks. Tighten this once the first run
	// gives a real count.
	minFiles: 200,
});
