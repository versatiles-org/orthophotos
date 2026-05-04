/**
 * Wrappers around `gdal_translate` for raster conversion and WMS extraction.
 */

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from './command.ts';
import { extractZipFile } from './fs.ts';

export interface TiledTiffOptions {
	/** Expand palette to rgb or rgba (e.g., for paletted PNGs) */
	expand?: 'rgb' | 'rgba';
	/** Assign SRS (e.g., 'EPSG:3857') */
	srs?: string;
	/** Assign upper-left / lower-right corners [ulx, uly, lrx, lry] */
	ullr?: [number, number, number, number];
	/** Compression codec. Default: 'deflate'. Use 'lzw' or 'none' for faster, minimal compression. */
	compress?: 'deflate' | 'lzw' | 'none';
	/** Apply horizontal differencing predictor (PREDICTOR=2). Default: true. Ignored when compress='none'. */
	predictor?: boolean;
	/** Mark last band as alpha (ALPHA=YES). Default: true. Set false for RGB-only sources like JP2. */
	alpha?: boolean;
	/** BIGTIFF mode. Default: 'yes'. Use 'if_needed' when the output is likely small. */
	bigtiff?: 'yes' | 'no' | 'if_needed';
	/** Suppress stdout/stderr during execution. Default: false. */
	quiet?: boolean;
}

/**
 * Converts a raster file to a tiled GeoTIFF optimized for random access.
 * Defaults: DEFLATE + PREDICTOR=2 + BIGTIFF=YES + ALPHA=YES.
 * Pass `{ compress: 'lzw', predictor: false, alpha: false, bigtiff: 'if_needed' }`
 * for a fast, minimal intermediate (e.g. JP2 → TIFF as a pre-versatiles step).
 */
export async function convertToTiledTiff(input: string, output: string, options?: TiledTiffOptions): Promise<void> {
	const compress = options?.compress ?? 'deflate';
	const predictor = options?.predictor ?? true;
	const alpha = options?.alpha ?? false;
	const bigtiff = options?.bigtiff ?? 'if_needed';

	const args = ['-q', '-of', 'GTiff'];
	if (options?.expand) args.push('-expand', options.expand);
	if (options?.srs) args.push('-a_srs', options.srs);
	if (options?.ullr) args.push('-a_ullr', ...options.ullr.map(String));
	args.push('-co', 'TILED=YES');
	if (compress !== 'none') {
		args.push('-co', `COMPRESS=${compress.toUpperCase()}`);
		if (predictor) args.push('-co', 'PREDICTOR=2');
	}
	args.push('-co', `BIGTIFF=${bigtiff.toUpperCase()}`);
	if (alpha) args.push('-co', 'ALPHA=YES');
	args.push(input, output);
	await runCommand('gdal_translate', args, { quiet: options?.quiet ?? true });
}

export interface ExtractZipBuildVrtOptions {
	/** Recurse into subdirectories when finding raster files. Default: false. */
	recursive?: boolean;
	/** Regex matched against filenames to identify raster files. Default: `/\.tiff?$/i`. */
	pattern?: RegExp;
	/** Subdirectory inside `extractDir` to search. Default: search `extractDir` directly. */
	subdir?: string;
	/** Pass `-addalpha` to `gdalbuildvrt`. Default: false. */
	addAlpha?: boolean;
	/** Pass `-allow_projection_difference` to `gdalbuildvrt`. Default: false. */
	allowProjectionDifference?: boolean;
	/** Assign source SRS via `-a_srs` (e.g. `'EPSG:25832'`). Default: omitted. */
	srs?: string;
	/** Suppress stdout/stderr during execution. Default: true. */
	quiet?: boolean;
}

/**
 * Extracts a ZIP archive (atomically via `extractZipFile`) and builds a GDAL VRT
 * from the raster files inside. Returns the count of matched files so callers
 * can decide whether to short-circuit (e.g. return `'empty'`).
 *
 * Cleanup of `zipPath`, `extractDir`, and `vrtPath` is the caller's responsibility
 * — typically via `tileCtx.tempFile(...)`.
 */
