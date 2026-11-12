/**
 * Step plan for building the settlement-proximity PNG from the VersaTiles OSM vector tiles.
 *
 * The result is a 16384 × 16384 grayscale PNG with one pixel per zoom-14 tile of the Web
 * Mercator square: 255 where a tile contains settlement, falling linearly with the distance
 * to the nearest settlement tile to 0 at `MAX_DISTANCE` pixels. A tile encoder uses it to pick
 * a higher compression quality near settlements. See `docs/quality-zones.md`.
 *
 * Everything here is pure: it only builds file paths, file contents and command arguments.
 * `build.ts` runs the steps.
 */

import { join } from 'node:path';

/** Zoom level whose tiles are measured. Each tile becomes one pixel of the PNG (16384 × 16384). */
export const ZOOM = 14;

/** Shortbread `land` kinds that count as settlement, in addition to all buildings. */
export const LAND_KINDS = ['residential', 'commercial', 'industrial'];

/** Distance in pixels (zoom-14 tiles) at which the value has fallen from 255 to 0. */
export const MAX_DISTANCE = 5;

export interface Step {
	/** Short name for log output. */
	name: string;
	/** Final output path. The step is skipped if it already exists. */
	output: string;
	/** Executable to run. Its progress output is parsed for the progress bar. */
	cmd: 'gdal' | 'versatiles';
	/** Arguments. The step writes to `tmpPath(output)`, which is renamed to `output` on success. */
	args: string[];
}

export interface QualityZonePaths {
	/** `osm.versatiles`: a local path or a URL. */
	input: string;
	tempDir: string;
	vpl: string;
	tileSizes: string;
	result: string;
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
		result: p('settlement_proximity.png'),
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

/** Both steps, in order. Each step reads only the input or outputs of earlier steps. */
export function getSteps(paths: QualityZonePaths): Step[] {
	const d = String(MAX_DISTANCE);
	return [
		{
			// Writes a grayscale PNG with one pixel per tile: 10 * log2(average tile size in bytes),
			// so 0 for missing or empty tiles. Needs versatiles >= 5.10.0 for `vector_branch`.
			name: 'measure tile sizes',
			output: paths.tileSizes,
			cmd: 'versatiles',
			args: ['dev', 'measure-tile-sizes', '--level', String(ZOOM), paths.vpl, tmpPath(paths.tileSizes)],
		},
		{
			// 1. Every tile with settlement becomes 255, everything else 0.
			// 2. `proximity`: Euclidean distance in pixels to the nearest 255 pixel. It stops at
			//    MAX_DISTANCE and gives the pixels beyond its nodata value, which is set to
			//    MAX_DISTANCE so they end up 0 as well. The nodata flag is then cleared, or
			//    `scale` would pass those pixels through as nodata.
			// 3. `scale`: distance 0 → 255 down to MAX_DISTANCE → 0, linearly, as bytes.
			// `calc` would be the obvious tool for 3, but it can only be the first step of a pipeline.
			name: 'settlement proximity',
			output: paths.result,
			cmd: 'gdal',
			args: [
				'raster',
				'pipeline',
				'read',
				paths.tileSizes,
				'!',
				'reclassify',
				'--mapping',
				'0=0; [1,255]=255',
				'!',
				'proximity',
				'--target-values',
				'255',
				'--distance-units',
				'pixel',
				'--max-distance',
				d,
				'--nodata',
				d,
				'!',
				'edit',
				'--nodata',
				'none',
				'!',
				'scale',
				'--input-min',
				'0',
				'--input-max',
				d,
				'--output-min',
				'255',
				'--output-max',
				'0',
				'--ot',
				'UInt8',
				'!',
				'write',
				'--overwrite',
				'--of',
				'PNG',
				tmpPath(paths.result),
			],
		},
	];
}
