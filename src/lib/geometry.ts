/**
 * Lightweight geometry helpers used by region scrapers to filter blocks
 * against a country polygon before downloading. Pure math, no I/O.
 */

import type { MultiPolygon, Polygon, Position } from 'geojson';
import type { WmsBbox } from './wms.ts';

const WORLD_EXTENT = 20037508.342789244;

/** Project EPSG:4326 longitude → EPSG:3857 X (web mercator). */
export function lonTo3857(lon: number): number {
	return (lon * WORLD_EXTENT) / 180;
}

/** Project EPSG:4326 latitude → EPSG:3857 Y (web mercator). Clamped to ±85.05113°. */
export function latTo3857(lat: number): number {
	const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
	return (Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360)) * WORLD_EXTENT) / Math.PI;
}

/** Project a (lon, lat) pair to EPSG:3857. */
export function lonLatTo3857([lon, lat]: Position): [number, number] {
	return [lonTo3857(lon), latTo3857(lat)];
}

/** Reproject every vertex of a Polygon/MultiPolygon from EPSG:4326 to EPSG:3857. */
export function projectGeometry3857(geom: Polygon | MultiPolygon): Polygon | MultiPolygon {
	if (geom.type === 'Polygon') {
		return {
			type: 'Polygon',
			coordinates: geom.coordinates.map((ring) => ring.map(lonLatTo3857)),
		};
	}
	return {
		type: 'MultiPolygon',
		coordinates: geom.coordinates.map((rings) => rings.map((ring) => ring.map(lonLatTo3857))),
	};
}

/** Even-odd ray-cast: is `point` inside the closed `ring`? */
function pointInRing(point: Position, ring: Position[]): boolean {
	const [px, py] = point;
	let inside = false;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xi, yi] = ring[i];
		const [xj, yj] = ring[j];
		if (yi > py !== yj > py) {
			const xCross = xi + ((py - yi) / (yj - yi)) * (xj - xi);
			if (px < xCross) inside = !inside;
		}
	}
	return inside;
}

/** Even-odd over all rings (outer + holes) of one polygon. */
function pointInRings(point: Position, rings: Position[][]): boolean {
	let inside = false;
	for (const ring of rings) if (pointInRing(point, ring)) inside = !inside;
	return inside;
}

/** Returns true if `point` is inside `geom`. */
export function pointInPolygon(point: Position, geom: Polygon | MultiPolygon): boolean {
	if (geom.type === 'Polygon') return pointInRings(point, geom.coordinates);
	return geom.coordinates.some((rings) => pointInRings(point, rings));
}

/**
 * Returns true if `bbox` overlaps `geom`. Designed for coarse filtering — fast,
 * not pixel-perfect. Uses two checks that together cover the common cases for
 * country-scale polygons sampled at <100 m vertex spacing:
 *
 *   1. Any polygon vertex falls inside the bbox → border crosses the block.
 *   2. Any bbox corner lies inside the polygon → block sits entirely inside.
 *
 * Misses only the rare case where a polygon edge passes diagonally through
 * the bbox without any vertex inside AND no bbox corner is inside the polygon
 * — implausible for blocks on the order of 10 km against NUTS_03M coastlines.
 */
export function bboxIntersectsPolygon(bbox: WmsBbox, geom: Polygon | MultiPolygon): boolean {
	const corners: Position[] = [
		[bbox.xmin, bbox.ymin],
		[bbox.xmax, bbox.ymin],
		[bbox.xmin, bbox.ymax],
		[bbox.xmax, bbox.ymax],
	];

	const rings: Position[][][] = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;

	for (const polyRings of rings) {
		for (const ring of polyRings) {
			for (const [x, y] of ring) {
				if (x >= bbox.xmin && x <= bbox.xmax && y >= bbox.ymin && y <= bbox.ymax) return true;
			}
		}
	}

	for (const corner of corners) {
		if (pointInPolygon(corner, geom)) return true;
	}

	return false;
}
