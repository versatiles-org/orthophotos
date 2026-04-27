import { describe, expect, test } from 'vitest';
import { parseResources } from './hamburg.ts';

describe('parseResources', () => {
	test('keeps only GEOTIFF resources whose URL ends with .zip', () => {
		const data = {
			result: {
				resources: [
					{ name: 'A', format: 'GEOTIFF', url: 'https://example.com/a.zip' },
					{ name: 'B', format: 'JPEG', url: 'https://example.com/b.zip' },
					{ name: 'C', format: 'GEOTIFF', url: 'https://example.com/c.tif' },
					{ name: 'D', format: 'GEOTIFF', url: 'https://example.com/d.zip' },
				],
			},
		};
		const out = parseResources(data);
		expect(out).toEqual([
			{ id: 'a', url: 'https://example.com/a.zip' },
			{ id: 'd', url: 'https://example.com/d.zip' },
		]);
	});

	test('returns empty array when no resources match', () => {
		expect(parseResources({ result: { resources: [] } })).toEqual([]);
	});
});
