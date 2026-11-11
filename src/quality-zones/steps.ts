/**
 * Step plan for building the quality-zones GeoJSON from an OSM planet (or extract).
 *
 * The result is a polygon coverage of the whole Web Mercator square, split into three
 * non-overlapping zones. Each zone carries a `quality` string that sets the WebP
 * compression quality per zoom level for tiles inside it. See `docs/quality-zones.md`.
 *
 * Everything here is pure: it only builds file paths and command arguments.
 * `build.ts` runs the steps.
 */

import { join } from 'node:path';

/** Half the side length of the EPSG:3857 square, in metres. */
export const MERCATOR_HALF_SIZE = 20037508.342789244;

/** Latitude limit of EPSG:3857. Input polygons entirely beyond it are dropped before reprojection. */
export const MERCATOR_MAX_LAT = 85.0511287798066;

/** Width and height of the rasterized mask (16384 px, about 2446 m per pixel). */
export const RASTER_SIZE = 16384;

/** OSM `landuse` values that count as settlement, in addition to all buildings. */
export const LANDUSE_VALUES = ['residential', 'commercial', 'industrial'];

/** Buffer around the rasterized settlement pixels that forms zone A, in EPSG:3857 metres. */
export const BUFFER_A = 1000;

/** Buffer around zone A that forms zone B, in EPSG:3857 metres. */
export const BUFFER_B = 4000;

/** Tolerance for simplifying the buffered polygons, in EPSG:3857 metres. */
export const SIMPLIFY_TOLERANCE = 200;

/** Segments per quarter circle when buffering. Lower is smaller output; GEOS default is 8. */
export const QUADRANT_SEGMENTS = 4;

/** Zones from most to least detailed. `quality` uses the `versatiles mosaic` quality syntax. */
export const ZONES = [
	{ zone: 'A', quality: '70,16:50,17:30' },
	{ zone: 'B', quality: '70,16:40,17:20' },
	{ zone: 'C', quality: '70,16:30,17:10' },
] as const;

export type ZoneName = (typeof ZONES)[number]['zone'];

export interface Step {
	/** Short name for log output. */
	name: string;
	/** Final output path. The step is skipped if it already exists. */
	output: string;
	/** Executable to run. */
	cmd: string;
	/** Tool whose progress output to parse. Default: `cmd`. Needed when `cmd` wraps the tool, e.g. in a pipe. */
	progress?: 'gdal' | 'osmium';
	/** Arguments. The step writes to `tmpPath(output)`, which is renamed to `output` on success. */
	args: string[];
	/** Intermediate files to delete once the step has succeeded. */
	cleanup?: string[];
}

export interface QualityZonePaths {
	input: string;
	tempDir: string;
	exportConfig: string;
	nodeIndex: string;
	filtered: string;
	polygons: string;
	raster: string;
	pixels: string;
	world: string;
	bufferA: string;
	bufferB: string;
	zoneLayers: Record<ZoneName, string>;
	zoneTagged: Record<ZoneName, string>;
	result: string;
	geometryErrors: string;
	coverageErrors: string;
}

/** Temporary name a step writes to before it is renamed. Keeps the extension so tools detect the format. */
export function tmpPath(path: string): string {
	const slash = path.lastIndexOf('/');
	return `${path.slice(0, slash + 1)}.tmp.${path.slice(slash + 1)}`;
}

export function getPaths(input: string, tempDir: string): QualityZonePaths {
	const p = (name: string): string => join(tempDir, name);
	return {
		input,
		tempDir,
		exportConfig: p('osmium-export.json'),
		nodeIndex: p('nodes.idx'),
		filtered: p('filtered.osm.pbf'),
		polygons: p('polygons.geojsonseq.gz'),
		raster: p('settlement.tif'),
		pixels: p('settlement.gpkg'),
		world: p('world.geojson'),
		bufferA: p('buffer_a.gpkg'),
		bufferB: p('buffer_b.gpkg'),
		zoneLayers: { A: p('buffer_a.gpkg'), B: p('zone_b.gpkg'), C: p('zone_c.gpkg') },
		zoneTagged: { A: p('tagged_a.gpkg'), B: p('tagged_b.gpkg'), C: p('tagged_c.gpkg') },
		result: p('quality_zones.geojson'),
		geometryErrors: p('geometry_errors.geojson'),
		coverageErrors: p('coverage_errors.geojson'),
	};
}

