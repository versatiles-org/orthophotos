/**
 * Step plan for building the quality-zones GeoJSON from the VersaTiles OSM vector tiles.
 *
 * The result is a polygon coverage of the whole Web Mercator square, split into three
 * non-overlapping zones. Each zone carries a `quality` string that sets the WebP
 * compression quality per zoom level for tiles inside it. See `docs/quality-zones.md`.
 *
 * Everything here is pure: it only builds file paths, file contents and command arguments.
 * `build.ts` runs the steps.
 */

import { join } from 'node:path';

/** Half the side length of the EPSG:3857 square, in metres. */
export const MERCATOR_HALF_SIZE = 20037508.342789244;

/** Zoom level whose tiles are measured. Each tile becomes one pixel of the settlement mask. */
export const ZOOM = 14;

/** Width and height of the settlement mask: one pixel per tile (16384 px, about 2446 m per pixel). */
export const RASTER_SIZE = 2 ** ZOOM;

/** Shortbread `land` kinds that count as settlement, in addition to all buildings. */
export const LAND_KINDS = ['residential', 'commercial', 'industrial'];

/** Buffer around the rasterized settlement pixels that forms zone A, in EPSG:3857 metres. */
export const BUFFER_A = 1000;

/** Buffer around zone A that forms zone B, in EPSG:3857 metres. */
export const BUFFER_B = 4000;

/** Tolerance for simplifying the buffered polygons, in EPSG:3857 metres. */
export const SIMPLIFY_TOLERANCE = 1000;

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
	/** Executable to run. Its progress output is parsed for the progress bar. */
	cmd: 'gdal' | 'versatiles';
	/** Arguments. The step writes to `tmpPath(output)`, which is renamed to `output` on success. */
	args: string[];
	/** Intermediate files to delete once the step has succeeded. */
	cleanup?: string[];
}

export interface QualityZonePaths {
	/** `osm.versatiles`: a local path or a URL. */
	input: string;
	tempDir: string;
	vpl: string;
	tileSizes: string;
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
		vpl: p('settlement.vpl'),
		tileSizes: p('tile_sizes.png'),
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
 * VPL that keeps only settlement features at zoom 14: all buildings, and `land` features of the
 * settlement kinds. A tile that ends up without features measures 0 bytes, any other tile more.
 */
export function getSettlementVPL(input: string): string {
	if (/["\\\n]/.test(input)) throw new Error(`Input can't contain quotes, backslashes or newlines: ${input}`);
	const kinds = LAND_KINDS.map((kind) => `'${kind}'`).join(',');
	return [
		`from_container filename="${input}"`,
		`  | filter level_min=${ZOOM} level_max=${ZOOM}`,
		'  | vector_filter_layers filter=["buildings","land"] invert=true',
		`  | vector_branch expr="$layer == 'land'" [`,
		`      vector_filter_features expr="kind in [${kinds}]"`,
		'    ]',
		'',
	].join('\n');
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
		'--geometry-type',
		'MULTIPOLYGON',
	];
}

/** All steps, in order. Each step reads only outputs of earlier steps. */
export function getSteps(paths: QualityZonePaths): Step[] {
	const e = String(MERCATOR_HALF_SIZE);

	const steps: Step[] = [
		{
			// Writes a grayscale PNG with one pixel per tile: 10 * log2(average tile size in bytes),
			// so 0 for missing or empty tiles. Needs versatiles >= 5.10.0 for `vector_branch`.
			name: 'measure tile sizes',
			output: paths.tileSizes,
			cmd: 'versatiles',
			args: ['dev', 'measure-tile-sizes', '--level', String(ZOOM), paths.vpl, tmpPath(paths.tileSizes)],
		},
		{
			// Pixel row 0 is tile row 0, the northern edge, so the PNG maps onto the Mercator square as it is.
			// Any tile with settlement becomes 255, everything else 0 (nodata).
			name: 'settlement mask',
			output: paths.raster,
			cmd: 'gdal',
			args: [
				'raster',
				'pipeline',
				'read',
				paths.tileSizes,
				'!',
				'edit',
				'--crs',
				'EPSG:3857',
				'--bbox',
				`-${e},-${e},${e},${e}`,
				'!',
				'reclassify',
				'--mapping',
				'0=0; [1,255]=255',
				'!',
				'edit',
				'--nodata',
				'0',
				'!',
				'write',
				'--overwrite',
				'--co',
				'TILED=YES',
				'--co',
				'SPARSE_OK=TRUE',
				'--co',
				'COMPRESS=ZSTD',
				'--co',
				'ZSTD_LEVEL=1',
				tmpPath(paths.raster),
			],
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
				'--geometry-type',
				'MULTIPOLYGON',
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
