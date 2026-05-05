import { describe, expect, test } from 'vitest';
import { bboxIntersectsPolygon, lonTo3857, latTo3857, pointInPolygon, projectGeometry3857 } from './geometry.ts';
import type { MultiPolygon, Polygon } from 'geojson';

const square: Polygon = {
	type: 'Polygon',
	coordinates: [
		[
			[0, 0],
			[10, 0],
			[10, 10],
			[0, 10],
			[0, 0],
		],
	],
};

const ring: Polygon = {
	type: 'Polygon',
	coordinates: [
		[
			[0, 0],
			[10, 0],
			[10, 10],
			[0, 10],
			[0, 0],
		],
		[
			[3, 3],
			[7, 3],
			[7, 7],
			[3, 7],
			[3, 3],
		],
	],
};

const twoIslands: MultiPolygon = {
	type: 'MultiPolygon',
	coordinates: [
		[
			[
				[0, 0],
				[1, 0],
				[1, 1],
				[0, 1],
				[0, 0],
			],
		],
		[
			[
				[5, 5],
				[6, 5],
				[6, 6],
				[5, 6],
				[5, 5],
			],
		],
	],
};

describe('pointInPolygon', () => {
	test('detects point inside a simple polygon', () => {
		expect(pointInPolygon([5, 5], square)).toBe(true);
	});

	test('detects point outside a simple polygon', () => {
		expect(pointInPolygon([15, 5], square)).toBe(false);
	});

	test('respects polygon holes (point inside hole returns false)', () => {
		expect(pointInPolygon([5, 5], ring)).toBe(false);
		expect(pointInPolygon([1, 1], ring)).toBe(true);
	});

	test('handles MultiPolygon (point inside any sub-polygon)', () => {
		expect(pointInPolygon([0.5, 0.5], twoIslands)).toBe(true);
		expect(pointInPolygon([5.5, 5.5], twoIslands)).toBe(true);
		expect(pointInPolygon([3, 3], twoIslands)).toBe(false);
	});
});

describe('bboxIntersectsPolygon', () => {
	test('returns true when bbox is fully inside polygon (no vertex inside bbox, but corners inside)', () => {
		expect(bboxIntersectsPolygon({ xmin: 4, ymin: 4, xmax: 6, ymax: 6 }, square)).toBe(true);
	});

	test('returns true when polygon vertex falls inside bbox', () => {
		expect(bboxIntersectsPolygon({ xmin: -1, ymin: -1, xmax: 1, ymax: 1 }, square)).toBe(true);
	});

	test('returns false when bbox is entirely outside polygon', () => {
		expect(bboxIntersectsPolygon({ xmin: 20, ymin: 20, xmax: 30, ymax: 30 }, square)).toBe(false);
	});

	test('handles MultiPolygon — true if any sub-polygon intersects', () => {
		expect(bboxIntersectsPolygon({ xmin: 0.4, ymin: 0.4, xmax: 0.6, ymax: 0.6 }, twoIslands)).toBe(true);
		expect(bboxIntersectsPolygon({ xmin: 5.4, ymin: 5.4, xmax: 5.6, ymax: 5.6 }, twoIslands)).toBe(true);
		expect(bboxIntersectsPolygon({ xmin: 3, ymin: 3, xmax: 4, ymax: 4 }, twoIslands)).toBe(false);
	});
});

describe('lonTo3857 / latTo3857', () => {
	test('origin maps to (0, 0)', () => {
		expect(lonTo3857(0)).toBe(0);
		expect(latTo3857(0)).toBeCloseTo(0, 6);
	});

	test('±180° lon maps to ±world extent', () => {
		expect(lonTo3857(180)).toBeCloseTo(20037508.34, 0);
		expect(lonTo3857(-180)).toBeCloseTo(-20037508.34, 0);
	});

	test('clamps polar lat to mercator-safe range', () => {
		const yNorth = latTo3857(89);
		const yMax = latTo3857(85.05112878);
		expect(yNorth).toBeCloseTo(yMax, 0);
	});
});

describe('projectGeometry3857', () => {
	test('reprojects all vertices of a Polygon', () => {
		const result = projectGeometry3857({
			type: 'Polygon',
			coordinates: [
				[
					[0, 0],
					[180, 0],
					[180, 0],
					[0, 0],
				],
			],
		}) as Polygon;
		expect(result.coordinates[0][0][0]).toBe(0);
		expect(result.coordinates[0][1][0]).toBeCloseTo(20037508.34, 0);
	});

	test('preserves MultiPolygon structure', () => {
		const result = projectGeometry3857(twoIslands) as MultiPolygon;
		expect(result.type).toBe('MultiPolygon');
		expect(result.coordinates).toHaveLength(2);
	});
});