/**
 * osmium export config: keep only the tags we filtered on, so the export stays small.
 * Without any kept tag osmium drops the feature, so we can't drop tags entirely.
 */
export function getExportConfig(): string {
	return JSON.stringify({ include_tags: ['building', 'landuse'] });
}

/**
 * A square covering the whole EPSG:3857 extent. Corners are rounded outwards to whole
 * metres, so the final GeoJSON (written with integer coordinates) still covers the full extent.
 */
export function getWorldGeoJSON(): string {
	const e = Math.ceil(MERCATOR_HALF_SIZE);
	return JSON.stringify({
		type: 'FeatureCollection',
		crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:EPSG::3857' } },
		features: [
			{
				type: 'Feature',
				properties: {},
				geometry: {
					type: 'Polygon',
					coordinates: [
						[
							[-e, -e],
							[e, -e],
							[e, e],
							[-e, e],
							[-e, -e],
						],
					],
				},
			},
		],
	});
}

function bufferSteps(distance: number): string[] {
	return [
		'buffer',
		'--distance',
		String(distance),
		'--quadrant-segments',
		String(QUADRANT_SEGMENTS),
		'!',
		'combine',
		'!',
		'dissolve',
		'!',
		'simplify',
		'--tolerance',
		String(SIMPLIFY_TOLERANCE),
		'!',
		'set-geom-type',
		'--multi',
	];
}

