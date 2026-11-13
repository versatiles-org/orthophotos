/**
 * Finds and removes an opaque white background: sources that fill the area without imagery
 * with white instead of leaving it transparent, such as some WMS layers (Albania 2018) and
 * the coastal tiles of BD ORTHO, which are white over the sea (La Réunion).
 */

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { runCommand } from './command.ts';
import { safeRm } from './fs.ts';

export interface WhiteMaskOptions {
	/** A pixel whose R, G and B are all at least this counts as near-white. Default: 240. */
	threshold?: number;
	/** Pixels of imagery to remove along the background, for blended edge pixels. Default: 2. */
	erode?: number;
	/**
	 * Only white areas that touch the edge of the raster or a transparent pixel count as
	 * background, so a white roof inside the imagery stays. Default: false, every pure white
	 * pixel starts a background area.
	 */
	edgeOnly?: boolean;
	/** White areas smaller than this share of the raster (0–1) stay. Default: 0. */
	minArea?: number;
	/** Colours that count as transparent, in the syntax of `runMosaicTile`'s `nodata` (`'255,255,255;0,0,0'`). */
	nodata?: string;
}

/** Settings of the edge check and of `whiteBorder: 'mask'` in `runMosaicTile`. */
export const WHITE_BORDER_OPTIONS: WhiteMaskOptions = { edgeOnly: true, minArea: 0.001 };

/** Rasters larger than this are refused by `maskWhiteBackgroundFile`, which needs about 12 bytes per pixel. */
const MAX_MASK_PIXELS = 200_000_000;

/** Side length of the sample that `measureWhiteBorder` reads. */
const SAMPLE_SIZE = 256;

/** Parses `'255,255,255;0,0,0'` into RGB triples. A single value stands for grey. */
export function parseNodata(nodata: string): [number, number, number][] {
	return nodata.split(';').map((colour) => {
		const values = colour.split(',').map((v) => Number(v.trim()));
		if (values.length === 1) values.push(values[0], values[0]);
		if (values.length !== 3 || values.some((v) => !Number.isInteger(v) || v < 0 || v > 255)) {
			throw new Error(`Invalid nodata colour "${colour}"`);
		}
		return values as [number, number, number];
	});
}

/** Splits band-sequential RGBA bytes into the four bands, checking the size. */
function bands(rgba: Uint8Array, width: number, height: number): Uint8Array[] {
	const n = width * height;
	if (rgba.length !== 4 * n) throw new Error(`expected ${4 * n} bytes of RGBA, got ${rgba.length}`);
	return [0, 1, 2, 3].map((band) => rgba.subarray(band * n, (band + 1) * n));
}

/** Sets the alpha of every pixel in one of the `nodata` colours to 0, in place. */
export function applyNodata(rgba: Uint8Array, width: number, height: number, nodata: string): void {
	const [r, g, b, a] = bands(rgba, width, height);
	const colours = parseNodata(nodata);
	for (let i = 0; i < a.length; i++) {
		if (colours.some(([cr, cg, cb]) => r[i] === cr && g[i] === cg && b[i] === cb)) a[i] = 0;
	}
}

/**
 * Finds the white background of band-sequential RGBA bytes: areas of pure white pixels
 * (255, 255, 255) plus the near-white pixels connected to them. Returns 1 per background pixel.
 * Doesn't change `rgba`; `nodata` is ignored here, see `applyNodata`.
 */
export function findWhiteBackground(
	rgba: Uint8Array,
	width: number,
	height: number,
	options?: WhiteMaskOptions,
): Uint8Array {
	const threshold = options?.threshold ?? 240;
	const minPixels = (options?.minArea ?? 0) * width * height;
	const [r, g, b, a] = bands(rgba, width, height);
	const n = width * height;

	const isEdge = (i: number): boolean => {
		const x = i % width;
		if (x === 0 || x === width - 1 || i < width || i >= n - width) return true;
		return a[i - 1] === 0 || a[i + 1] === 0 || a[i - width] === 0 || a[i + width] === 0;
	};
	const isSeed = (i: number): boolean =>
		a[i] > 0 && r[i] === 255 && g[i] === 255 && b[i] === 255 && (!options?.edgeOnly || isEdge(i));
	const nearWhite = (i: number): boolean => a[i] > 0 && r[i] >= threshold && g[i] >= threshold && b[i] >= threshold;

	// 0 = not visited, 1 = background, 2 = white area too small to count.
	const state = new Uint8Array(n);
	const queue = new Int32Array(n);
	let tail = 0;
	for (let seed = 0; seed < n; seed++) {
		if (state[seed] || !isSeed(seed)) continue;
		// Flood fill one area through near-white pixels; its pixels end up in queue[start..tail].
		const start = tail;
		let head = tail;
		state[seed] = 1;
		queue[tail++] = seed;
		const visit = (j: number): void => {
			if (!state[j] && nearWhite(j)) {
				state[j] = 1;
				queue[tail++] = j;
			}
		};
		while (head < tail) {
			const i = queue[head++];
			const x = i % width;
			if (x > 0) visit(i - 1);
			if (x < width - 1) visit(i + 1);
			if (i >= width) visit(i - width);
			if (i < n - width) visit(i + width);
		}
		if (tail - start < minPixels) {
			for (let k = start; k < tail; k++) state[queue[k]] = 2;
		}
	}

	const background = new Uint8Array(n);
	for (let i = 0; i < n; i++) background[i] = state[i] === 1 ? 1 : 0;
	return background;
}

/**
 * Sets the alpha of the white background to 0, in place (see `findWhiteBackground`). Then the
 * imagery is shrunk by `erode` pixels along everything transparent, which removes the pixels
 * blended between imagery and white.
 */
