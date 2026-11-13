import { describe, expect, test } from 'vitest';
import { COASTLINE_FADE, getCoastlineLayers } from './coastline.ts';

describe('getCoastlineLayers', () => {
	test('masks the satellite container once per zoom range, with buffer and blur growing with zoom', () => {
		const layers = getCoastlineLayers('sat.versatiles', 'land.geojson');
		expect(layers).toHaveLength(COASTLINE_FADE.length);
		expect(layers[0]).toBe(
			'from_container filename="sat.versatiles" | filter level_min=0 level_max=7 | raster_mask geojson="land.geojson" buffer=1000 blur=1000 blur_function=cosine',
		);
		expect(layers.at(-1)).toBe(
			'from_container filename="sat.versatiles" | filter level_min=11 | raster_mask geojson="land.geojson" buffer=4000 blur=4000 blur_function=cosine',
		);
	});
});

describe('COASTLINE_FADE', () => {
	test('covers every zoom level once, starting at 0', () => {
		let next = 0;
		for (const [i, step] of COASTLINE_FADE.entries()) {
			expect(step.levelMin).toBe(next);
			if (i < COASTLINE_FADE.length - 1) {
				expect(step.levelMax).toBeGreaterThanOrEqual(step.levelMin);
				next = step.levelMax! + 1;
			} else {
				expect(step.levelMax).toBeUndefined();
			}
		}
	});

	test('reaches further into the sea at higher zooms', () => {
		const distances = COASTLINE_FADE.map((s) => s.distance);
		expect(distances).toEqual([...distances].sort((a, b) => a - b));
	});
});
