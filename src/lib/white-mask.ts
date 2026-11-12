/**
 * Turns an opaque white background into transparency, for WMS layers that fill the area
 * without imagery with white inside their extent instead of leaving it transparent.
 */

import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { runCommand } from './command.ts';
import { safeRm } from './fs.ts';

export interface WhiteMaskOptions {
	/** A pixel whose R, G and B are all at least this counts as near-white. Default: 240. */
	threshold?: number;
	/** Pixels of imagery to remove along the background, for blended edge pixels. Default: 2. */
	erode?: number;
}

/**
 * Sets the alpha of the white background to 0, in place. `rgba` holds the four bands one after
 * another (band-sequential), each `width * height` bytes.
 *
 * The background is every pure white pixel (255, 255, 255) plus the near-white pixels connected
 * to it, so bright roofs inside the imagery stay. Then the imagery is shrunk by `erode` pixels
 * along the background, which removes the pixels blended between imagery and white.
 */
export function maskWhiteBackground(rgba: Uint8Array, width: number, height: number, options?: WhiteMaskOptions): void {
	const threshold = options?.threshold ?? 240;
	const erode = options?.erode ?? 2;
	const n = width * height;
	if (rgba.length !== 4 * n) throw new Error(`maskWhiteBackground: expected ${4 * n} bytes, got ${rgba.length}`);
	const [r, g, b, a] = [0, 1, 2, 3].map((band) => rgba.subarray(band * n, (band + 1) * n));

	// Flood fill from the pure white pixels through near-white ones.
	const background = new Uint8Array(n);
	const queue = new Int32Array(n);
	let head = 0;
	let tail = 0;
	for (let i = 0; i < n; i++) {
		if (a[i] > 0 && r[i] === 255 && g[i] === 255 && b[i] === 255) {
			background[i] = 1;
			queue[tail++] = i;
		}
	}
	const nearWhite = (i: number): boolean => r[i] >= threshold && g[i] >= threshold && b[i] >= threshold;
	const visit = (j: number): void => {
		if (!background[j] && a[j] > 0 && nearWhite(j)) {
			background[j] = 1;
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
 * Applies `maskWhiteBackground` to an RGBA GeoTIFF and writes the result as a new GeoTIFF.
 * The raster goes through GDAL's ENVI format (raw bytes plus a header with the georeference),
 * so nothing is compressed lossily on the way. Meant for WMS blocks of a few thousand pixels.
 */
export async function maskWhiteBackgroundFile(
	input: string,
	output: string,
	options?: WhiteMaskOptions,
): Promise<void> {
	const raw = `${output}.raw`;
	const rawHeader = `${output}.hdr`;
	const masked = `${output}.masked.raw`;
	try {
		await runCommand('gdal_translate', ['-q', '-of', 'ENVI', '-co', 'INTERLEAVE=BSQ', input, raw], { quiet: true });
		const header = readFileSync(rawHeader, 'utf-8');
		const width = Number(header.match(/samples\s*=\s*(\d+)/)?.[1]);
		const height = Number(header.match(/lines\s*=\s*(\d+)/)?.[1]);
		const bands = Number(header.match(/bands\s*=\s*(\d+)/)?.[1]);
		if (bands !== 4) throw new Error(`maskWhiteBackgroundFile: expected 4 bands in ${input}, got ${bands}`);

		const rgba = new Uint8Array(readFileSync(raw));
		maskWhiteBackground(rgba, width, height, options);
		writeFileSync(masked, rgba);
		copyFileSync(rawHeader, `${masked.slice(0, -'.raw'.length)}.hdr`);

		await runCommand(
			'gdal_translate',
			['-q', '-co', 'COMPRESS=DEFLATE', '-co', 'PREDICTOR=2', '-co', 'ALPHA=YES', masked, output],
			{ quiet: true },
		);
	} finally {
		for (const path of [raw, rawHeader, `${raw}.aux.xml`, masked, `${masked.slice(0, -'.raw'.length)}.hdr`]) {
			safeRm(path);
		}
	}
}
