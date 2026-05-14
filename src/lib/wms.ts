/**
 * WMS tile scraping utilities.
 *
 * Generates a grid of blocks at a given zoom level for downloading
 * from a WMS service via GDAL's WMS driver.
 */

import { readFile } from 'node:fs/promises';
import { runCommand } from './command.ts';
import { createXmlParser } from './xml.ts';

const WORLD_EXTENT = 20037508.342789244;
const TILE_PX = 512;
const CANONICAL_TILE_PX = 256;

export interface WmsBbox {
	xmin: number;
	ymin: number;
	xmax: number;
	ymax: number;
}

export interface WmsBlockItem {
	id: string;
	x0: number;
	y0: number;
	x1: number;
	y1: number;
}

function lonTo3857(lon: number): number {
	return (lon * WORLD_EXTENT) / 180;
}

function latTo3857(lat: number): number {
	return (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * WORLD_EXTENT) / Math.PI;
}

function findLayerNode(node: unknown, layerName: string): Record<string, unknown> | undefined {
	if (!node) return undefined;
	if (Array.isArray(node)) {
		for (const n of node) {
			const found = findLayerNode(n, layerName);
			if (found) return found;
		}
		return undefined;
	}
	const obj = node as Record<string, unknown>;
	if (String(obj.Name) === layerName) return obj;
	if (obj.Layer) return findLayerNode(obj.Layer, layerName);
	return undefined;
}

/**
 * Parse WMS GetCapabilities XML for a layer's bounding box and server max dimensions.
 */
export async function parseWmsCapabilities(
	capsPath: string,
	layerName: string,
): Promise<{ bbox: WmsBbox; maxWidth: number; maxHeight: number }> {
	const xml = await readFile(capsPath, 'utf-8');
	const parser = createXmlParser();
	const parsed = parser.parse(xml);

	const cap = (parsed.WMT_MS_Capabilities ?? parsed.WMS_Capabilities) as Record<string, unknown> | undefined;
	if (!cap) throw new Error('Invalid WMS capabilities XML');

	const capability = cap.Capability as Record<string, unknown> | undefined;
	const layerNode = findLayerNode(capability?.Layer, layerName);
	if (!layerNode) throw new Error(`Layer '${layerName}' not found in capabilities`);

	const getMap = (capability?.Request as Record<string, unknown>)?.GetMap as Record<string, unknown> | undefined;
	const maxWidth = Number(getMap?.MaxWidth) || 8192;
	const maxHeight = Number(getMap?.MaxHeight) || 8192;

	let bbox: WmsBbox | undefined;
	const bboxes: unknown[] = [layerNode.BoundingBox ?? []].flat();
	for (const bb of bboxes) {
		const attrs = bb as Record<string, string>;
		const srs = attrs['@_SRS'] ?? attrs['@_CRS'] ?? '';
		if (srs === 'EPSG:3857') {
			bbox = {
				xmin: Number(attrs['@_minx']),
				ymin: Number(attrs['@_miny']),
				xmax: Number(attrs['@_maxx']),
				ymax: Number(attrs['@_maxy']),
			};
			break;
		}
		if (srs === 'CRS:84') {
			// CRS:84 is geographic in lon,lat order (unlike WMS 1.3.0's EPSG:4326).
			bbox = {
				xmin: lonTo3857(Number(attrs['@_minx'])),
				ymin: latTo3857(Number(attrs['@_miny'])),
				xmax: lonTo3857(Number(attrs['@_maxx'])),
				ymax: latTo3857(Number(attrs['@_maxy'])),
			};
			break;
		}
	}

	if (!bbox) {
		// WMS 1.1.1 geographic envelope.
		const llbb = layerNode.LatLonBoundingBox as Record<string, string> | undefined;
		if (llbb) {
			bbox = {
				xmin: lonTo3857(Number(llbb['@_minx'])),
				ymin: latTo3857(Number(llbb['@_miny'])),
				xmax: lonTo3857(Number(llbb['@_maxx'])),
				ymax: latTo3857(Number(llbb['@_maxy'])),
			};
		}
	}

	if (!bbox) {
		// WMS 1.3.0 geographic envelope.
		const exbb = layerNode.EX_GeographicBoundingBox as
			| {
					westBoundLongitude: number | string;
					eastBoundLongitude: number | string;
					southBoundLatitude: number | string;
					northBoundLatitude: number | string;
			  }
			| undefined;
		if (exbb) {
			bbox = {
				xmin: lonTo3857(Number(exbb.westBoundLongitude)),
				ymin: latTo3857(Number(exbb.southBoundLatitude)),
				xmax: lonTo3857(Number(exbb.eastBoundLongitude)),
				ymax: latTo3857(Number(exbb.northBoundLatitude)),
			};
		}
	}

	if (!bbox) throw new Error(`No bbox found for layer '${layerName}'`);

	bbox.xmin = Math.max(bbox.xmin, -WORLD_EXTENT);
	bbox.ymin = Math.max(bbox.ymin, -WORLD_EXTENT);
	bbox.xmax = Math.min(bbox.xmax, WORLD_EXTENT);
	bbox.ymax = Math.min(bbox.ymax, WORLD_EXTENT);

	return { bbox, maxWidth, maxHeight };
}

