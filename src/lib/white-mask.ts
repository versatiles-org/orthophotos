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

/** `maskWhiteBackgroundFile` masks larger rasters in blocks; masking needs about 12 bytes per pixel. */
const MAX_PIXELS_IN_MEMORY = 64 * 1024 * 1024;

/** Side length of a block, and the overlap with its neighbours, in pixels. */
const BLOCK_SIZE = 4096;
const BLOCK_MARGIN = 16;

/** Pixels of the reduced copy on which the block-wise mask decides which white areas count. */
const COARSE_PIXELS = 16 * 1024 * 1024;

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

/** Whether pixel `i` is opaque pure white (255, 255, 255). */
function pureWhite(r: Uint8Array, g: Uint8Array, b: Uint8Array, a: Uint8Array, i: number): boolean {
	return a[i] > 0 && r[i] === 255 && g[i] === 255 && b[i] === 255;
}

/**
 * Flood fills from every pixel that `isSeed` accepts through the opaque near-white pixels
 * (R, G and B at least `threshold`). Areas of fewer than `minPixels` pixels don't count.
 * Returns 1 per background pixel.
 */
function floodWhite(
	rgba: Uint8Array,
	width: number,
	height: number,
	threshold: number,
	minPixels: number,
	isSeed: (i: number) => boolean,
): Uint8Array {
	const [r, g, b, a] = bands(rgba, width, height);
	const n = width * height;
	const nearWhite = (i: number): boolean => a[i] > 0 && r[i] >= threshold && g[i] >= threshold && b[i] >= threshold;

	// 0 = not visited, 1 = background, 2 = white area too small to count.
	const state = new Uint8Array(n);
	const queue = new Int32Array(n);
	let tail = 0;
	for (let seed = 0; seed < n; seed++) {
		if (state[seed] || !isSeed(seed)) continue;
		// Flood fill one area; its pixels end up in queue[start..tail].
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
	const [r, g, b, a] = bands(rgba, width, height);
	const n = width * height;
	const isEdge = (i: number): boolean => {
		const x = i % width;
		if (x === 0 || x === width - 1 || i < width || i >= n - width) return true;
		return a[i - 1] === 0 || a[i + 1] === 0 || a[i - width] === 0 || a[i + width] === 0;
	};
	return floodWhite(
		rgba,
		width,
		height,
		options?.threshold ?? 240,
		(options?.minArea ?? 0) * n,
		(i) => pureWhite(r, g, b, a, i) && (!options?.edgeOnly || isEdge(i)),
	);
}

/**
 * Sets the alpha of the `background` pixels to 0, in place, then shrinks the imagery by `erode`
 * pixels along everything transparent, which removes the pixels blended between imagery and white.
 */
function clearBackground(rgba: Uint8Array, width: number, height: number, background: Uint8Array, erode: number): void {
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

/**
 * Sets the alpha of the white background to 0, in place (see `findWhiteBackground`), and trims
 * `erode` pixels of imagery along everything transparent.
 */
export function maskWhiteBackground(rgba: Uint8Array, width: number, height: number, options?: WhiteMaskOptions): void {
	if (options?.nodata) applyNodata(rgba, width, height, options.nodata);
	const background = findWhiteBackground(rgba, width, height, options);
	clearBackground(rgba, width, height, background, options?.erode ?? 2);
}

interface RasterInfo {
	width: number;
	height: number;
	/** Number of bands. */
	count: number;
	/** Whether every band is 8-bit. */
	byte: boolean;
}

/** Size, band count and data type of a raster, from `gdalinfo`. */
async function rasterInfo(input: string): Promise<RasterInfo> {
	const result = await runCommand('gdalinfo', ['-json', '-nomd', '-norat', '-noct', '-nofl', input], {
		stdout: 'piped',
		stderr: 'piped',
		quietOnError: true,
	});
	const info = JSON.parse(new TextDecoder().decode(result.stdout)) as {
		size: [number, number];
		bands: { type: string }[];
	};
	return {
		width: info.size[0],
		height: info.size[1],
		count: info.bands.length,
		byte: info.bands.every((band) => band.type === 'Byte'),
	};
}

/**
 * Reads R, G, B and GDAL's mask band (the alpha band, or the nodata mask, or all opaque) of a
 * raster as raw band-sequential bytes through GDAL's ENVI format, which keeps the georeference
 * in the header. Returns the bytes and their size; the caller removes the `enviFiles(raw)`.
 */
async function readRgba(
	input: string,
	raw: string,
	extraArgs: (string | number)[] = [],
): Promise<{ rgba: Uint8Array; width: number; height: number }> {
	const args = ['-q', '-of', 'ENVI', '-co', 'INTERLEAVE=BSQ', '-b', '1', '-b', '2', '-b', '3', '-b', 'mask'];
	await runCommand('gdal_translate', [...args, ...extraArgs.map(String), input, raw], { quiet: true });
	const header = readFileSync(enviHeader(raw), 'utf-8');
	const width = Number(header.match(/samples\s*=\s*(\d+)/)?.[1]);
	const height = Number(header.match(/lines\s*=\s*(\d+)/)?.[1]);
	return { rgba: new Uint8Array(readFileSync(raw)), width, height };
}

/** Writes masked RGBA bytes next to the ENVI header of the raster they were read from. */
function writeRgba(rgba: Uint8Array, readFrom: string, raw: string): void {
	writeFileSync(raw, rgba);
	copyFileSync(enviHeader(readFrom), enviHeader(raw));
}

/** The header GDAL's ENVI driver writes for `raw`. */
function enviHeader(raw: string): string {
	return `${raw.replace(/\.raw$/, '')}.hdr`;
}

/** The files GDAL's ENVI driver writes for `raw`. */
function enviFiles(raw: string): string[] {
	return [raw, enviHeader(raw), `${raw}.aux.xml`];
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
	const { count, byte } = await rasterInfo(input);
	if (count < 3 || !byte) return undefined;
	const raw = `${tempBase}.raw`;
	try {
		const { rgba, width, height } = await readRgba(input, raw, ['-outsize', SAMPLE_SIZE, SAMPLE_SIZE, '-r', 'nearest']);
		if (options?.nodata) applyNodata(rgba, width, height, options.nodata);
		const background = findWhiteBackground(rgba, width, height, WHITE_BORDER_OPTIONS);
		return background.reduce((sum, v) => sum + v, 0) / (width * height);
	} finally {
		for (const path of enviFiles(raw)) safeRm(path);
	}
}

export interface WhiteMaskFileOptions extends WhiteMaskOptions {
	/** Rasters with more pixels are masked in blocks. Default: 64 million (about 800 MB of memory). */
	maxPixelsInMemory?: number;
	/** Side length of a block in pixels. Default: 4096. */
	blockSize?: number;
}

const OUTPUT_CO = ['-co', 'TILED=YES', '-co', 'COMPRESS=DEFLATE', '-co', 'PREDICTOR=2', '-co', 'ALPHA=YES'];

/**
 * Applies `maskWhiteBackground` to an RGB or RGBA raster and writes the result as a tiled
 * RGBA GeoTIFF. The raster goes through GDAL's ENVI format (raw bytes plus a header with the
 * georeference), so nothing is compressed lossily on the way.
 *
 * Masking needs about 12 bytes of memory per pixel, so a raster larger than `maxPixelsInMemory`
 * (such as a 25,000 × 25,000 px BD ORTHO tile) is masked in blocks. Which white areas count is
 * decided first on the whole raster at a reduced resolution of about 16 million pixels, so a
 * white roof that a block boundary cuts stays. Each block is then masked at full resolution,
 * starting from the pure white pixels inside those areas, with a margin so the trim along the
 * background continues across block boundaries.
 */
export async function maskWhiteBackgroundFile(
	input: string,
	output: string,
	options?: WhiteMaskFileOptions,
): Promise<void> {
	const info = await rasterInfo(input);
	const temp: string[] = [];
	try {
		if (info.width * info.height <= (options?.maxPixelsInMemory ?? MAX_PIXELS_IN_MEMORY)) {
			const raw = `${output}.raw`;
			const masked = `${output}.masked.raw`;
			temp.push(...enviFiles(raw), ...enviFiles(masked));
			const { rgba, width, height } = await readRgba(input, raw);
			maskWhiteBackground(rgba, width, height, options);
			writeRgba(rgba, raw, masked);
			await runCommand('gdal_translate', ['-q', ...OUTPUT_CO, '-colorinterp_4', 'alpha', masked, output], {
				quiet: true,
			});
		} else {
			await maskInBlocks(input, output, info, options ?? {}, temp);
		}
	} finally {
		for (const path of temp) safeRm(path);
	}
}

/** The block-wise part of `maskWhiteBackgroundFile`. Adds every file it writes to `temp`. */
async function maskInBlocks(
	input: string,
	output: string,
	{ width, height }: RasterInfo,
	options: WhiteMaskFileOptions,
	temp: string[],
): Promise<void> {
	const blockSize = options.blockSize ?? BLOCK_SIZE;
	const threshold = options.threshold ?? 240;

	// Which white areas count, decided on the whole raster at reduced resolution.
	const factor = Math.ceil(Math.sqrt((width * height) / COARSE_PIXELS));
	const coarseWidth = Math.ceil(width / factor);
	const coarseHeight = Math.ceil(height / factor);
	const coarseRaw = `${output}.coarse.raw`;
	temp.push(...enviFiles(coarseRaw));
	const coarse = await readRgba(input, coarseRaw, ['-outsize', coarseWidth, coarseHeight, '-r', 'nearest']);
	if (options.nodata) applyNodata(coarse.rgba, coarseWidth, coarseHeight, options.nodata);
	const coarseBackground = findWhiteBackground(coarse.rgba, coarseWidth, coarseHeight, options);
	const inCoarseBackground = (x: number, y: number): boolean => {
		const cx = Math.min(coarseWidth - 1, Math.floor((x * coarseWidth) / width));
		const cy = Math.min(coarseHeight - 1, Math.floor((y * coarseHeight) / height));
		return coarseBackground[cy * coarseWidth + cx] === 1;
	};

	const blockRaw = `${output}.block.raw`;
	const maskedRaw = `${output}.block.masked.raw`;
	temp.push(...enviFiles(blockRaw), ...enviFiles(maskedRaw));
	const blockTifs: string[] = [];
	for (let by = 0; by < height; by += blockSize) {
		for (let bx = 0; bx < width; bx += blockSize) {
			const x0 = Math.max(0, bx - BLOCK_MARGIN);
			const y0 = Math.max(0, by - BLOCK_MARGIN);
			const x1 = Math.min(width, bx + blockSize + BLOCK_MARGIN);
			const y1 = Math.min(height, by + blockSize + BLOCK_MARGIN);
			const block = await readRgba(input, blockRaw, ['-srcwin', x0, y0, x1 - x0, y1 - y0]);
			const { rgba, width: bw, height: bh } = block;
			if (options.nodata) applyNodata(rgba, bw, bh, options.nodata);
			const [r, g, b, a] = bands(rgba, bw, bh);
			const background = floodWhite(
				rgba,
				bw,
				bh,
				threshold,
				0,
				(i) => pureWhite(r, g, b, a, i) && inCoarseBackground(x0 + (i % bw), y0 + Math.floor(i / bw)),
			);
			clearBackground(rgba, bw, bh, background, options.erode ?? 2);
			writeRgba(rgba, blockRaw, maskedRaw);

			// Write the block without its margin.
			const blockTif = `${output}.block${blockTifs.length}.tif`;
			temp.push(blockTif);
			const srcwin = [bx - x0, by - y0, Math.min(blockSize, width - bx), Math.min(blockSize, height - by)];
			const co = ['-co', 'TILED=YES', '-co', 'COMPRESS=LZW', '-colorinterp_4', 'alpha'];
			await runCommand('gdal_translate', ['-q', '-srcwin', ...srcwin.map(String), ...co, maskedRaw, blockTif], {
				quiet: true,
			});
			blockTifs.push(blockTif);
		}
	}

	const vrt = `${output}.blocks.vrt`;
	temp.push(vrt);
	await runCommand('gdalbuildvrt', ['-q', vrt, ...blockTifs], { quiet: true });
	const threads = ['-co', 'NUM_THREADS=ALL_CPUS'];
	await runCommand('gdal_translate', ['-q', ...OUTPUT_CO, ...threads, '-colorinterp_4', 'alpha', vrt, output], {
		quiet: true,
	});
}
