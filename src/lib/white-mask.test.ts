import { describe, expect, test } from 'vitest';
import { applyNodata, findWhiteBackground, maskWhiteBackground, parseNodata } from './white-mask.ts';

/** Builds band-sequential RGBA bytes from one `[r, g, b, a]` per pixel, row by row. */
function image(pixels: number[][]): Uint8Array {
	const n = pixels.length;
	const out = new Uint8Array(4 * n);
	pixels.forEach((p, i) => p.forEach((v, band) => (out[band * n + i] = v)));
	return out;
}

function alpha(rgba: Uint8Array): number[] {
	return [...rgba.subarray((rgba.length / 4) * 3)];
}

const W = [255, 255, 255, 255]; // white background
const N = [255, 254, 255, 255]; // near-white noise in the background
const G = [60, 90, 50, 255]; // imagery
const R = [250, 250, 250, 255]; // bright roof inside the imagery

describe('maskWhiteBackground', () => {
	test('clears the white background and the near-white pixels connected to it', () => {
		// 5 × 1: white, noise, imagery, imagery, imagery
		const rgba = image([W, N, G, G, G]);
		maskWhiteBackground(rgba, 5, 1, { erode: 0 });
		expect(alpha(rgba)).toEqual([0, 0, 255, 255, 255]);
	});

	test('keeps a bright roof that does not touch the background', () => {
		const rgba = image([W, G, R, G, G]);
		maskWhiteBackground(rgba, 5, 1, { erode: 0 });
		expect(alpha(rgba)).toEqual([0, 255, 255, 255, 255]);
	});

	test('trims the imagery along the background by `erode` pixels', () => {
		// 5 × 3, white in the left column
		const rgba = image([W, G, G, G, G, W, G, G, G, G, W, G, G, G, G]);
		maskWhiteBackground(rgba, 5, 3, { erode: 2 });
		expect(alpha(rgba)).toEqual([0, 0, 0, 255, 255, 0, 0, 0, 255, 255, 0, 0, 0, 255, 255]);
	});

	test('treats already transparent pixels as background for the trim', () => {
		const rgba = image([[0, 0, 0, 0], G, G, G]);
		maskWhiteBackground(rgba, 4, 1, { erode: 1 });
		expect(alpha(rgba)).toEqual([0, 0, 255, 255]);
	});

	test('rejects a buffer of the wrong size', () => {
		expect(() => maskWhiteBackground(new Uint8Array(10), 2, 2)).toThrow('expected 16 bytes of RGBA');
	});
});

describe('findWhiteBackground with edgeOnly', () => {
	// 5 × 3: white at the left edge, and a white roof in the middle that touches nothing.
	const pixels = [W, G, G, G, G, W, G, W, G, G, W, G, G, G, G];

	test('counts white at the edge of the raster, not a white roof inside', () => {
		const background = findWhiteBackground(image(pixels), 5, 3, { edgeOnly: true });
		expect([...background]).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
	});

	test('counts white next to a transparent pixel', () => {
		const T = [0, 0, 0, 0];
		const rgba = image([G, G, G, G, G, G, T, W, G, G, G, G, G, G, G]);
		expect(findWhiteBackground(rgba, 5, 3, { edgeOnly: true })[7]).toBe(1);
	});

	test('leaves white areas smaller than minArea', () => {
		// The edge area has 3 of 15 pixels: 20%.
		expect(findWhiteBackground(image(pixels), 5, 3, { edgeOnly: true, minArea: 0.25 }).every((v) => v === 0)).toBe(
			true,
		);
		expect(findWhiteBackground(image(pixels), 5, 3, { edgeOnly: true, minArea: 0.2 })[0]).toBe(1);
	});

	test('without edgeOnly every pure white pixel starts an area', () => {
		expect(findWhiteBackground(image(pixels), 5, 3)[7]).toBe(1);
	});
});

describe('nodata', () => {
	test('parses colours and a single grey value', () => {
		expect(parseNodata('0,0,0;255,255,255')).toEqual([
			[0, 0, 0],
			[255, 255, 255],
		]);
		expect(parseNodata('255')).toEqual([[255, 255, 255]]);
		expect(() => parseNodata('1,2')).toThrow('Invalid nodata colour "1,2"');
	});

	test('makes nodata colours transparent', () => {
		const rgba = image([W, G, [0, 0, 0, 255]]);
		applyNodata(rgba, 3, 1, '0,0,0');
		expect(alpha(rgba)).toEqual([255, 255, 0]);
	});

	test('a white nodata colour is no white background any more', () => {
		const rgba = image([W, W, G]);
		maskWhiteBackground(rgba, 3, 1, { erode: 0, edgeOnly: true, nodata: '255,255,255' });
		expect(alpha(rgba)).toEqual([0, 0, 255]);
		expect([...findWhiteBackground(rgba, 3, 1, { edgeOnly: true })]).toEqual([0, 0, 0]);
	});
});
