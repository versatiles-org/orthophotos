import { describe, expect, test } from 'vitest';
import { maskWhiteBackground } from './white-mask.ts';

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
		expect(() => maskWhiteBackground(new Uint8Array(10), 2, 2)).toThrow('expected 16 bytes');
	});
});
