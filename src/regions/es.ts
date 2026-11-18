import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
	computeWmsBlocks,
	defineTileRegion,
	extractWmsBlock,
	generateWmsXml,
	isValidRaster,
	runMosaicTile,
	type WmsBbox,
	type WmsBlockItem,
	withRetry,
} from '../lib/index.ts';

// PNOA Máxima Actualidad — the always-current orthophoto layer published by IGN
// as part of the Spanish Sistema Cartográfico Nacional. INSPIRE-compliant WMS
// at MaxWidth/Height=4096; the layer also returns Sentinel-2 fallback below
// roughly zoom 12 (well below our MAX_ZOOM=17, so we always receive PNOA).
const WMS_URL = 'https://www.ign.es/wms-inspire/pnoa-ma';
const LAYER = 'OI.OrthoimageCoverage';

// Spain's territorial extent in EPSG:3857 — mainland + Balearics + Canary
// Islands + Ceuta + Melilla. Derived from the layer's EPSG:4080 bbox of
// (-19,27,5,44) reprojected and padded outward. `mask: true` clips the final
// result to the NUTS-Spain polygon so any Sentinel-2 fallback pixels along the
// margin (areas outside PNOA coverage) get trimmed away.
const BBOX: WmsBbox = {
	xmin: -2120000,
	ymin: 3120000,
	xmax: 600000,
	ymax: 5475000,
};

interface EsItem extends WmsBlockItem {
	wmsXmlPath: string;
	blockPx: number;
}

export default defineTileRegion<EsItem, { srcPath: string }>({
	name: 'es',
	meta: {
		status: 'blocked',
		notes: [
			'PNOA Máxima Actualidad (always-current national orthophoto) by IGN and CNIG, licensed CC BY 4.0.',
			'Source data: 25 cm in most regions, finer in some. All of Spain is flown every 3 years, in annual blocks.',
			'Bulk downloads are offered through the cart of the CNIG download centre (registration required; "Añadir todos" adds a whole series), which is downloaded with a Java desktop application (Open Web Start), or on SATA disks for a fee (CNIG, November 2026). Neither fits a fully automated pipeline, and CNIG asks that all downloads follow its download procedure.',
			'Melilla coverage is from Pléiades Neo © Airbus DS (2022) under the same redistribution terms.',
			'Re-evaluate if IGN or CNIG offer a bulk download that can be automated, such as an Atom feed, an HTTP listing or S3.',
		],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'Instituto Geográfico Nacional / Sistema Cartográfico Nacional',
			url: 'http://www.scne.es/',
		},
		date: '2022-2025',
		mask: true,
	},
	init: async (ctx) => {
		const wmsXmlPath = join(ctx.tempDir, 'wms.xml');
		if (!existsSync(wmsXmlPath)) {
			await generateWmsXml(WMS_URL, LAYER, wmsXmlPath);
		}

		const { items, blockPx } = computeWmsBlocks(BBOX, ctx.maxZoom, 4096, 4096);
		console.log(`  ${items.length} blocks at ${blockPx}x${blockPx}px`);

		return items.map((item) => ({ ...item, wmsXmlPath, blockPx }));
	},
	// IGN's WMS is sturdy but it's national infrastructure shared by all of Spain;
	// 2 streams keeps us a polite peer.
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
	convert: async ({ srcPath }, { dest, maxZoom }) => {
		await runMosaicTile(srcPath, dest, { maxZoom });
	},
	// Spain ≈ 506k km². At MAX_ZOOM=17 with 4096-px blocks (each ~1.9 km wide at
	// Spain's latitude) we expect a few thousand blocks after marine/no-coverage
	// trimming. Tighten this once the first full run gives a concrete count.
	minFiles: 3000,
});
