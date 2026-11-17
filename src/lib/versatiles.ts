/**
 * Wrappers around the `versatiles` CLI (`mosaic tile`, `mosaic assemble`).
 */

import { renameSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { runCommand } from './command.ts';
import { QUALITY, QUALITY_MAP_ENABLED } from './constants.ts';
import { safeRm } from './fs.ts';
import { BORDER_FILL_OPTIONS, type Fill, maskFillFile, measureBorderFill } from './fill-mask.ts';
import { requireQualityMap } from './quality-map.ts';

/**
 * `--quality` and `--quality-map` for both commands. `assemble` re-encodes the tiles where inputs
 * overlap, so it needs the same map, or the seams get a different quality than their neighbours.
 */
function qualityArgs(): string[] {
	return ['--quality', QUALITY, ...(QUALITY_MAP_ENABLED ? ['--quality-map', requireQualityMap()] : [])];
}

/** Share of the input that may be fill along its edge before `runMosaicTile` refuses it. */
const BORDER_FILL_LIMIT = 0.01;

/**
 * How the source fills the area without imagery, as `border` of `runMosaicTile`. Set it only where
 * the source's documentation or a look at a partial sheet shows it; without it, `runMosaicTile`
 * measures the fill on a small sample and throws if opaque white or black along the edge covers
 * more than 1%, so an unknown fill fails the fetch instead of showing as a frame over the layers
 * below. With it, nothing is measured:
 * - `'mask-white'`, `'mask-black'`: make the fill of that colour transparent before tiling
 *   (`maskFillFile`). Unlike `nodata`, this leaves snow, white roofs and shadows inside the
 *   imagery alone and also removes the lossy fringe; flat clipped areas of the other colour at the
 *   edge stay too.
 * - `'mask-both'`: make both colours transparent, for sources that use both.
 * - `'mask-none'`: leave the input as it is, for sources where white or black at the edge is
 *   imagery, such as snow and ice, or that are masked already.
 * Transparency the source has (an alpha band, a nodata value, a mask band) is no fill: the check
 * and the mask read GDAL's mask band, as `mosaic tile` does.
 */
export type BorderFill = 'mask-white' | 'mask-black' | 'mask-both' | 'mask-none';

/** The fill colours each `BorderFill` makes transparent. */
const MASK_FILLS: Record<BorderFill, Fill[]> = {
	'mask-white': ['white'],
	'mask-black': ['black'],
	'mask-both': ['white', 'black'],
	'mask-none': [],
};

/**
 * Verifies that command output contains the expected success marker.
 */
function assertOutputContains(result: { stderr: Uint8Array }, marker: string, context: string): void {
	const stderr = new TextDecoder().decode(result.stderr);
	if (!stderr.includes(marker)) {
		throw new Error(`${context}: expected "${marker}" in output but got:\n${stderr.trim()}`);
	}
}

/**
 * Runs `versatiles mosaic tile` to tile a single raster image into a .versatiles container.
 * Without `border`, checks the input for an opaque fill along its edge first, see `BorderFill`.
 */
export async function runMosaicTile(
	input: string,
	output: string,
	options: {
		/**
		 * Zoom level to tile at, from the tile context (`ctx.maxZoom`). Always set explicitly:
		 * versatiles would otherwise pick the source's resolution rounded up, often a level or
		 * two deeper than the region should be served at.
		 */
		maxZoom: number;
		bands?: string;
		nodata?: string;
		crs?: string;
		cacheDirectory?: string;
		gdalConcurrency?: number;
		border?: BorderFill;
	},
): Promise<void> {
	const fills = options.border ? MASK_FILLS[options.border] : [];
	const maskedInput = join(dirname(output), `.masked.${basename(output)}.tif`);
	try {
		if (!options.border) {
			await assertNoBorderFill(input, join(dirname(output), `.sample.${basename(output)}`), options.nodata);
		} else if (fills.length > 0) {
			await maskFillFile(input, maskedInput, { ...BORDER_FILL_OPTIONS, fills, nodata: options.nodata });
		}
		await tile(fills.length > 0 ? maskedInput : input, output, options);
	} finally {
		if (fills.length > 0) safeRm(maskedInput);
	}
}

/** Throws if more than `BORDER_FILL_LIMIT` of `input` is opaque fill along its edge. */
async function assertNoBorderFill(input: string, tempBase: string, nodata?: string): Promise<void> {
	const share = await measureBorderFill(input, tempBase, { nodata });
	if (share !== undefined && share > BORDER_FILL_LIMIT) {
		throw new Error(
			`runMosaicTile: ${(share * 100).toFixed(1)}% of "${input}" is opaque white or black fill along its edge. ` +
				`Find out how the source fills the area without imagery and pass border: 'mask-white', 'mask-black' ` +
				`or 'mask-both' to make it transparent, or 'mask-none' if it is imagery (snow, ice).`,
		);
	}
}

async function tile(
	input: string,
	output: string,
	options: Pick<
		Parameters<typeof runMosaicTile>[2],
		'maxZoom' | 'bands' | 'nodata' | 'crs' | 'cacheDirectory' | 'gdalConcurrency'
	>,
): Promise<void> {
	const args = ['mosaic', 'tile', ...qualityArgs(), '--max-zoom', String(options.maxZoom)];
	if (options.bands) {
		args.push('--bands', options.bands);
	}
	if (options.nodata) {
		args.push('--nodata', options.nodata);
	}
	if (options.crs) {
		args.push('--crs', options.crs);
	}
	if (options.cacheDirectory) {
		args.push('--cache-dir', options.cacheDirectory);
	}
	if (options.gdalConcurrency !== undefined) {
		args.push('--gdal-concurrency', String(options.gdalConcurrency));
	}
	const tmpOutput = join(dirname(output), `.tmp.${basename(output)}`);
	args.push(input, tmpOutput);
	try {
		const result = await runCommand('versatiles', args, { quiet: true });
		assertOutputContains(result, 'finished mosaic tile', `runMosaicTile for "${input}"`);
		renameSync(tmpOutput, output);
	} catch (cause) {
		safeRm(tmpOutput);
		throw new Error(`runMosaicTile failed for "${input}"`, { cause });
	}
}

/**
 * Runs `versatiles mosaic assemble` to assemble multiple tile containers into one.
 */
export async function runMosaicAssemble(
	filelistPath: string,
	output: string,
	options?: { lossless?: boolean; quiet?: boolean; quietOnError?: boolean },
): Promise<void> {
	// Defence in depth: reject any path containing whitespace, quotes, or shell
	// metacharacters before concatenating it into the `@<path>` versatiles
	// file-list argument. `runCommand` uses `spawn` without `shell: true` so this
	// can't reach a shell anyway, but the validation also silences the
	// `js/shell-command-constructed-from-input` CodeQL warning and catches
	// obviously-malformed callers early.
	if (!/^[\w./\-+]+$/.test(filelistPath)) {
		throw new Error(`runMosaicAssemble: filelist path contains unsafe characters: ${JSON.stringify(filelistPath)}`);
	}
	// No --max-zoom: include every zoom level present in the inputs.
	const args = ['mosaic', 'assemble', '--max-buffer-size', '50%', ...qualityArgs()];
	if (options?.lossless) {
		args.push('--lossless');
	}
	args.push('@' + filelistPath, output);
	const result = await runCommand('versatiles', args, { quiet: options?.quiet, quietOnError: options?.quietOnError });
	assertOutputContains(result, 'finished mosaic assemble', `runMosaicAssemble for "${filelistPath}"`);
}