/**
 * Returns true if two EPSG:3857 bboxes overlap (share at least one interior point).
 * Touching edges only do not count as overlap.
 */
export function bboxesOverlap(a: WmsBbox, b: WmsBbox): boolean {
	return a.xmin < b.xmax && a.xmax > b.xmin && a.ymin < b.ymax && a.ymax > b.ymin;
}

/**
 * Compute a grid of blocks covering the given bbox at the specified zoom level.
 */
export function computeWmsBlocks(
	bbox: WmsBbox,
	zoom: number,
	maxWidth: number,
	maxHeight: number,
): { items: WmsBlockItem[]; blockPx: number } {
	const minLimit = Math.min(maxWidth, maxHeight);
	let blockPx = 1;
	while (blockPx * 2 <= minLimit) blockPx *= 2;
	if (blockPx < TILE_PX) throw new Error(`MaxWidth/MaxHeight too small (${minLimit}) for ${TILE_PX}px blocks`);

	const bw = blockPx / TILE_PX;
	const bh = bw;
	const res = (2 * WORLD_EXTENT) / (CANONICAL_TILE_PX * Math.pow(2, zoom));

	const txmin = Math.floor((bbox.xmin + WORLD_EXTENT) / (TILE_PX * res));
	const tymin = Math.floor((WORLD_EXTENT - bbox.ymax) / (TILE_PX * res));
	const txmax = Math.ceil((bbox.xmax + WORLD_EXTENT) / (TILE_PX * res)) - 1;
	const tymax = Math.ceil((WORLD_EXTENT - bbox.ymin) / (TILE_PX * res)) - 1;

	const tx0 = Math.floor(txmin / bw) * bw;
	const ty0 = Math.floor(tymin / bh) * bh;
	const tx1 = Math.ceil((txmax + 1) / bw) * bw - 1;
	const ty1 = Math.ceil((tymax + 1) / bh) * bh - 1;

	const items: WmsBlockItem[] = [];
	for (let tx = tx0; tx <= tx1; tx += bw) {
		for (let ty = ty0; ty <= ty1; ty += bh) {
			items.push({
				id: `${tx}_${ty}`,
				x0: -WORLD_EXTENT + tx * TILE_PX * res,
				y0: WORLD_EXTENT - (ty + bh) * TILE_PX * res,
				x1: -WORLD_EXTENT + (tx + bw) * TILE_PX * res,
				y1: WORLD_EXTENT - ty * TILE_PX * res,
			});
		}
	}

	return { items, blockPx };
}

export interface GenerateWmsXmlOptions {
	/**
	 * WMS protocol version to embed in the generated GDAL config. Use `'1.3.0'`
	 * for servers that reject WMS 1.1.1 (GDAL's default) with errors like
	 * "Missing parameter 'crs'" — e.g. Hungary's Lechner Tudásközpont GeoServer.
	 * Default: `'1.1.1'` (matches GDAL's historic behaviour and what most servers
	 * still accept).
	 */
	version?: '1.1.1' | '1.3.0';
}

/**
 * Generate a GDAL WMS XML config file for the given WMS service and layer.
 */
export async function generateWmsXml(
	wmsUrl: string,
	layer: string,
	outputPath: string,
	options?: GenerateWmsXmlOptions,
): Promise<void> {
	// Defence in depth: validate caller-controlled inputs before concatenating
	// into the GDAL WMS connection string. `runCommand` uses `spawn` without
	// `shell: true` so there's no shell-injection path, and the WMS driver
	// requires literal `:` / `/` in `EPSG:3857` / `image/png` (URLSearchParams
	// would percent-encode those and break the lookup). Whitelisting the safe
	// characters here also satisfies the `js/shell-command-constructed-from-input`
	// CodeQL query.
	if (!/^https?:\/\/[\w./~%\-:?&=]+$/.test(wmsUrl)) {
		throw new Error(`generateWmsXml: invalid wmsUrl: ${JSON.stringify(wmsUrl)}`);
	}
	if (!/^[\w.\-:]+$/.test(layer)) {
		throw new Error(`generateWmsXml: invalid layer: ${JSON.stringify(layer)}`);
	}
	const version = options?.version ?? '1.1.1';
	// WMS 1.1.1 uses `SRS=`, WMS 1.3.0 uses `CRS=`. Passing the wrong key makes
	// GDAL fall back to EPSG:4326, which we don't want — we drive every block
	// extraction in EPSG:3857.
	const srsParam = version === '1.3.0' ? 'CRS' : 'SRS';
	const sep = wmsUrl.includes('?') ? '&' : '?';
	const query =
		'Version=' +
		version +
		'&Layers=' +
		layer +
		'&' +
		srsParam +
		'=EPSG:3857&ImageFormat=image/png&Transparent=TRUE&BandsCount=4&UserAgent=versatiles/orthophotos';
	const connStr = 'WMS:' + wmsUrl + sep + query;
	await runCommand('gdal_translate', [connStr, '-of', 'wms', outputPath]);
}
