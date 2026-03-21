/**
 * WMS tile scraping utilities.
 *
 * Generates a grid of blocks at a given zoom level for downloading
 * from a WMS service via GDAL's WMS driver.
 */

import { readFile } from 'node:fs/promises';
import { XMLParser } from 'fast-xml-parser';
import { runCommand } from './command.ts';

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
	const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
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
	}

	if (!bbox) {
		const llbb = layerNode.LatLonBoundingBox as Record<string, string> | undefined;
		if (!llbb) throw new Error(`No bbox found for layer '${layerName}'`);
		bbox = {
			xmin: lonTo3857(Number(llbb['@_minx'])),
			ymin: latTo3857(Number(llbb['@_miny'])),
			xmax: lonTo3857(Number(llbb['@_maxx'])),
			ymax: latTo3857(Number(llbb['@_maxy'])),
		};
	}

	bbox.xmin = Math.max(bbox.xmin, -WORLD_EXTENT);
	bbox.ymin = Math.max(bbox.ymin, -WORLD_EXTENT);
	bbox.xmax = Math.min(bbox.xmax, WORLD_EXTENT);
	bbox.ymax = Math.min(bbox.ymax, WORLD_EXTENT);

	return { bbox, maxWidth, maxHeight };
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

/**
 * Generate a GDAL WMS XML config file for the given WMS service and layer.
 */
export async function generateWmsXml(wmsUrl: string, layer: string, outputPath: string): Promise<void> {
	const sep = wmsUrl.includes('?') ? '&' : '?';
	const connStr = `WMS:${wmsUrl}${sep}Layers=${layer}&SRS=EPSG:3857&ImageFormat=image/png&Transparent=TRUE&BandsCount=4&UserAgent=versatiles/orthophotos`;
	await runCommand('gdal_translate', [connStr, '-of', 'wms', outputPath]);
}
