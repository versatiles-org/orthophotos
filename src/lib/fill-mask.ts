/**
 * Finds and removes an opaque fill: sources that fill the area without imagery with white or
 * black instead of leaving it transparent, such as some WMS layers (Albania 2018), the coastal
 * tiles of BD ORTHO, which are white over the sea (La Réunion), or tiles that are black outside
 * the country (Romania).
 *
 * Unlike a `nodata` colour, which makes every pixel of that colour transparent (snow, white roofs,
 * deep shadows), only fill areas count: flat areas connected to the edge of the raster.
 */

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { runCommand } from './command.ts';
import { safeRm } from './fs.ts';

/** A fill colour: pure white (255, 255, 255) or pure black (0, 0, 0). */
export type Fill = 'white' | 'black';

export interface FillMaskOptions {
	/** Fill colours to look for. Default: both. */
	fills?: Fill[];
	/** How far R, G and B may be from the fill colour for a pixel to join a fill area (lossy fringe). Default: 15. */
	tolerance?: number;
	/** Pixels of imagery to remove along the fill, for blended edge pixels. Default: 2. */
	erode?: number;
	/**
	 * Only fill areas that touch the edge of the raster or a transparent pixel count, so a white
	 * roof or a shadow inside the imagery stays. Default: false, every pure pixel starts an area.
	 */
	edgeOnly?: boolean;
	/** Areas smaller than this share of the raster (0–1) stay. Default: 0. */
	minArea?: number;
	/**
	 * Areas in which fewer than this share of the pixels have exactly the fill colour stay. A fill
	 * is flat, while snow or a dark forest has texture even where it touches the edge. Default: 0.
	 */
	minPurity?: number;
	/** Colours that count as transparent, in the syntax of `runMosaicTile`'s `nodata` (`'255,255,255;0,0,0'`). */
	nodata?: string;
}

/** Settings of the border check and of `border: 'mask'` in `runMosaicTile`. */
export const BORDER_FILL_OPTIONS: FillMaskOptions = {
	fills: ['white', 'black'],
	edgeOnly: true,
	minArea: 0.001,
	minPurity: 0.5,
};

/** `maskFillFile` masks larger rasters in blocks; masking needs about 12 bytes per pixel. */
const MAX_PIXELS_IN_MEMORY = 64 * 1024 * 1024;

/** Side length of a block, and the overlap with its neighbours, in pixels. */
const BLOCK_SIZE = 4096;
const BLOCK_MARGIN = 16;

/** Pixels of the reduced copy on which the block-wise mask decides which fill areas count. */
const COARSE_PIXELS = 16 * 1024 * 1024;

/** Side length of the sample that `measureBorderFill` reads. */
const SAMPLE_SIZE = 256;

/** Inputs that `maskFillFile` decodes to a tiled GeoTIFF before reading them block by block. */
const DECODE_FIRST = new Set(['.jp2', '.j2k', '.png', '.jpg', '.jpeg']);

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

/** Tests for one fill colour on band-sequential RGBA bytes. */
interface FillTests {
	/** Opaque and exactly the fill colour. */
	pure: (i: number) => boolean;
	/** Opaque and within the tolerance of the fill colour. */
	near: (i: number) => boolean;
}

function fillTests(rgba: Uint8Array, width: number, height: number, fill: Fill, tolerance: number): FillTests {
	const [r, g, b, a] = bands(rgba, width, height);
	if (fill === 'white') {
		const min = 255 - tolerance;
		return {
			pure: (i) => a[i] > 0 && r[i] === 255 && g[i] === 255 && b[i] === 255,
			near: (i) => a[i] > 0 && r[i] >= min && g[i] >= min && b[i] >= min,
		};
	}
	return {
		pure: (i) => a[i] > 0 && r[i] === 0 && g[i] === 0 && b[i] === 0,
		near: (i) => a[i] > 0 && r[i] <= tolerance && g[i] <= tolerance && b[i] <= tolerance,
	};
}

/**
 * Flood fills from every pixel that `isSeed` accepts through the pixels `near` accepts. Areas
 * of fewer than `minPixels` pixels, or with a share of pure pixels below `minPurity`, don't count.
 * Marks each counted pixel with 1 in `result`.
 */
