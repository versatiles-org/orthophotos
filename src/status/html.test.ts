import { describe, expect, test } from 'vitest';
import { generateStatusPage } from './html.ts';
import type { RegionMetadata } from '../lib/framework.ts';
import type { KnownRegion } from './geojson.ts';

function makeMetadata(overrides: Partial<RegionMetadata> & { status: RegionMetadata['status'] }): RegionMetadata {
	return {
		notes: [],
		...overrides,
	};
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

describe('generateStatusPage', () => {
	test('returns valid HTML with basic structure', () => {
		const metadata = new Map<string, RegionMetadata>();
		const knownRegions = new Map<string, KnownRegion>();

		const html = generateStatusPage(metadata, knownRegions);

		expect(html).toContain('<!DOCTYPE html>');
		expect(html).toContain('<title>VersaTiles Orthophotos - Status</title>');
		expect(html).toContain('<table>');
		expect(html).toContain('<th>ID</th>');
		expect(html).toContain('<th>Status</th>');
		expect(html).toContain('0 regions');
	});

	test('shows region count in summary', () => {
		const metadata = new Map<string, RegionMetadata>([
			['de', makeMetadata({ status: 'released' })],
			['at', makeMetadata({ status: 'planned' })],
		]);
		const knownRegions = new Map<string, KnownRegion>();

		const html = generateStatusPage(metadata, knownRegions);

		expect(html).toContain('2 regions');
	});

	test('renders status labels and colors', () => {
		const metadata = new Map<string, RegionMetadata>([
			['de', makeMetadata({ status: 'released' })],
			['at', makeMetadata({ status: 'scraping' })],
			['ch', makeMetadata({ status: 'planned' })],
			['fr', makeMetadata({ status: 'blocked' })],
		]);
		const knownRegions = new Map<string, KnownRegion>();

		const html = generateStatusPage(metadata, knownRegions);

		expect(html).toContain('color:#2da44e');
		expect(html).toContain('Released');
		expect(html).toContain('color:#bf8700');
		expect(html).toContain('Scraping');
		expect(html).toContain('color:#768390');
		expect(html).toContain('Planned');
		expect(html).toContain('color:#cf222e');
		expect(html).toContain('Blocked');
	});

	test('summary counts statuses correctly', () => {
		const metadata = new Map<string, RegionMetadata>([
			['de', makeMetadata({ status: 'released' })],
			['at', makeMetadata({ status: 'released' })],
			['ch', makeMetadata({ status: 'planned' })],
		]);
		const knownRegions = new Map<string, KnownRegion>();

		const html = generateStatusPage(metadata, knownRegions);

		// Summary should show "2 Released" and "1 Planned"
		expect(html).toContain('2 Released');
		expect(html).toContain('1 Planned');
		// Should not show statuses with 0 count
		expect(html).not.toContain('Scraping</span>');
		expect(html).not.toContain('Blocked</span>');
	});

	test('uses fullname from knownRegions when available', () => {
		const metadata = new Map<string, RegionMetadata>([['de', makeMetadata({ status: 'released' })]]);
		const knownRegions = new Map<string, KnownRegion>([['de', makeKnownRegion('de', 'Germany')]]);

		const html = generateStatusPage(metadata, knownRegions);

		expect(html).toContain('Germany');
	});

	test('falls back to ID when region not in knownRegions', () => {
		const metadata = new Map<string, RegionMetadata>([['xx', makeMetadata({ status: 'planned' })]]);
		const knownRegions = new Map<string, KnownRegion>();

		const html = generateStatusPage(metadata, knownRegions);

		// ID appears in both the ID column and as fallback name
		expect(html).toContain('xx');
	});

	test('renders license link', () => {
		const metadata = new Map<string, RegionMetadata>([
			[
				'de',
				makeMetadata({
					status: 'released',
					license: {
						name: 'CC BY 4.0',
						url: 'https://creativecommons.org/licenses/by/4.0/',
						requiresAttribution: true,
					},
				}),
			],
		]);
		const knownRegions = new Map<string, KnownRegion>();

		const html = generateStatusPage(metadata, knownRegions);

		expect(html).toContain('href="https://creativecommons.org/licenses/by/4.0/"');
		expect(html).toContain('CC BY 4.0');
	});

	test('renders creator link', () => {
		const metadata = new Map<string, RegionMetadata>([
			[
				'de',
				makeMetadata({
					status: 'released',
					creator: { name: 'GeoBasis-DE', url: 'https://www.bkg.bund.de/' },
				}),
			],
		]);
		const knownRegions = new Map<string, KnownRegion>();

		const html = generateStatusPage(metadata, knownRegions);

		expect(html).toContain('href="https://www.bkg.bund.de/"');
		expect(html).toContain('GeoBasis-DE');
	});

	test('renders notes as details/ul', () => {
		const metadata = new Map<string, RegionMetadata>([
			[
				'de',
				makeMetadata({
					status: 'released',
					notes: ['Some issue here', 'Another note'],
				}),
			],
		]);
		const knownRegions = new Map<string, KnownRegion>();

		const html = generateStatusPage(metadata, knownRegions);

		expect(html).toContain('<details>');
		expect(html).toContain('<summary>2 notes</summary>');
		expect(html).toContain('<ul>');
		expect(html).toContain('<li>Some issue here</li>');
		expect(html).toContain('<li>Another note</li>');
	});

	test('renders single note with singular label', () => {
		const metadata = new Map<string, RegionMetadata>([
			[
				'de',
				makeMetadata({
					status: 'released',
					notes: ['Only one note'],
				}),
			],
		]);
		const knownRegions = new Map<string, KnownRegion>();

		const html = generateStatusPage(metadata, knownRegions);

		expect(html).toContain('<summary>1 note</summary>');
	});

	test('renders no notes section when notes array is empty', () => {
		const metadata = new Map<string, RegionMetadata>([['de', makeMetadata({ status: 'released', notes: [] })]]);
		const knownRegions = new Map<string, KnownRegion>();

		const html = generateStatusPage(metadata, knownRegions);

		expect(html).not.toContain('<details>');
		expect(html).not.toContain('<summary>');
	});

	test('renders date when present', () => {
		const metadata = new Map<string, RegionMetadata>([['de', makeMetadata({ status: 'released', date: '2024-06' })]]);
		const knownRegions = new Map<string, KnownRegion>();

		const html = generateStatusPage(metadata, knownRegions);

		expect(html).toContain('2024-06');
	});

	test('escapes HTML special characters', () => {
		const metadata = new Map<string, RegionMetadata>([
			[
				'de',
				makeMetadata({
					status: 'released',
					notes: ['Use <script> & "quotes"'],
				}),
			],
		]);
		const knownRegions = new Map<string, KnownRegion>();

		const html = generateStatusPage(metadata, knownRegions);

		expect(html).toContain('&lt;script&gt;');
		expect(html).toContain('&amp;');
		expect(html).toContain('&quot;quotes&quot;');
		expect(html).not.toContain('<script>');
	});

	test('sorts regions alphabetically by ID', () => {
		const metadata = new Map<string, RegionMetadata>([
			['fr', makeMetadata({ status: 'planned' })],
			['at', makeMetadata({ status: 'released' })],
			['de', makeMetadata({ status: 'scraping' })],
		]);
		const knownRegions = new Map<string, KnownRegion>();

		const html = generateStatusPage(metadata, knownRegions);

		const atIdx = html.indexOf('>at<');
		const deIdx = html.indexOf('>de<');
		const frIdx = html.indexOf('>fr<');
		expect(atIdx).toBeLessThan(deIdx);
		expect(deIdx).toBeLessThan(frIdx);
	});
});
