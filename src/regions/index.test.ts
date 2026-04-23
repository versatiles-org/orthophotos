import { describe, expect, test } from 'vitest';
import { levenshtein, suggestSimilarRegions } from './index.ts';

describe('levenshtein', () => {
	test('returns 0 for equal strings', () => {
		expect(levenshtein('abc', 'abc')).toBe(0);
	});
	test('handles empty inputs', () => {
		expect(levenshtein('', 'abc')).toBe(3);
		expect(levenshtein('abc', '')).toBe(3);
	});
	test('counts single-character edits', () => {
		expect(levenshtein('kitten', 'sitting')).toBe(3);
		expect(levenshtein('bayren', 'bayern')).toBe(2);
	});
	test('is symmetric', () => {
		expect(levenshtein('de/bayern', 'de/bayren')).toBe(levenshtein('de/bayren', 'de/bayern'));
	});
});

describe('suggestSimilarRegions', () => {
	test('finds the intended region for a simple typo', () => {
		expect(suggestSimilarRegions('de/bayren')).toContain('de/bayern');
	});
	test('suggests prefixed form when the country code is missing', () => {
		expect(suggestSimilarRegions('bayern')).toContain('de/bayern');
	});
	test('handles umlaut → ue substitution', () => {
		expect(suggestSimilarRegions('de/baden_württemberg')).toContain('de/baden_wuerttemberg');
	});
	test('returns no suggestions for very short unrelated input', () => {
		expect(suggestSimilarRegions('xx')).toEqual([]);
	});
	test('returns an exact match first when one exists', () => {
		const hits = suggestSimilarRegions('fr/bretagne');
		expect(hits[0]).toBe('fr/bretagne');
	});
	test('respects the limit parameter', () => {
		expect(suggestSimilarRegions('de/bayren', 2).length).toBeLessThanOrEqual(2);
	});
});
