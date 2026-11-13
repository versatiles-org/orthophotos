import { describe, expect, test } from 'vitest';
import { aggregateStats, parseProbePyramid, summarizeStats, tileAreaKm2, type RegionStats } from './stats.ts';

// Shortened output of `versatiles probe` for de/berlin.versatiles (November 2026).
const PROBE_BERLIN = `meta_data:
  meta: {
    "maxzoom": 18,
    "minzoom": 0
  }
parameters:
  tile_pyramid:
    level │      x0 │      x1 │     y0 │     y1 │   tiles │ coverage
    ──────┼─────────┼─────────┼────────┼────────┼─────────┼─────────
        0 │       0 │       0 │      0 │      0 │       1 │     100%
       16 │  35_145 │  35_273 │ 21_444 │ 21_551 │  12_732 │      91%
       17 │  70_290 │  70_547 │ 42_888 │ 43_102 │  46_378 │      83%
       18 │ 140_581 │ 141_095 │ 85_776 │ 86_205 │ 181_916 │      82%
  tile compression: Uncompressed
  tile format: WEBP
`;

describe('parseProbePyramid', () => {
	test('reads level, rows and tiles, with underscores as thousands separators', () => {
		expect(parseProbePyramid(PROBE_BERLIN)).toEqual([
			{ level: 0, y0: 0, y1: 0, tiles: 1 },
			{ level: 16, y0: 21444, y1: 21551, tiles: 12732 },
			{ level: 17, y0: 42888, y1: 43102, tiles: 46378 },
			{ level: 18, y0: 85776, y1: 86205, tiles: 181916 },
		]);
	});

	test('returns nothing for output without a pyramid', () => {
		expect(parseProbePyramid('Error: Failed to get reader')).toEqual([]);
	});
});

describe('tileAreaKm2', () => {
	test('the zoom 0 tile covers the Earth between ±85.05°', () => {
		const sphere = 4 * Math.PI * 6371.0088 ** 2;
		expect(tileAreaKm2(0, 0) / sphere).toBeCloseTo(Math.sin((85.0511 * Math.PI) / 180), 4);
	});

	test('a zoom 18 tile in Berlin is about 93 m wide', () => {
		expect(tileAreaKm2(18, 85990)).toBeCloseTo(0.0093 ** 2 * 100, 3);
	});
});

describe('summarizeStats', () => {
	test('sums tiles over all levels and measures the area at the top zoom', () => {
		const stats = summarizeStats(2_062_941_743, parseProbePyramid(PROBE_BERLIN));
		expect(stats.size).toBe(2_062_941_743);
		expect(stats.tiles).toBe(1 + 12_732 + 46_378 + 181_916);
		expect(stats.maxZoom).toBe(18);
		expect(stats.areaKm2).toBeGreaterThan(1560);
		expect(stats.areaKm2).toBeLessThan(1590);
	});

	test('throws without a pyramid', () => {
		expect(() => summarizeStats(1, [])).toThrow('Tile pyramid is empty');
	});
});

describe('aggregateStats', () => {
	const a: RegionStats = { size: 100, tiles: 10, maxZoom: 17, areaKm2: 5 };
	const b: RegionStats = { size: 300, tiles: 20, maxZoom: 18, areaKm2: 15 };

	test('keeps regions that are not aggregated', () => {
		const result = aggregateStats(new Map([['hu', a]]), new Map([['hu', {}]]));
		expect(result.get('hu')).toEqual(a);
	});

	test('sums the children into their parent', () => {
		const metadata = new Map([
			['fr/a', { aggregateUnder: 'fr' }],
			['fr/b', { aggregateUnder: 'fr' }],
		]);
		const result = aggregateStats(
			new Map([
				['fr/a', a],
				['fr/b', b],
			]),
			metadata,
		);
		expect(result.get('fr')).toEqual({ size: 400, tiles: 30, maxZoom: 18, areaKm2: 20 });
		expect(result.has('fr/a')).toBe(false);
	});

	test('leaves the parent out while a child has no stats', () => {
		const metadata = new Map([
			['fr/a', { aggregateUnder: 'fr' }],
			['fr/b', { aggregateUnder: 'fr' }],
		]);
		expect(aggregateStats(new Map([['fr/a', a]]), metadata).has('fr')).toBe(false);
	});
});