/** All steps, in order. Each step reads only outputs of earlier steps. */
export function getSteps(paths: QualityZonePaths): Step[] {
	const e = String(MERCATOR_HALF_SIZE);
	const lat = String(MERCATOR_MAX_LAT);

	const steps: Step[] = [
		{
			name: 'filter OSM',
			output: paths.filtered,
			cmd: 'osmium',
			args: [
				'tags-filter',
				'--progress',
				'--overwrite',
				'--output',
				tmpPath(paths.filtered),
				paths.input,
				'wr/building',
				`wr/landuse=${LANDUSE_VALUES.join(',')}`,
			],
		},
		{
			// osmium can't compress GeoJSONSeq itself, so its output is piped through gzip, which GDAL reads
			// via /vsigzip/ (it can't read zstd). GDAL's GeoJSONSeq driver seeks backwards, so the export
			// can't be piped straight into the rasterize step.
			name: 'export polygons',
			output: paths.polygons,
			cmd: 'bash',
			progress: 'osmium',
			args: [
				'-c',
				// Fixed script; paths are passed as arguments, never interpolated into it.
				'set -euo pipefail; out="$1"; shift; "$@" | gzip -1 > "$out"',
				'bash',
				tmpPath(paths.polygons),
				'osmium',
				'export',
				'--progress',
				'--config',
				paths.exportConfig,
				'--output-format',
				'geojsonseq',
				'--geometry-types',
				'polygon',
				'--index-type',
				`sparse_file_array,${paths.nodeIndex}`,
				'--output',
				'-',
				paths.filtered,
			],
			cleanup: [paths.nodeIndex],
		},
		{
			// Rasterize writes each block once, so compression doesn't bloat the file with rewritten blocks.
			// ZSTD level 1 is as fast as no compression. GDAL_CACHEMAX holds the whole raster in memory.
			name: 'rasterize',
			output: paths.raster,
			cmd: 'gdal',
			args: [
				'pipeline',
				'--progress',
				'--config',
				'GDAL_CACHEMAX=5000',
				'read',
				'--input-format',
				'GeoJSONSeq',
				`/vsigzip/${paths.polygons}`,
				'!',
				// Drops polygons outside Web Mercator's latitude range, which can't be projected near the poles.
				// It only compares bounding boxes; the rasterize extent cuts everything else, much cheaper than `clip`.
				'filter',
				'--bbox',
				`-180,-${lat},180,${lat}`,
				'!',
				'reproject',
				'--dst-crs',
				'EPSG:3857',
				'!',
				'rasterize',
				'--all-touched',
				'--burn',
				'255',
				'--init',
				'0',
				'--nodata',
				'0',
				'--ot',
				'UInt8',
				'--size',
				`${RASTER_SIZE},${RASTER_SIZE}`,
				'--extent',
				`-${e},-${e},${e},${e}`,
				'!',
				'write',
				'--overwrite',
				'--co',
				'TILED=YES',
				'--co',
				'SPARSE_OK=TRUE',
				'--co',
				'BIGTIFF=YES',
				'--co',
				'COMPRESS=ZSTD',
				'--co',
				'ZSTD_LEVEL=1',
				tmpPath(paths.raster),
			],
			cleanup: [paths.polygons, paths.filtered],
		},
		{
			// Pixels with value 0 are nodata, so only settlement pixels become polygons.
			name: 'polygonize',
			output: paths.pixels,
			cmd: 'gdal',
			args: [
				'raster',
				'polygonize',
				'--overwrite',
				'--connect-diagonal-pixels',
				'--output-layer',
				'settlement',
				paths.raster,
				tmpPath(paths.pixels),
			],
		},
		{
			name: `buffer ${BUFFER_A} m (zone A)`,
			output: paths.bufferA,
			cmd: 'gdal',
			args: [
				'vector',
				'pipeline',
				'read',
				paths.pixels,
				'!',
				...bufferSteps(BUFFER_A),
				'!',
				'write',
				'--overwrite',
				'--output-layer',
				'buffer_a',
				tmpPath(paths.bufferA),
			],
		},
		{
			name: `buffer ${BUFFER_B} m`,
			output: paths.bufferB,
			cmd: 'gdal',
			args: [
				'vector',
				'pipeline',
				'read',
				paths.bufferA,
				'!',
				...bufferSteps(BUFFER_B),
				'!',
				'write',
				'--overwrite',
				'--output-layer',
				'buffer_b',
				tmpPath(paths.bufferB),
			],
		},
		eraseStep('zone B', paths.bufferB, paths.bufferA, paths.zoneLayers.B),
		eraseStep('zone C', paths.world, paths.bufferB, paths.zoneLayers.C),
	];

	for (const { zone, quality } of ZONES) {
		const output = paths.zoneTagged[zone];
		steps.push({
			name: `tag zone ${zone}`,
			output,
			cmd: 'gdal',
			args: [
				'vector',
				'pipeline',
				'read',
				paths.zoneLayers[zone],
				'!',
				'sql',
				'--sql',
				`SELECT '${zone}' AS zone, '${quality}' AS quality, geom FROM ${layerName(paths.zoneLayers[zone])}`,
				'!',
				'set-geom-type',
				'--multi',
				'!',
				'write',
				'--overwrite',
				'--output-layer',
				`zone_${zone.toLowerCase()}`,
				tmpPath(output),
			],
		});
	}

	steps.push({
		name: 'write GeoJSON',
		output: paths.result,
		cmd: 'gdal',
		args: [
			'vector',
			'concat',
			'--overwrite',
			'--mode',
			'single',
			'--output-layer',
			'quality_zones',
			'--lco',
			'COORDINATE_PRECISION=0',
			...ZONES.map(({ zone }) => paths.zoneTagged[zone]),
			tmpPath(paths.result),
		],
	});

	// Each check writes one feature per error; build.ts fails if there are any.
	steps.push({
		name: 'check geometry',
		output: paths.geometryErrors,
		cmd: 'gdal',
		args: ['vector', 'check-geometry', '--overwrite', paths.result, tmpPath(paths.geometryErrors)],
	});
	steps.push({
		name: 'check coverage',
		output: paths.coverageErrors,
		cmd: 'gdal',
		args: ['vector', 'check-coverage', '--overwrite', paths.result, tmpPath(paths.coverageErrors)],
	});

	return steps;
}

function eraseStep(name: string, input: string, method: string, output: string): Step {
	return {
		name,
		output,
		cmd: 'gdal',
		args: [
			'vector',
			'layer-algebra',
			'--overwrite',
			'--operation',
			'erase',
			'--no-method-field',
			'--output-layer',
			layerName(output),
			input,
			method,
			tmpPath(output),
		],
	};
}

/** Layer name GDAL uses for a single-layer file we wrote: the file's basename without extension. */
function layerName(path: string): string {
	return path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
}