function flood(
	width: number,
	height: number,
	tests: FillTests,
	isSeed: (i: number) => boolean,
	minPixels: number,
	minPurity: number,
	result: Uint8Array,
): void {
	const n = width * height;
	// 0 = not visited, 1 = fill, 2 = area that doesn't count.
	const state = new Uint8Array(n);
	const queue = new Int32Array(n);
	let tail = 0;
	for (let seed = 0; seed < n; seed++) {
		if (state[seed] || !isSeed(seed)) continue;
		// Flood fill one area; its pixels end up in queue[start..tail].
		const start = tail;
		let head = tail;
		let pure = 0;
		state[seed] = 1;
		queue[tail++] = seed;
		const visit = (j: number): void => {
			if (!state[j] && tests.near(j)) {
				state[j] = 1;
				queue[tail++] = j;
			}
		};
		while (head < tail) {
			const i = queue[head++];
			if (tests.pure(i)) pure++;
			const x = i % width;
			if (x > 0) visit(i - 1);
			if (x < width - 1) visit(i + 1);
			if (i >= width) visit(i - width);
			if (i < n - width) visit(i + width);
		}
		const size = tail - start;
		if (size < minPixels || pure < minPurity * size) {
			for (let k = start; k < tail; k++) state[queue[k]] = 2;
		}
	}
	for (let i = 0; i < n; i++) if (state[i] === 1) result[i] = 1;
}

/**
 * Finds the fill of band-sequential RGBA bytes: areas of pure fill pixels plus the pixels within
 * the tolerance connected to them, for each fill colour. Returns 1 per fill pixel. Doesn't
 * change `rgba`; `nodata` is ignored here, see `applyNodata`.
 */
export function findFill(rgba: Uint8Array, width: number, height: number, options?: FillMaskOptions): Uint8Array {
	const a = bands(rgba, width, height)[3];
	const n = width * height;
	const isEdge = (i: number): boolean => {
		const x = i % width;
		if (x === 0 || x === width - 1 || i < width || i >= n - width) return true;
		return a[i - 1] === 0 || a[i + 1] === 0 || a[i - width] === 0 || a[i + width] === 0;
	};
	const result = new Uint8Array(n);
	for (const fill of options?.fills ?? ['white', 'black']) {
		const tests = fillTests(rgba, width, height, fill, options?.tolerance ?? 15);
		const isSeed = (i: number): boolean => tests.pure(i) && (!options?.edgeOnly || isEdge(i));
		flood(width, height, tests, isSeed, (options?.minArea ?? 0) * n, options?.minPurity ?? 0, result);
	}
	return result;
}

/**
 * Sets the alpha of the `fill` pixels to 0, in place, then shrinks the imagery by `erode`
 * pixels along everything transparent, which removes the pixels blended between imagery and fill.
 */
