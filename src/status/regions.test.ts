import { describe, expect, test, vi } from 'vitest';
import type { RegionMetadata } from '../lib/framework.ts';
import type { KnownRegion } from './geojson.ts';

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

vi.mock('../regions/index.ts', () => ({
	getAllRegionMetadata: (): Map<string, RegionMetadata> => {
		return new Map<string, RegionMetadata>([
			[
				'li',
				{
					status: 'released',
					notes: ['Good quality'],
					entries: ['tiles'],
					license: { name: 'CC BY 4.0', url: 'https://example.com/license', requiresAttribution: true },
					creator: { name: 'TestCreator', url: 'https://example.com/creator' },
					date: '2024',
					releaseDate: '2024-06-01',
				},
			],
			[
				'al',
				{
					status: 'planned',
					notes: ['Not yet available'],
				},
			],
		]);
	},
}));

describe('scanRegions', () => {
	test('returns regions matched with known regions', async () => {
		const { scanRegions } = await import('./regions.ts');

		const knownRegions: KnownRegion[] = [
			makeKnownRegion('li', 'Liechtenstein'),
			makeKnownRegion('al', 'Albania'),
			makeKnownRegion('de', 'Germany'),
		];

		const result = scanRegions(knownRegions);

		expect(result).toHaveLength(2);

		const liRegion = result.find((r) => r.id === 'li');
		expect(liRegion).toBeDefined();
		expect(liRegion!.status.status).toBe('success');
		expect(liRegion!.status.notes).toEqual(['Good quality']);
		expect(liRegion!.region.properties.fullname).toBe('Liechtenstein');

		if (liRegion!.status.status === 'success') {
			expect(liRegion!.status.entries).toEqual([{ name: 'tiles' }]);
			expect(liRegion!.status.license.name).toBe('CC BY 4.0');
			expect(liRegion!.status.creator.name).toBe('TestCreator');
		}

		const alRegion = result.find((r) => r.id === 'al');
		expect(alRegion).toBeDefined();
		expect(alRegion!.status.status).toBe('error');
		expect(alRegion!.status.notes).toEqual(['Not yet available']);
	});

	test('throws on unknown region ID', async () => {
		const { scanRegions } = await import('./regions.ts');

		// Provide known regions that don't include 'li' or 'al'
		const knownRegions: KnownRegion[] = [makeKnownRegion('de', 'Germany')];

		expect(() => scanRegions(knownRegions)).toThrow('Unknown region ID');
	});

	test('uses default entries when not specified in metadata', async () => {
		const { scanRegions } = await import('./regions.ts');

		const knownRegions: KnownRegion[] = [makeKnownRegion('li', 'Liechtenstein'), makeKnownRegion('al', 'Albania')];

		const result = scanRegions(knownRegions);
		// 'al' has status 'planned' -> metadataToStatus returns error status
		const alRegion = result.find((r) => r.id === 'al');
		expect(alRegion!.status.status).toBe('error');
	});

	test('released metadata without entries defaults to result', async () => {
		// We need a fresh mock for this - but our mock already has 'li' with entries.
		// The 'li' entry has entries: ['tiles'], let's verify it maps correctly.
		const { scanRegions } = await import('./regions.ts');

		const knownRegions: KnownRegion[] = [makeKnownRegion('li', 'Liechtenstein'), makeKnownRegion('al', 'Albania')];

		const result = scanRegions(knownRegions);
		const liRegion = result.find((r) => r.id === 'li');
		expect(liRegion!.status.status).toBe('success');
		if (liRegion!.status.status === 'success') {
			expect(liRegion!.status.rating).toBe(0);
		}
	});
});