export function maskWhiteBackground(rgba: Uint8Array, width: number, height: number, options?: WhiteMaskOptions): void {
	const erode = options?.erode ?? 2;
	if (options?.nodata) applyNodata(rgba, width, height, options.nodata);
	const background = findWhiteBackground(rgba, width, height, options);
	const a = bands(rgba, width, height)[3];
	const n = width * height;

	// Transparent from here on: the background and whatever was transparent already.
	const clear = new Uint8Array(n);
	for (let i = 0; i < n; i++) clear[i] = background[i] || a[i] === 0 ? 1 : 0;

	// Shrink the imagery: each step clears the pixels next to a cleared one.
	for (let step = 0; step < erode; step++) {
		const next = clear.slice();
		for (let i = 0; i < n; i++) {
			if (clear[i]) continue;
			const x = i % width;
			if (
				(x > 0 && clear[i - 1]) ||
				(x < width - 1 && clear[i + 1]) ||
				(i >= width && clear[i - width]) ||
				(i < n - width && clear[i + width])
			) {
				next[i] = 1;
			}
		}
		clear.set(next);
	}

	for (let i = 0; i < n; i++) if (clear[i]) a[i] = 0;
}

/** Band count and data type of a raster, from `gdalinfo`. */
async function rasterBands(input: string): Promise<{ count: number; byte: boolean }> {
	const result = await runCommand('gdalinfo', ['-json', '-nomd', '-norat', '-noct', '-nofl', input], {
		stdout: 'piped',
		stderr: 'piped',
		quietOnError: true,
	});
	const info = JSON.parse(new TextDecoder().decode(result.stdout)) as { bands: { type: string }[] };
	return { count: info.bands.length, byte: info.bands.every((band) => band.type === 'Byte') };
}

/**
 * Reads R, G, B and GDAL's mask band (the alpha band, or the nodata mask, or all opaque) of a
 * raster as raw band-sequential bytes through GDAL's ENVI format, which keeps the georeference
 * in the header. Returns the size; the caller removes `raw` and its `.hdr`.
 */
async function readRgba(
	input: string,
	raw: string,
	extraArgs: string[] = [],
): Promise<{ width: number; height: number }> {
	const args = ['-q', '-of', 'ENVI', '-co', 'INTERLEAVE=BSQ', '-b', '1', '-b', '2', '-b', '3', '-b', 'mask'];
	await runCommand('gdal_translate', [...args, ...extraArgs, input, raw], { quiet: true });
	const header = readFileSync(`${raw.replace(/\.raw$/, '')}.hdr`, 'utf-8');
	const width = Number(header.match(/samples\s*=\s*(\d+)/)?.[1]);
	const height = Number(header.match(/lines\s*=\s*(\d+)/)?.[1]);
	return { width, height };
}

/** The files GDAL's ENVI driver writes for `raw`. */
function enviFiles(raw: string): string[] {
	const base = raw.replace(/\.raw$/, '');
	return [raw, `${base}.hdr`, `${raw}.aux.xml`];
}

/**
 * Share (0–1) of a raster that is white background touching its edge or a transparent pixel,
 * measured on a 256 × 256 sample (nearest neighbour, so pure white stays pure). `undefined` for
 * rasters that aren't 8-bit RGB. `tempBase` is a path prefix for the sample files.
 */
export async function measureWhiteBorder(
	input: string,
	tempBase: string,
	options?: { nodata?: string },
): Promise<number | undefined> {
	const { count, byte } = await rasterBands(input);
	if (count < 3 || !byte) return undefined;
	const raw = `${tempBase}.raw`;
	try {
		const outsize = ['-outsize', String(SAMPLE_SIZE), String(SAMPLE_SIZE), '-r', 'nearest'];
		const { width, height } = await readRgba(input, raw, outsize);
		const rgba = new Uint8Array(readFileSync(raw));
		if (options?.nodata) applyNodata(rgba, width, height, options.nodata);
		const background = findWhiteBackground(rgba, width, height, WHITE_BORDER_OPTIONS);
		return background.reduce((sum, v) => sum + v, 0) / (width * height);
	} finally {
		for (const path of enviFiles(raw)) safeRm(path);
	}
}

/**
 * Applies `maskWhiteBackground` to an RGB or RGBA raster and writes the result as a tiled
 * RGBA GeoTIFF. The raster goes through GDAL's ENVI format (raw bytes plus a header with the
 * georeference), so nothing is compressed lossily on the way. Needs about 12 bytes of memory
 * per pixel: fine for WMS blocks and source tiles, not for a VRT of a whole region.
 */
export async function maskWhiteBackgroundFile(
	input: string,
	output: string,
	options?: WhiteMaskOptions,
): Promise<void> {
	const raw = `${output}.raw`;
	const masked = `${output}.masked.raw`;
	try {
		const { width, height } = await readRgba(input, raw);
		if (width * height > MAX_MASK_PIXELS) {
			throw new Error(`maskWhiteBackgroundFile: ${input} has ${width} × ${height} pixels, too many to mask in memory`);
		}

		const rgba = new Uint8Array(readFileSync(raw));
		maskWhiteBackground(rgba, width, height, options);
		writeFileSync(masked, rgba);
		copyFileSync(`${output}.hdr`, `${output}.masked.hdr`);

		const co = ['-co', 'TILED=YES', '-co', 'COMPRESS=DEFLATE', '-co', 'PREDICTOR=2', '-co', 'ALPHA=YES'];
		await runCommand('gdal_translate', ['-q', ...co, '-colorinterp_4', 'alpha', masked, output], { quiet: true });
	} finally {
		for (const path of [...enviFiles(raw), ...enviFiles(masked)]) safeRm(path);
	}
}
