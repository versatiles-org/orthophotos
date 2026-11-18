import { describe, expect, test } from 'vitest';
import { generateStatusPage, geometryBbox } from './html.ts';
import type { RegionMetadata } from '../lib/framework.ts';
import type { KnownRegion } from './geojson.ts';
import type { RegionStats, RegionStatsListing } from './stats.ts';

function makeMetadata(overrides: Partial<RegionMetadata>): RegionMetadata {
	return {
		status: overrides.status || 'released',
		notes: [],
		releaseDate: overrides.releaseDate || '2024-06-01',
		...overrides,
	} as RegionMetadata;
}

function makeKnownRegion(id: string, fullname: string): KnownRegion {
	return {
		type: 'Feature',
		properties: { id, name: id, fullname },
		geometry: {
			type: 'Polygon',
			coordinates: [
				[
					[0, 0],
					[1, 0],
					[1, 1],
					[0, 1],
					[0, 0],
				],
			],
		},
	};
}

/** Extract the rowData JSON from the generated HTML */
function extractRowData(html: string): Record<string, unknown>[] {
	const match = html.match(/const rowData = (\[.*?\]);/s);
	if (!match) throw new Error('Could not find rowData in HTML');
	return JSON.parse(match[1]);
}

/** Extract the map features from the generated HTML */
function extractFeatures(html: string): { id: number; properties: Record<string, unknown> }[] {
	const match = html.match(/const regionFeatures = (\{.*?\});\n/s);
	if (!match) throw new Error('Could not find regionFeatures in HTML');
	return JSON.parse(match[1]).features;
}

function file(date: string): RegionStats {
	return { size: 1000, tiles: 10, maxZoom: 17, areaKm2: 1, date };
}

function listing(regions: Map<string, RegionStats>): RegionStatsListing {
	return { generated: '2026-11-18', regions };
}

