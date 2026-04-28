import { describe, expect, test } from 'vitest';
import { generateStatusPage } from './html.ts';
import type { RegionMetadata } from '../lib/framework.ts';
import type { KnownRegion } from './geojson.ts';

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

describe('generateStatusPage', () => {
	test('returns valid HTML with AG Grid', () => {
		const html = generateStatusPage(new Map(), new Map());
		expect(html).toContain('<!DOCTYPE html>');
		expect(html).toContain('<title>VersaTiles Orthophotos - Status</title>');
		expect(html).toContain('ag-grid-community');
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
		expect(rows[0].statusColor).toBe('#2da44e');
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
});
