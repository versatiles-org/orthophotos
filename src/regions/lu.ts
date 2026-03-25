import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runCommand } from '../lib/command.ts';
import { MAX_ZOOM } from '../lib/constants.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { computeWmsBlocks, generateWmsXml, parseWmsCapabilities } from '../lib/wms.ts';
import { runMosaicTile } from '../run/commands.ts';
import { downloadFile } from '../lib/command.ts';
import { withRetry } from '../lib/retry.ts';

// GML source: https://download.data.public.lu/resources/inspire-annex-ii-theme-orthoimagery-orthoimagecoverage-2025-summer/20260324-074957/oi.ortho-rgb-2025-summer.gml
const WMS_URL = 'https://wms.geoportail.lu/opendata/service';
const LAYER = 'ortho_2025';

export default defineTileRegion({
	name: 'lu',
	meta: {
		status: 'scraping',
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
			await runMosaicTile(srcPath as string, dest);
		} finally {
			try {
				rmSync(srcPath as string, { force: true });
			} catch {}
		}
	},
	minFiles: 50,
});
