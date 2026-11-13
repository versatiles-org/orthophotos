/**
 * Size statistics of the published region files, for the status page.
 *
 * `npm run build:stats` reads them from the remote with `versatiles probe` and writes
 * `data/region-stats.json`, which is committed, because the status page is built in CI
 * without SSH access.
 */

import { existsSync, readFileSync } from 'node:fs';

/** One row of the tile pyramid that `versatiles probe` prints. */
export interface PyramidLevel {
	level: number;
	y0: number;
	y1: number;
	tiles: number;
}

export interface RegionStats {
	/** File size in bytes. */
	size: number;
	/** Tiles over all zoom levels. */
	tiles: number;
	maxZoom: number;
	/** Ground area of the tiles at `maxZoom` in km². Larger than the region where tiles cross its border. */
	areaKm2: number;
}

export interface RegionStatsFile {
	/** Date of the listing (`YYYY-MM-DD`). */
	generated: string;
	regions: Record<string, RegionStats>;
}

/** Mean Earth radius in km. */
const EARTH_RADIUS_KM = 6371.0088;

/**
 * Parses the `tile_pyramid` table of `versatiles probe`:
 *
 *     level │      x0 │      x1 │     y0 │     y1 │   tiles │ coverage
 *     ──────┼─────────┼─────────┼────────┼────────┼─────────┼─────────
 *        18 │ 140_581 │ 141_095 │ 85_776 │ 86_205 │ 181_916 │      82%
 */
export function parseProbePyramid(text: string): PyramidLevel[] {
	const levels: PyramidLevel[] = [];
	for (const line of text.split('\n')) {
		const cells = line.split('│').map((c) => c.trim().replace(/_/g, ''));
		if (cells.length < 6 || !/^\d+$/.test(cells[0])) continue;
		const [level, , , y0, y1, tiles] = cells.map(Number);
		if ([level, y0, y1, tiles].some((n) => !Number.isInteger(n))) continue;
		levels.push({ level, y0, y1, tiles });
	}
	return levels;
}

/** Latitude in radians of the top edge of Web Mercator tile row `y` at zoom `z`. */
function rowLatitude(z: number, y: number): number {
	return Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z)));
}

/** Ground area in km² of one Web Mercator tile in row `y` at zoom `z`. */
export function tileAreaKm2(z: number, y: number): number {
	const width = (2 * Math.PI) / 2 ** z;
	return EARTH_RADIUS_KM ** 2 * width * (Math.sin(rowLatitude(z, y)) - Math.sin(rowLatitude(z, y + 1)));
}

/**
 * Stats of one file from its size and probed pyramid. The tile area at the top zoom uses the
 * middle row of the pyramid, which is accurate to well under 1% for a region of a few degrees.
 */
export function summarizeStats(size: number, levels: PyramidLevel[]): RegionStats {
	if (levels.length === 0) throw new Error('Tile pyramid is empty');
	const top = levels.reduce((a, b) => (b.level > a.level ? b : a));
	const middleRow = Math.floor((top.y0 + top.y1) / 2);
	return {
		size,
		tiles: levels.reduce((sum, l) => sum + l.tiles, 0),
		maxZoom: top.level,
		areaKm2: Math.round(top.tiles * tileAreaKm2(top.level, middleRow)),
	};
}

/** Reads `data/region-stats.json`, or returns an empty map if it hasn't been built yet. */
export function loadRegionStats(path: string): Map<string, RegionStats> {
	if (!existsSync(path)) return new Map();
	const file = JSON.parse(readFileSync(path, 'utf-8')) as RegionStatsFile;
	return new Map(Object.entries(file.regions));
}

/**
 * Sums the stats of regions that the status page shows as one row (`aggregateUnder`, the French
 * regions under `fr`). A parent is listed only when all its children have stats, so a partial sum
 * never looks like the whole country.
 */
export function aggregateStats(
	stats: Map<string, RegionStats>,
	metadata: Map<string, { aggregateUnder?: string }>,
): Map<string, RegionStats> {
	const result = new Map<string, RegionStats>();
	const children = new Map<string, string[]>();
	for (const [id, meta] of metadata) {
		if (meta.aggregateUnder) {
			children.set(meta.aggregateUnder, [...(children.get(meta.aggregateUnder) ?? []), id]);
		} else if (stats.has(id)) {
			result.set(id, stats.get(id)!);
		}
	}
	for (const [parent, ids] of children) {
		const parts = ids.map((id) => stats.get(id));
		if (parts.some((p) => p === undefined)) continue;
		result.set(parent, {
			size: parts.reduce((sum, p) => sum + p!.size, 0),
			tiles: parts.reduce((sum, p) => sum + p!.tiles, 0),
			maxZoom: Math.max(...parts.map((p) => p!.maxZoom)),
			areaKm2: parts.reduce((sum, p) => sum + p!.areaKm2, 0),
		});
	}
	return result;
}
