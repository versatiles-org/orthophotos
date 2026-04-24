import { describe, expect, test } from 'vitest';
import type { RegionMetadata } from '../lib/framework.ts';
import { applyAggregation, levenshtein, suggestSimilarRegions } from './index.ts';

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
	test('returns at most `limit` suggestions even for unrelated input', () => {
		const hits = suggestSimilarRegions('xx');
		expect(hits.length).toBeLessThanOrEqual(5);
	});
	test('returns an exact match first when one exists', () => {
		const hits = suggestSimilarRegions('fr/bretagne');
		expect(hits[0]).toBe('fr/bretagne');
	});
	test('respects the limit parameter', () => {
		expect(suggestSimilarRegions('de/bayren', 2).length).toBeLessThanOrEqual(2);
	});
});

describe('applyAggregation', () => {
	const license = { name: 'LO 2.0', url: 'https://x', requiresAttribution: true };
	const creator = { name: 'IGN', url: 'https://y' };

	function child(id: string, date: string, releaseDate: string): [string, RegionMetadata] {
		return [
			id,
			{
				status: 'released',
				notes: ['shared note', `${id} note`],
				license,
				creator,
				date,
				releaseDate,
				aggregateUnder: 'fr',
			},
		];
	}

	test('passes entries without aggregateUnder through unchanged', () => {
		const raw = new Map<string, RegionMetadata>([
			['al', { status: 'planned', notes: ['n'] }],
			['li', { status: 'released', notes: ['n'], releaseDate: '2024-01-01' }],
		]);
		const out = applyAggregation(raw);
		expect(out.size).toBe(2);
		expect(out.get('al')).toEqual(raw.get('al'));
		expect(out.get('li')).toEqual(raw.get('li'));
	});

	test('collapses aggregateUnder children into a single parent entry', () => {
		const raw = new Map([child('fr/a', '2022-2024', '2026-01-01'), child('fr/b', '2023', '2026-03-15')]);
		const out = applyAggregation(raw);
		expect(out.size).toBe(1);
		expect(out.has('fr/a')).toBe(false);
		expect(out.has('fr/b')).toBe(false);
		const fr = out.get('fr')!;
		expect(fr.status).toBe('released');
		expect(fr.date).toBe('2022-2024');
		expect(fr.releaseDate).toBe('2026-03-15');
		expect(fr.license).toEqual(license);
		expect(fr.notes).toEqual(['shared note', 'fr/a note', 'fr/b note']);
		expect(fr.aggregateUnder).toBeUndefined();
	});

	test('returns a single-year date when all children share one year', () => {
		const raw = new Map([child('fr/a', '2024', '2025-01-01'), child('fr/b', '2024', '2025-01-02')]);
		expect(applyAggregation(raw).get('fr')!.date).toBe('2024');
	});

	test('uses scraping status when children are mixed', () => {
		const raw = new Map<string, RegionMetadata>([
			['fr/a', { status: 'released', notes: [], releaseDate: '2024-01-01', aggregateUnder: 'fr' }],
			['fr/b', { status: 'planned', notes: [], aggregateUnder: 'fr' }],
		]);
		expect(applyAggregation(raw).get('fr')!.status).toBe('scraping');
	});

	test('throws when parent id collides with an existing entry', () => {
		const raw = new Map<string, RegionMetadata>([
			['fr', { status: 'planned', notes: [] }],
			['fr/a', { status: 'planned', notes: [], aggregateUnder: 'fr' }],
		]);
		expect(() => applyAggregation(raw)).toThrow("Cannot aggregate children under 'fr'");
	});
});
