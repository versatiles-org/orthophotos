import { describe, expect, test } from 'vitest';
import { applyNodata, BORDER_FILL_OPTIONS, findFill, maskFill, parseNodata } from './fill-mask.ts';

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

const W = [255, 255, 255, 255]; // white fill
const N = [255, 254, 255, 255]; // near-white noise in the fill
const B = [0, 0, 0, 255]; // black fill
const K = [3, 0, 5, 255]; // near-black noise in the fill
const G = [60, 90, 50, 255]; // imagery
const R = [250, 250, 250, 255]; // bright roof inside the imagery
const T = [0, 0, 0, 0]; // transparent

describe('maskFill', () => {
	test('clears the white fill and the near-white pixels connected to it', () => {
		const rgba = image([W, N, G, G, G]);
		maskFill(rgba, 5, 1, { erode: 0 });
		expect(alpha(rgba)).toEqual([0, 0, 255, 255, 255]);
	});

	test('clears the black fill and the near-black pixels connected to it', () => {
		const rgba = image([G, G, G, K, B]);
		maskFill(rgba, 5, 1, { erode: 0 });
		expect(alpha(rgba)).toEqual([255, 255, 255, 0, 0]);
	});

	test('looks only for the fills it is given', () => {
		const rgba = image([W, G, G, G, B]);
		maskFill(rgba, 5, 1, { erode: 0, fills: ['white'] });
		expect(alpha(rgba)).toEqual([0, 255, 255, 255, 255]);
	});

	test('keeps a bright roof that does not touch the fill', () => {
		const rgba = image([W, G, R, G, G]);
		maskFill(rgba, 5, 1, { erode: 0 });
		expect(alpha(rgba)).toEqual([0, 255, 255, 255, 255]);
	});

	test('trims the imagery along the fill by `erode` pixels', () => {
		// 5 × 3, white in the left column
		const rgba = image([W, G, G, G, G, W, G, G, G, G, W, G, G, G, G]);
		maskFill(rgba, 5, 3, { erode: 2 });
		expect(alpha(rgba)).toEqual([0, 0, 0, 255, 255, 0, 0, 0, 255, 255, 0, 0, 0, 255, 255]);
	});

	test('treats already transparent pixels as fill for the trim', () => {
		const rgba = image([T, G, G, G]);
		maskFill(rgba, 4, 1, { erode: 1 });
		expect(alpha(rgba)).toEqual([0, 0, 255, 255]);
	});

	test('rejects a buffer of the wrong size', () => {
		expect(() => maskFill(new Uint8Array(10), 2, 2)).toThrow('expected 16 bytes of RGBA');
	});
});

describe('findFill with edgeOnly', () => {
	// 5 × 3: white at the left edge, and a white roof in the middle that touches nothing.
	const pixels = [W, G, G, G, G, W, G, W, G, G, W, G, G, G, G];

	test('counts fill at the edge of the raster, not a white roof inside', () => {
		const fill = findFill(image(pixels), 5, 3, { edgeOnly: true });
		expect([...fill]).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
	});

	test('keeps a black shadow inside the imagery', () => {
		const rgba = image([G, G, G, G, G, G, G, B, G, G, G, G, G, G, G]);
		expect(findFill(rgba, 5, 3, { edgeOnly: true }).every((v) => v === 0)).toBe(true);
	});

	test('counts fill next to a transparent pixel', () => {
		const rgba = image([G, G, G, G, G, G, T, W, G, G, G, G, G, G, G]);
		expect(findFill(rgba, 5, 3, { edgeOnly: true })[7]).toBe(1);
	});

	test('leaves areas smaller than minArea', () => {
		// The edge area has 3 of 15 pixels: 20%.
		expect(findFill(image(pixels), 5, 3, { edgeOnly: true, minArea: 0.25 }).every((v) => v === 0)).toBe(true);
		expect(findFill(image(pixels), 5, 3, { edgeOnly: true, minArea: 0.2 })[0]).toBe(1);
	});

	test('leaves textured areas, such as snow, below minPurity', () => {
		// One pure white pixel at the edge, three near-white ones connected to it: 25% pure.
		const snow = image([W, N, N, N, G]);
		expect(findFill(snow, 5, 1, { edgeOnly: true, minPurity: 0.5 }).every((v) => v === 0)).toBe(true);
		expect(findFill(snow, 5, 1, { edgeOnly: true, minPurity: 0.25 })[3]).toBe(1);
	});

	test('without edgeOnly every pure pixel starts an area', () => {
		expect(findFill(image(pixels), 5, 3)[7]).toBe(1);
	});

	test('the border settings look for both colours along the edge', () => {
		expect(BORDER_FILL_OPTIONS).toMatchObject({ fills: ['white', 'black'], edgeOnly: true });
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
		const rgba = image([W, G, B]);
		applyNodata(rgba, 3, 1, '0,0,0');
		expect(alpha(rgba)).toEqual([255, 255, 0]);
	});

	test('a fill in a nodata colour is no fill any more', () => {
		const rgba = image([W, W, G]);
		maskFill(rgba, 3, 1, { erode: 0, edgeOnly: true, nodata: '255,255,255' });
		expect(alpha(rgba)).toEqual([0, 0, 255]);
		expect([...findFill(rgba, 3, 1, { edgeOnly: true })]).toEqual([0, 0, 0]);
	});
});
