import { existsSync, writeFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	bboxIntersectsPolygon,
	computeWmsBlocks,
	defineTileRegion,
	extractWmsBlock,
	isRasterAllZero,
	isValidRaster,
	loadKnownRegions,
	MAX_ZOOM,
	projectGeometry3857,
	runMosaicTile,
	type WmsBbox,
	type WmsBlockItem,
	withRetry,
} from '../lib/region-api.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../data');

// NLS Finland's open WMTS uses standard WGS84 Pseudo-Mercator (EPSG:3857) tiles
// that we wrap in a GDAL "TMS" config so `extractWmsBlock` (the same helper our
// other WMS-block scrapers use) can pull arbitrary pixel-bbox blocks via
// `gdal_translate -projwin`.
const TILE_TEMPLATE =
	'https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/ortokuva/default/WGS84_Pseudo-Mercator/${z}/${y}/${x}.jpg';

// API key for the NLS open interfaces. Per NLS docs the key is "user-specific";
// unlike the `dk` scraper (where the provider explicitly permits sharing), this
// key was registered for this project. Open data should not require credentials,
// but NLS gates the open interfaces behind a free, instant self-service signup
// at https://omatili.maanmittauslaitos.fi/user/new/avoimet-rajapintapalvelut?lang=en.
const API_KEY = 'b304eeb1-82ab-4b07-ae1c-b2c76d9dd427';

// Finland's extent in EPSG:3857 (lat 59°-70°N, lon 19°-32°E), rounded outward.
// Mainland Finland and Åland — covers all of NUTS-fi. The polygon-overlap filter
// in init removes blocks that don't actually touch the country.
const BBOX: WmsBbox = {
	xmin: 2110000,
	ymin: 8150000,
	xmax: 3570000,
	ymax: 11080000,
};

interface FiItem extends WmsBlockItem {
	wmsXmlPath: string;
	blockPx: number;
}

/** Build a GDAL WMS-driver XML config that fetches WMTS tiles via the TMS service mode. */
function buildTmsXml(): string {
	return `<GDAL_WMS>
  <Service name="TMS">
    <ServerUrl>${TILE_TEMPLATE}</ServerUrl>
  </Service>
  <DataWindow>
    <UpperLeftX>-20037508.342789244</UpperLeftX>
    <UpperLeftY>20037508.342789244</UpperLeftY>
    <LowerRightX>20037508.342789244</LowerRightX>
    <LowerRightY>-20037508.342789244</LowerRightY>
    <TileLevel>17</TileLevel>
    <TileCountX>1</TileCountX>
    <TileCountY>1</TileCountY>
    <YOrigin>top</YOrigin>
  </DataWindow>
  <Projection>EPSG:3857</Projection>
  <BlockSizeX>256</BlockSizeX>
  <BlockSizeY>256</BlockSizeY>
  <BandsCount>3</BandsCount>
  <UserPwd>${API_KEY}:</UserPwd>
</GDAL_WMS>
`;
}

export default defineTileRegion<FiItem, { srcPath: string }>({
	name: 'fi',
	meta: {
		status: 'scraping',
		notes: [
			'Maanmittauslaitos (NLS Finland) open WMTS — 0.5 m RGB national orthophoto, mosaic of latest available imagery.',
			'Update cycle: 3 years for most of Finland, 12 years for Northern Lapland.',
			'Requires a free / instant NLS API key (registration at https://omatili.maanmittauslaitos.fi/user/new/avoimet-rajapintapalvelut?lang=en); the key is hardcoded in source. Per NLS docs the key is "user-specific" — register your own if you want a clean attribution chain.',
			'WMTS in WGS84_Pseudo-Mercator tile matrix set, accessed via the GDAL TMS driver so the standard extractWmsBlock helper works unchanged.',
			'The open WCS exposes `ortokuva_vari` natively, but it caps GetCoverage at 2 km bboxes (~16 MP), making national coverage at zoom 17 infeasible (~75k requests at native 0.5 m). WMTS is the practical path.',
			'Init filters blocks against the NUTS Finland polygon; download writes a `.skip` marker for tiles the WMTS returns as fully black (out of coverage / Russia / Sweden / open sea).',
		],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'Maanmittauslaitos / National Land Survey of Finland',
			url: 'https://www.maanmittauslaitos.fi/',
		},
		date: '2022-2025',
		mask: true,
	},
	init: async (ctx) => {
		const wmsXmlPath = join(ctx.tempDir, 'wms.xml');
		if (!existsSync(wmsXmlPath)) {
			await writeFile(wmsXmlPath, buildTmsXml(), 'utf-8');
		}
		// 8192-px blocks = 32×32 source WMTS tiles per gdal_translate call.
		// At MAX_ZOOM=17 this gives ~10 km blocks in EPSG:3857 units.
		const { items, blockPx } = computeWmsBlocks(BBOX, MAX_ZOOM, 8192, 8192);

		// NUTS Finland polygon, projected to 3857 once so each block can be tested
		// in linear time without re-projecting per check.
		const knownRegions = loadKnownRegions(DATA_DIR);
		const finland = knownRegions.find((r) => r.properties.id === 'fi');
		if (!finland) throw new Error('NUTS geometry for fi not found');
		const finlandGeom = projectGeometry3857(finland.geometry);

		const inside = items.filter((item) =>
			bboxIntersectsPolygon({ xmin: item.x0, ymin: item.y0, xmax: item.x1, ymax: item.y1 }, finlandGeom),
		);
		console.log(
			`  ${inside.length} blocks at ${blockPx}x${blockPx}px (skipped ${items.length - inside.length} outside fi polygon)`,
		);

		return inside.map((item) => ({ ...item, wmsXmlPath, blockPx }));
	},
	// NLS infrastructure is sturdy but shared across the country; 4 streams keeps
	// the per-block tile fan-out (32×32 fetches/block) at a polite total rate.
	downloadLimit: 4,
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
		// Out-of-coverage tiles come back fully black from the WMTS. Persist a
		// `.skip` marker so re-runs don't refetch (coverage is fixed; an area
		// that's empty today won't suddenly contain orthophoto on the next run).
		if (await isRasterAllZero(tifPath)) {
			writeFileSync(ctx.skipDest, '');
			return 'empty';
		}
		return { srcPath: tifPath };
	},
	convert: async ({ srcPath }, { dest }) => {
		// Edge tiles can still contain partial black where the WMTS coverage ends
		// inside the block; treat black as nodata so the result is properly masked.
		await runMosaicTile(srcPath, dest, { nodata: '0,0,0' });
	},
	// Finland ≈ 338k km². At MAX_ZOOM=17 with 8192-px blocks (~10 km wide in 3857
	// units) we expect a few thousand land blocks after polygon and empty-tile
	// trimming. Tighten this once the first run gives a real count.
	minFiles: 2000,
});