describe('generateStatusPage', () => {
	test('returns valid HTML with the header, map and table, and no grid library', () => {
		const html = generateStatusPage(new Map(), new Map());
		expect(html).toContain('<!DOCTYPE html>');
		expect(html).toContain('<title>VersaTiles Orthophotos - Status</title>');
		// The full-window layout in index.css relies on this order of the body's children.
		expect(html).toMatch(/<body>\s*<header>[\s\S]*<\/header>\s*<div id="map"><\/div>\s*<div id="regions"><\/div>/);
		expect(html).not.toContain('ag-grid');
		expect(html).toContain('<script src="index.js"></script>');
		expect(html).toContain('<link rel="stylesheet" href="index.css"');
		expect(html).toContain('0 regions');
	});

	test('shows region count in summary', () => {
		const metadata = new Map<string, RegionMetadata>([
			['de', makeMetadata({ status: 'released' })],
			['at', makeMetadata({ status: 'planned' })],
		]);
		const html = generateStatusPage(metadata, new Map());
		expect(html).toContain('2 regions');
	});

	test('summary counts statuses correctly', () => {
		const metadata = new Map<string, RegionMetadata>([
			['de', makeMetadata({ status: 'released' })],
			['at', makeMetadata({ status: 'released' })],
			['ch', makeMetadata({ status: 'planned' })],
		]);
		const html = generateStatusPage(metadata, new Map());
		expect(html).toContain('2 Released');
		expect(html).toContain('1 Planned');
		expect(html).not.toContain('Scraping</span>');
		expect(html).not.toContain('Blocked</span>');
	});

	test('row data contains region ID and status', () => {
		const metadata = new Map<string, RegionMetadata>([['de', makeMetadata({ status: 'released' })]]);
		const html = generateStatusPage(metadata, new Map());
		const rows = extractRowData(html);
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe('de');
		expect(rows[0].status).toBe('Released');
	});

	test('uses fullname from knownRegions', () => {
		const metadata = new Map<string, RegionMetadata>([['de', makeMetadata({ status: 'released' })]]);
		const knownRegions = new Map([['de', makeKnownRegion('de', 'Germany')]]);
		const html = generateStatusPage(metadata, knownRegions);
		const rows = extractRowData(html);
		expect(rows[0].name).toBe('Germany');
	});

	test('falls back to ID when region not in knownRegions', () => {
		const metadata = new Map<string, RegionMetadata>([['xx', makeMetadata({ status: 'planned' })]]);
		const html = generateStatusPage(metadata, new Map());
		const rows = extractRowData(html);
		expect(rows[0].name).toBe('xx');
	});

	test('includes license data', () => {
		const metadata = new Map<string, RegionMetadata>([
			[
				'de',
				makeMetadata({
					license: {
						name: 'CC BY 4.0',
						url: 'https://creativecommons.org/licenses/by/4.0/',
						requiresAttribution: true,
					},
				}),
			],
		]);
		const html = generateStatusPage(metadata, new Map());
		const rows = extractRowData(html);
		expect(rows[0].licenseName).toBe('CC BY 4.0');
		expect(rows[0].licenseUrl).toBe('https://creativecommons.org/licenses/by/4.0/');
	});

	test('includes creator data', () => {
		const metadata = new Map<string, RegionMetadata>([
			['de', makeMetadata({ creator: { name: 'GeoBasis-DE', url: 'https://www.bkg.bund.de/' } })],
		]);
		const html = generateStatusPage(metadata, new Map());
		const rows = extractRowData(html);
		expect(rows[0].creatorName).toBe('GeoBasis-DE');
		expect(rows[0].creatorUrl).toBe('https://www.bkg.bund.de/');
	});

	test('includes notes as array', () => {
		const metadata = new Map<string, RegionMetadata>([['de', makeMetadata({ notes: ['Some issue', 'Another note'] })]]);
		const html = generateStatusPage(metadata, new Map());
		const rows = extractRowData(html);
		expect(rows[0].notes).toEqual(['Some issue', 'Another note']);
	});

	test('includes date and releaseDate', () => {
		const metadata = new Map<string, RegionMetadata>([
			['de', makeMetadata({ status: 'released', date: '2024', releaseDate: '2025-03-01' })],
		]);
		const html = generateStatusPage(metadata, new Map());
		const rows = extractRowData(html);
		expect(rows[0].date).toBe('2024');
		expect(rows[0].releaseDate).toBe('2025-03-01');
	});

	test('releaseDate is empty for non-released regions', () => {
		const metadata = new Map<string, RegionMetadata>([['de', makeMetadata({ status: 'planned' })]]);
		const html = generateStatusPage(metadata, new Map());
		const rows = extractRowData(html);
		expect(rows[0].releaseDate).toBe('');
	});

	test('computes KB per tile and per km² from the stats', () => {
		const metadata = new Map<string, RegionMetadata>([
			['de/berlin', makeMetadata({})],
			['hu', makeMetadata({})],
		]);
		const regions = new Map([['de/berlin', { size: 2_062_941_743, tiles: 245_395, maxZoom: 18, areaKm2: 1576 }]]);
		const rows = extractRowData(generateStatusPage(metadata, new Map(), { listing: listing(regions) }));
		expect(rows[0].kbPerTile).toBe(8.4);
		expect(rows[0].kbPerKm2).toBe(1309);
		expect(rows[1].kbPerTile).toBeNull();
		expect(rows[1].kbPerKm2).toBeNull();
	});

	test("shows the code's statuses without a listing of the storage box", () => {
		const metadata = new Map<string, RegionMetadata>([['de', makeMetadata({ status: 'released' })]]);
		const html = generateStatusPage(metadata, new Map());
		expect(extractRowData(html)[0]).toMatchObject({ status: 'Released', file: null });
		expect(html).not.toContain('files as of');
	});

	test('marks a released region without a file as outdated, and one with a file as released', () => {
		const metadata = new Map<string, RegionMetadata>([
			['de/berlin', makeMetadata({ status: 'released', releaseDate: '2026-03-24' })],
			['de/hessen', makeMetadata({ status: 'released', releaseDate: '2026-03-21' })],
		]);
		const html = generateStatusPage(metadata, new Map(), {
			listing: listing(new Map([['de/berlin', file('2026-11-20')]])),
		});
		const rows = extractRowData(html);
		expect(rows[0]).toMatchObject({ status: 'Released', file: { date: '2026-11-20', size: 1000 } });
		expect(rows[1]).toMatchObject({ status: 'Outdated', releaseDate: '2026-03-21', file: null });
		expect(html).toContain('1 Outdated');
		expect(html).toContain('files as of 2026-11-18');
	});

	test('counts a scraping region with a file as released on its upload date', () => {
		const metadata = new Map<string, RegionMetadata>([['bg', makeMetadata({ status: 'scraping' })]]);
		const rows = extractRowData(
			generateStatusPage(metadata, new Map(), { listing: listing(new Map([['bg', file('2026-11-25')]])) }),
		);
		expect(rows[0]).toMatchObject({ status: 'Released', releaseDate: '2026-11-25' });
	});

	describe('a row that stands for several regions', () => {
		const regions = new Map<string, RegionMetadata>([
			['fr/a', makeMetadata({ status: 'released', releaseDate: '2026-04-29', aggregateUnder: 'fr' })],
			['fr/b', makeMetadata({ status: 'released', releaseDate: '2026-05-04', aggregateUnder: 'fr' })],
		]);
		const rowMetadata = new Map<string, RegionMetadata>([['fr', makeMetadata({ status: 'released' })]]);
		const files = listing(new Map([['fr/b', file('2026-11-21')]]));

		test('lists its parts with their own status and file', () => {
			const rows = extractRowData(generateStatusPage(rowMetadata, new Map(), { regions, listing: files }));
			expect(rows).toHaveLength(1);
			expect(rows[0]).toMatchObject({ id: 'fr', status: 'Outdated', releaseDate: '2026-05-04', file: null });
			expect(rows[0].parts).toEqual([
				expect.objectContaining({ id: 'fr/a', name: 'A', status: 'Outdated', releaseDate: '2026-04-29', file: null }),
				expect.objectContaining({ id: 'fr/b', status: 'Released', file: { date: '2026-11-21', size: 1000 } }),
			]);
		});

		test('draws each part on the map when all parts have an outline', () => {
			const known = new Map([
				['fr', makeKnownRegion('fr', 'France')],
				['fr/a', makeKnownRegion('fr/a', 'France - A')],
				['fr/b', makeKnownRegion('fr/b', 'France - B')],
			]);
			const features = extractFeatures(generateStatusPage(rowMetadata, known, { regions, listing: files }));
			expect(features.map((f) => f.properties)).toEqual([
				expect.objectContaining({ id: 'fr', part: 'fr/a', name: 'France - A', status: 'Outdated' }),
				expect.objectContaining({ id: 'fr', part: 'fr/b', name: 'France - B', status: 'Released' }),
			]);
			expect(features.map((f) => f.id)).toEqual([0, 1]);
		});

		test('draws the whole row when a part has no outline', () => {
			const known = new Map([
				['fr', makeKnownRegion('fr', 'France')],
				['fr/a', makeKnownRegion('fr/a', 'France - A')],
			]);
			const features = extractFeatures(generateStatusPage(rowMetadata, known, { regions, listing: files }));
			expect(features.map((f) => f.properties)).toEqual([
				expect.objectContaining({ id: 'fr', name: 'France', status: 'Outdated' }),
			]);
		});
	});

	test('passes the resolution as a number of cm', () => {
		const metadata = new Map<string, RegionMetadata>([
			['de', makeMetadata({ resolution: 20 })],
			['at', makeMetadata({})],
		]);
		const rows = extractRowData(generateStatusPage(metadata, new Map()));
		expect(rows[0].resolution).toBe(20);
		expect(rows[1].resolution).toBeNull();
	});

	test('gives each region with an outline its bounding box', () => {
		const metadata = new Map<string, RegionMetadata>([
			['de', makeMetadata({})],
			['xx', makeMetadata({})],
		]);
		const known = new Map([['de', makeKnownRegion('de', 'Deutschland')]]);
		const rows = extractRowData(generateStatusPage(metadata, known));
		expect(rows[0].bbox).toEqual([0, 0, 1, 1]);
		expect(rows[1].bbox).toBeNull();
	});

	test('escapes "<" in the inline data, so a note cannot end the script', () => {
		const metadata = new Map<string, RegionMetadata>([['de', makeMetadata({ notes: ['a </script><b>'] })]]);
		const html = generateStatusPage(metadata, new Map());
		expect(html).not.toContain('</script><b>');
		expect(extractRowData(html)[0].notes).toEqual(['a </script><b>']);
	});
});

describe('geometryBbox', () => {
	test('spans all parts of a multipolygon, rounded to 0.001°', () => {
		const square = (x: number, y: number) => [
			[
				[x, y],
				[x + 1.00049, y],
				[x + 1.00049, y + 1],
				[x, y + 1],
				[x, y],
			],
		];
		expect(geometryBbox({ type: 'MultiPolygon', coordinates: [square(-5, 40), square(10, 50)] })).toEqual([
			-5, 40, 11, 51,
		]);
	});
});
