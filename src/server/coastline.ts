/**
 * Coastline mask for the satellite layer.
 *
 * Sentinel-2 looks good on land and in a narrow strip of coastal water, but turns into a grey haze
 * further out at sea, where Blue Marble's ocean looks better. So the satellite layer is clipped to
 * the land, grown by a few kilometres into the sea, and faded out. Close to the coast both layers
 * show the same water, so the fade is invisible.
 *
 * The land comes from OpenStreetMap's land polygons (osmdata.openstreetmap.de, ODbL), in the
 * version simplified for low zooms. Their simplification is only visible up to about zoom 9, where
 * the mask follows the coast directly; from there on the buffer moves the edge offshore anyway.
 *
 * `raster_mask` measures buffer and blur in Web Mercator metres, and a pixel at a given zoom has
 * the same size in those metres everywhere, so each step of `COASTLINE_FADE` has the same width in
 * pixels anywhere in the world.
 */

import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { downloadFile, getConfig, runCommand, safeRm, withRetry } from '../lib/index.ts';

const LAND_POLYGONS_URL = 'https://osmdata.openstreetmap.de/download/simplified-land-polygons-complete-3857.zip';
const LAND_POLYGONS_SHAPEFILE = 'simplified-land-polygons-complete-3857/simplified_land_polygons.shp';

/**
 * Per zoom range, how far the satellite layer reaches into the sea. Buffer and blur are both
 * `distance` metres, so the fade starts at the coast and ends `2 × distance` offshore. Ranges
 * must be in ascending order; the last one has no upper bound.
 */
export const COASTLINE_FADE: { levelMin: number; levelMax?: number; distance: number }[] = [
	{ levelMin: 0, levelMax: 7, distance: 1000 },
	{ levelMin: 8, levelMax: 8, distance: 1500 },
	{ levelMin: 9, levelMax: 9, distance: 2000 },
	{ levelMin: 10, levelMax: 10, distance: 3000 },
	{ levelMin: 11, distance: 4000 },
];

/**
 * VPL layers that show the satellite container `source` on land and fade it out at sea: one
 * layer per range of `COASTLINE_FADE`, each masked with the land polygons in `coastline`.
 */
export function getCoastlineLayers(source: string, coastline: string): string[] {
	return COASTLINE_FADE.map(({ levelMin, levelMax, distance }) => {
		const filter = `filter level_min=${levelMin}${levelMax === undefined ? '' : ` level_max=${levelMax}`}`;
		const mask = `raster_mask geojson="${coastline}" buffer=${distance} blur=${distance} blur_function=cosine`;
		return `from_container filename="${source}" | ${filter} | ${mask}`;
	});
}

/** Where the land polygons are kept: `<dir_data>/coastline/land-polygons.geojson`. */
export function getCoastlinePath(): string {
	return resolve(getConfig().dirData, 'coastline', 'land-polygons.geojson');
}

/**
 * Returns the path of the land polygons as GeoJSON in EPSG:4326, downloading and converting them
 * first if they're missing. To get newer ones, delete the file.
 */
export async function ensureCoastline(): Promise<string> {
	const path = getCoastlinePath();
	if (existsSync(path)) return path;

	console.log('Downloading the OSM land polygons for the coastline mask...');
	mkdirSync(dirname(path), { recursive: true });
	const zipPath = join(getConfig().dirTemp, 'simplified-land-polygons-complete-3857.zip');
	await withRetry(() => downloadFile(LAND_POLYGONS_URL, zipPath, { minSize: 10_000_000 }), { maxAttempts: 3 });

	const tmpPath = `${path}.tmp`;
	safeRm(tmpPath);
	await runCommand(
		'ogr2ogr',
		[
			'-f',
			'GeoJSON',
			'-t_srs',
			'EPSG:4326',
			'-lco',
			'COORDINATE_PRECISION=5',
			'-select',
			'',
			tmpPath,
			`/vsizip/${zipPath}/${LAND_POLYGONS_SHAPEFILE}`,
		],
		{ quiet: true },
	);
	renameSync(tmpPath, path);
	safeRm(zipPath);
	return path;
}
