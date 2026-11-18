import { describe, expect, test } from 'vitest';
import { combinedStatus, currentStatus } from './current.ts';

describe('currentStatus', () => {
	test("keeps the code's status without a listing of the storage box", () => {
		expect(currentStatus('released', undefined)).toBe('released');
		expect(currentStatus('scraping', undefined)).toBe('scraping');
	});

	test('marks a released region without a file as outdated', () => {
		expect(currentStatus('released', false)).toBe('outdated');
		expect(currentStatus('released', true)).toBe('released');
	});

	test('counts a scraping region with a file as released', () => {
		expect(currentStatus('scraping', true)).toBe('released');
		expect(currentStatus('scraping', false)).toBe('scraping');
	});

	test('leaves planned and blocked regions as they are', () => {
		expect(currentStatus('planned', true)).toBe('planned');
		expect(currentStatus('blocked', false)).toBe('blocked');
	});
});

describe('combinedStatus', () => {
	test('uses a status all parts share', () => {
		expect(combinedStatus(['released', 'released'])).toBe('released');
		expect(combinedStatus(['planned'])).toBe('planned');
	});

	test('is outdated while some released parts are not rebuilt yet', () => {
		expect(combinedStatus(['released', 'outdated', 'released'])).toBe('outdated');
	});

	test('is scraping for any other mix', () => {
		expect(combinedStatus(['released', 'scraping'])).toBe('scraping');
		expect(combinedStatus(['outdated', 'planned'])).toBe('scraping');
	});

	test('refuses an empty list', () => {
		expect(() => combinedStatus([])).toThrow();
	});
});
