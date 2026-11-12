import { describe, expect, test } from 'vitest';
import { parseStacPage } from './li.ts';

describe('parseStacPage', () => {
	test('collects the 10 cm GeoTIFFs and the next page', () => {
		const base = 'https://data.geo.admin.ch/ch.swisstopo.swissimage-dop10/swissimage-dop10_2025_2757-1222';
		const page = {
			features: [
				{
					assets: {
						'swissimage-dop10_2025_2757-1222_0.1_2056.tif': {
							href: `${base}/swissimage-dop10_2025_2757-1222_0.1_2056.tif`,
						},
						'swissimage-dop10_2025_2757-1222_2_2056.tif': {
							href: `${base}/swissimage-dop10_2025_2757-1222_2_2056.tif`,
						},
					},
				},
			],
			links: [
				{ rel: 'self', href: 'https://example.com/items?page=1' },
				{ rel: 'next', href: 'https://example.com/items?page=2' },
			],
		};
		expect(parseStacPage(page)).toEqual({
			urls: [`${base}/swissimage-dop10_2025_2757-1222_0.1_2056.tif`],
			next: 'https://example.com/items?page=2',
		});
	});

	test('has no next page on the last page', () => {
		expect(parseStacPage({ features: [], links: [{ rel: 'self', href: 'x' }] })).toEqual({ urls: [], next: undefined });
	});
});
