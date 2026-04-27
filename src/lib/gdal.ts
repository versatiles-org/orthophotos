/**
 * Wrappers around `gdal_translate` for raster conversion and WMS extraction.
 */

import { runCommand } from './command.ts';

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