export async function extractZipAndBuildVrt(
	zipPath: string,
	extractDir: string,
	vrtPath: string,
	options?: ExtractZipBuildVrtOptions,
): Promise<{ fileCount: number }> {
	await extractZipFile(zipPath, extractDir);

	const searchDir = options?.subdir ? join(extractDir, options.subdir) : extractDir;
	const pattern = options?.pattern ?? /\.tiff?$/i;
	const entries = await readdir(searchDir, { recursive: options?.recursive ?? false });
	const tifFiles: string[] = [];
	for (const entry of entries) {
		const name = typeof entry === 'string' ? entry : String(entry);
		if (pattern.test(name)) tifFiles.push(join(searchDir, name));
	}

	if (tifFiles.length === 0) return { fileCount: 0 };

	const args: string[] = [];
	if (options?.quiet ?? true) args.push('-q');
	if (options?.addAlpha) args.push('-addalpha');
	if (options?.allowProjectionDifference) args.push('-allow_projection_difference');
	if (options?.srs) args.push('-a_srs', options.srs);
	args.push(vrtPath, ...tifFiles);

	await runCommand('gdalbuildvrt', args, { quiet: options?.quiet ?? true });
	return { fileCount: tifFiles.length };
}

export interface CompositeRastersOptions {
	/** Suppress GDAL output. Default: true. */
	quiet?: boolean;
	/** Output format. Default: 'GTiff'. */
	of?: string;
	/** Creation options forwarded as `-co k=v`. Default: `['COMPRESS=DEFLATE', 'PREDICTOR=2']`. */
	creationOptions?: string[];
}

/**
 * Composite a stack of RGBA rasters into a single output, oldest first / newest last.
 *
 * Uses `gdalwarp -srcalpha -dstalpha`: each source's alpha band is interpreted as
 * a transparency mask, so a later source only overwrites earlier output where its
 * alpha > 0. With sources listed oldest → newest, the newest layer wins wherever
 * it has data and earlier layers fill the gaps.
 */
export async function compositeRastersWithAlpha(
	sources: string[],
	output: string,
	options?: CompositeRastersOptions,
): Promise<void> {
	if (sources.length === 0) throw new Error('compositeRastersWithAlpha: no sources');
	const quiet = options?.quiet ?? true;
	const creationOptions = options?.creationOptions ?? ['COMPRESS=DEFLATE', 'PREDICTOR=2'];

	const args: string[] = [];
	if (quiet) args.push('-q');
	args.push('-overwrite', '-srcalpha', '-dstalpha', '-of', options?.of ?? 'GTiff');
	for (const co of creationOptions) args.push('-co', co);
	args.push(...sources, output);

	await runCommand('gdalwarp', args, { quiet });
}

export interface WmsBlockExtractOptions {
	/** WMS XML config file path */
	wmsXmlPath: string;
	/** Block bounds in EPSG:3857 */
	x0: number;
	y0: number;
	x1: number;
	y1: number;
	/** Output pixel size */
	blockPx: number;
}

/**
 * Extracts a block from a WMS source as a tiled, compressed GeoTIFF with alpha.
 */
export async function extractWmsBlock(options: WmsBlockExtractOptions, output: string): Promise<void> {
	await runCommand('gdal_translate', [
		'-q',
		options.wmsXmlPath,
		output,
		'-projwin',
		String(options.x0),
		String(options.y1),
		String(options.x1),
		String(options.y0),
		'-projwin_srs',
		'EPSG:3857',
		'-outsize',
		String(options.blockPx),
		String(options.blockPx),
		'-of',
		'GTiff',
		'-co',
		'COMPRESS=DEFLATE',
		'-co',
		'PREDICTOR=2',
		'-co',
		'ALPHA=YES',
	]);
}