function clearFill(rgba: Uint8Array, width: number, height: number, fill: Uint8Array, erode: number): void {
	const a = bands(rgba, width, height)[3];
	const n = width * height;

	// Transparent from here on: the fill and whatever was transparent already.
	const clear = new Uint8Array(n);
	for (let i = 0; i < n; i++) clear[i] = fill[i] || a[i] === 0 ? 1 : 0;

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
 * Sets the alpha of the fill to 0, in place (see `findFill`), and trims `erode` pixels of
 * imagery along everything transparent.
 */
export function maskFill(rgba: Uint8Array, width: number, height: number, options?: FillMaskOptions): void {
	if (options?.nodata) applyNodata(rgba, width, height, options.nodata);
	clearFill(rgba, width, height, findFill(rgba, width, height, options), options?.erode ?? 2);
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
 * Share (0–1) of a raster that is fill along its edge (`BORDER_FILL_OPTIONS`), measured on a
 * 256 × 256 sample (nearest neighbour, so pure colours stay pure). `undefined` for rasters that
 * aren't 8-bit RGB. `tempBase` is a path prefix for the sample files.
 */
export async function measureBorderFill(
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
		const fill = findFill(rgba, width, height, BORDER_FILL_OPTIONS);
		return fill.reduce((sum, v) => sum + v, 0) / (width * height);
	} finally {
		for (const path of enviFiles(raw)) safeRm(path);
	}
}

export interface FillMaskFileOptions extends FillMaskOptions {
	/** Rasters with more pixels are masked in blocks. Default: 64 million (about 800 MB of memory). */
	maxPixelsInMemory?: number;
	/** Side length of a block in pixels. Default: 4096. */
	blockSize?: number;
}

const OUTPUT_CO = ['-co', 'TILED=YES', '-co', 'COMPRESS=DEFLATE', '-co', 'PREDICTOR=2', '-co', 'ALPHA=YES'];

/**
 * Applies `maskFill` to an RGB or RGBA raster and writes the result as a tiled RGBA GeoTIFF.
 * The raster goes through GDAL's ENVI format (raw bytes plus a header with the georeference),
 * so nothing is compressed lossily on the way.
 *
 * Masking needs about 12 bytes of memory per pixel, so a raster larger than `maxPixelsInMemory`
 * (such as a 25,000 × 25,000 px BD ORTHO tile) is masked in blocks. JPEG 2000, PNG and JPEG are
 * decoded to a tiled GeoTIFF first, so the blocks don't decode the whole file each. Which fill
 * areas count is decided first on the whole raster at a reduced resolution of about 16 million
 * pixels, so a white roof that a block boundary cuts stays. Each block is then masked at full
 * resolution, starting from the pure pixels inside those areas, with a margin so the trim along
 * the fill continues across block boundaries.
 */
export async function maskFillFile(input: string, output: string, options?: FillMaskFileOptions): Promise<void> {
	const info = await rasterInfo(input);
	const temp: string[] = [];
	try {
		if (info.width * info.height <= (options?.maxPixelsInMemory ?? MAX_PIXELS_IN_MEMORY)) {
			const raw = `${output}.raw`;
			const masked = `${output}.masked.raw`;
			temp.push(...enviFiles(raw), ...enviFiles(masked));
			const { rgba, width, height } = await readRgba(input, raw);
			maskFill(rgba, width, height, options);
			writeRgba(rgba, raw, masked);
			await runCommand('gdal_translate', ['-q', ...OUTPUT_CO, '-colorinterp_4', 'alpha', masked, output], {
				quiet: true,
			});
			return;
		}
		let source = input;
		if (DECODE_FIRST.has(extname(input).toLowerCase())) {
			source = `${output}.decoded.tif`;
			temp.push(source);
			const co = ['-co', 'TILED=YES', '-co', 'COMPRESS=LZW', '-co', 'BIGTIFF=IF_SAFER'];
			await runCommand('gdal_translate', ['-q', ...co, input, source], { quiet: true });
		}
		await maskInBlocks(source, output, info, options ?? {}, temp);
	} finally {
		for (const path of temp) safeRm(path);
	}
}

/** The block-wise part of `maskFillFile`. Adds every file it writes to `temp`. */
async function maskInBlocks(
	input: string,
	output: string,
	{ width, height }: RasterInfo,
	options: FillMaskFileOptions,
	temp: string[],
): Promise<void> {
	const blockSize = options.blockSize ?? BLOCK_SIZE;
	const tolerance = options.tolerance ?? 15;

	// Which fill areas count, decided per colour on the whole raster at reduced resolution.
	const factor = Math.ceil(Math.sqrt((width * height) / COARSE_PIXELS));
	const coarseWidth = Math.ceil(width / factor);
	const coarseHeight = Math.ceil(height / factor);
	const coarseRaw = `${output}.coarse.raw`;
	temp.push(...enviFiles(coarseRaw));
	const coarse = await readRgba(input, coarseRaw, ['-outsize', coarseWidth, coarseHeight, '-r', 'nearest']);
	if (options.nodata) applyNodata(coarse.rgba, coarseWidth, coarseHeight, options.nodata);
	const fills = options.fills ?? ['white', 'black'];
	const coarseFills = fills.map((fill) =>
		findFill(coarse.rgba, coarseWidth, coarseHeight, { ...options, fills: [fill] }),
	);
	const coarseIndex = (x: number, y: number): number => {
		const cx = Math.min(coarseWidth - 1, Math.floor((x * coarseWidth) / width));
		const cy = Math.min(coarseHeight - 1, Math.floor((y * coarseHeight) / height));
		return cy * coarseWidth + cx;
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
			const { rgba, width: bw, height: bh } = await readRgba(input, blockRaw, ['-srcwin', x0, y0, x1 - x0, y1 - y0]);
			if (options.nodata) applyNodata(rgba, bw, bh, options.nodata);
			const fill = new Uint8Array(bw * bh);
			fills.forEach((colour, f) => {
				const tests = fillTests(rgba, bw, bh, colour, tolerance);
				const inCoarseFill = (i: number): boolean =>
					coarseFills[f][coarseIndex(x0 + (i % bw), y0 + Math.floor(i / bw))] === 1;
				flood(bw, bh, tests, (i) => tests.pure(i) && inCoarseFill(i), 0, 0, fill);
			});
			clearFill(rgba, bw, bh, fill, options.erode ?? 2);
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
