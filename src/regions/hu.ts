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
} from '../lib/region-api.ts';

// Lechner Tudásközpont (formerly FÖMI) INSPIRE View Service for the 2022
// orthophoto coverage of Hungary. The same INSPIRE record explicitly licenses
// the dataset as CC BY 4.0 with INSPIRE "noLimitations" public access.
const WMS_URL = 'https://inspire.lechnerkozpont.hu/geoserver/OI.2022/wms';
const LAYER = 'OrthoimageCoverage2022';

interface HuItem extends WmsBlockItem {
	wmsXmlPath: string;
	blockPx: number;
}

export default defineTileRegion<HuItem, { srcPath: string }>({
	name: 'hu',
	meta: {
		status: 'scraping',
		notes: [
			'INSPIRE View Service for the 2022 national orthophoto, served by Lechner Tudásközpont (formerly FÖMI).',
			'Source data: 40 cm RGB orthophoto from the 2022 capture.',
			'Licence is CC BY 4.0 with INSPIRE "noLimitations" public access (per https://inspire-geoportal.ec.europa.eu/srv/api/records/orto2022m-2e5d-474c-9de5-910a2e8edd62).',
			'Native CRS is EPSG:23700 (HD72 / EOV — Hungarian National Grid); the server also exposes EPSG:3857 directly.',
			"Server speaks WMS 1.3.0 only — GDAL's WMS driver handles the SRS→CRS rename transparently.",
		],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'Lechner Tudásközpont (formerly FÖMI)',
			url: 'https://lechnerkozpont.hu/',
		},
		date: '2022',
		mask: true,
	},
	init: async (ctx) => {
		const capsPath = join(ctx.tempDir, 'caps.xml');
		if (!existsSync(capsPath)) {
			console.log('  Fetching WMS capabilities...');
			await withRetry(() => downloadFile(`${WMS_URL}?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.3.0`, capsPath), {
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
	// Lechner runs national infrastructure shared across users; 2 streams keeps
	// us a polite peer.
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
	// Hungary ≈ 93,000 km². At MAX_ZOOM=17 with 8192-px blocks (~10 km wide in
	// 3857 units) we expect a few hundred land blocks. Tighten this once the
	// first run gives a real count.
	minFiles: 300,
});
