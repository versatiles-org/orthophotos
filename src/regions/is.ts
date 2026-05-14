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

// Náttúrufræðistofnun (Icelandic Institute of Natural History — formerly Landmælingar
// Íslands / LMÍ) publishes a public mapcache WMS pre-projected to EPSG:3857. The
// `grunnkort-loftmynd` layer is the national colour orthophoto basemap.
const WMS_URL = 'https://gis.lmi.is/mapcache/web-mercator/wms';
const LAYER = 'grunnkort-loftmynd';

interface IsItem extends WmsBlockItem {
	wmsXmlPath: string;
	blockPx: number;
}

export default defineTileRegion<IsItem, { srcPath: string }>({
	name: 'is',
	meta: {
		status: 'blocked',
		notes: [
			'Mapcache WMS published by Náttúrufræðistofnun (formerly Landmælingar Íslands / LMÍ) at https://gis.lmi.is/mapcache/web-mercator/wms (CC BY 4.0 per https://www.natt.is/en/resources/open-data and Iceland Act 45/2018) — reachable, returns alpha-correct PNGs.',
			'Blocked because the layer is not national coverage: a full-extent render of `grunnkort-loftmynd` shows orthophoto only over the NE quarter plus two small patches in the SW (Reykjavík, most of the central highlands, the W and S coasts have no data). The same partial extent is mirrored on the geoserver endpoint `https://gis.lmi.is/geoserver/wms` (layer `loftmyndir:grunnkort_loftmynd_nidurhal`); a national mosaic simply does not exist in either endpoint today.',
			'The geoserver also advertises wider-sounding layers (`loftmyndir:loftmyndir_natt_stakar_group`, `loftmyndir:loftmyndir_hnitsettar`) but `GetMap` against them returns a Java NullPointerException — the layers are listed but not actually served.',
			'Re-evaluate when Náttúrufræðistofnun extends `grunnkort-loftmynd` to national coverage, or publishes a separate full-Iceland orthophoto layer. The init/download/convert code below is kept intact so the partial coverage can be exercised again the moment that happens.',
			'Mapcache server caps GetMap at 4096 px per dimension — if reactivated, init should pass `computeWmsBlocks(bbox, MAX_ZOOM, 4096, 4096)` instead of relying on the (unadvertised) 8192 default.',
		],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'Náttúrufræðistofnun (formerly Landmælingar Íslands)',
			url: 'https://www.natt.is/',
		},
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
	// Mapcache hands out pre-rendered tiles, but it's still shared infrastructure
	// for a small institute; 2 streams keeps us a polite peer.
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
	// Iceland ≈ 103,000 km². At MAX_ZOOM=17 with 8192-px blocks (~10 km wide in 3857
	// units) we expect a few hundred land blocks. Tighten this once the first run
	// gives a real count.
	minFiles: 200,
});
