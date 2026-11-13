import { describe, expect, test } from 'vitest';
import { findNewestRevision, parseResources } from './hamburg.ts';

describe('findNewestRevision', () => {
	const pkg = (name: string) => ({ name, resources: [] });

	test('takes the highest revision number, not the order of the results', () => {
		const data = {
			result: {
				results: [
					pkg('luftbilder-hamburg-dop-zeitreihe-belaubt4'),
					pkg('luftbilder-hamburg-dop-zeitreihe-belaubt'),
					pkg('luftbilder-hamburg-dop-zeitreihe-belaubt12'),
					pkg('luftbilder-hamburg-dop-zeitreihe-belaubt5'),
				],
			},
		};
		expect(findNewestRevision(data).name).toBe('luftbilder-hamburg-dop-zeitreihe-belaubt12');
	});

	test('counts the package without a number as revision 0', () => {
		const data = { result: { results: [pkg('luftbilder-hamburg-dop-zeitreihe-belaubt')] } };
		expect(findNewestRevision(data).name).toBe('luftbilder-hamburg-dop-zeitreihe-belaubt');
	});

	test('ignores other datasets the search matches', () => {
		const data = {
			result: {
				results: [
					pkg('luftbilder-hamburg-dop-zeitreihe-belaubt2'),
					pkg('luftbilder-hamburg-dop-zeitreihe-belaubt-extra9'),
					pkg('luftbilder-hamburg-dop-zeitreihe-unbelaubt7'),
				],
			},
		};
		expect(findNewestRevision(data).name).toBe('luftbilder-hamburg-dop-zeitreihe-belaubt2');
	});

	test('throws when no revision is found', () => {
		expect(() => findNewestRevision({ result: { results: [] } })).toThrow('No CKAN package');
	});
});

describe('parseResources', () => {
	test('keeps only GEOTIFF resources whose URL ends with .zip', () => {
		const pkg = {
			resources: [
				{ name: 'A', format: 'GEOTIFF', url: 'https://example.com/a.zip' },
				{ name: 'B', format: 'JPEG', url: 'https://example.com/b.zip' },
				{ name: 'C', format: 'GEOTIFF', url: 'https://example.com/c.tif' },
				{ name: 'D', format: 'GEOTIFF', url: 'https://example.com/d.zip' },
			],
		};
		const out = parseResources(pkg);
		expect(out).toEqual([
			{ id: 'a', url: 'https://example.com/a.zip' },
			{ id: 'd', url: 'https://example.com/d.zip' },
		]);
	});

	test('returns empty array when no resources match', () => {
		expect(parseResources({ resources: [] })).toEqual([]);
	});
});
