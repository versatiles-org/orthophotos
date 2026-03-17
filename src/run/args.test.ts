import { expect, test } from 'vitest';
import { expandTasks, parseArgs, validateRegionName } from './args.ts';

// validateRegionName tests
test('validateRegionName - accepts two-letter country code', () => {
	validateRegionName('de');
	validateRegionName('fr');
});

test('validateRegionName - accepts country/subdivision format', () => {
	validateRegionName('de/bw');
	validateRegionName('fr/ne');
	validateRegionName('de/b');
	validateRegionName('de/berling');
});

test('validateRegionName - rejects invalid formats', () => {
	expect(() => validateRegionName('d')).toThrow('Invalid region name');
	expect(() => validateRegionName('deu')).toThrow('Invalid region name');
	expect(() => validateRegionName('DE')).toThrow('Invalid region name');
	expect(() => validateRegionName('de/')).toThrow('Invalid region name');
	expect(() => validateRegionName('de/bw/extra')).toThrow('Invalid region name');
});

// expandTasks tests
test('expandTasks - single numeric task', () => {
	expect(expandTasks('3')).toEqual([3]);
	expect(expandTasks('0')).toEqual([0]);
	expect(expandTasks('6')).toEqual([6]);
});

test('expandTasks - comma-separated tasks', () => {
	expect(expandTasks('1,2,3')).toEqual([1, 2, 3]);
	expect(expandTasks('0,5,6')).toEqual([0, 5, 6]);
});

test('expandTasks - range ascending', () => {
	expect(expandTasks('1-3')).toEqual([1, 2, 3]);
	expect(expandTasks('0-2')).toEqual([0, 1, 2]);
});

test('expandTasks - range descending', () => {
	expect(expandTasks('3-1')).toEqual([3, 2, 1]);
});

test('expandTasks - named tasks', () => {
	expect(expandTasks('fetch')).toEqual([1]);
	expect(expandTasks('download')).toEqual([0]);
	expect(expandTasks('upload')).toEqual([5]);
	expect(expandTasks('vrt')).toEqual([2]);
	expect(expandTasks('preview')).toEqual([3]);
	expect(expandTasks('convert')).toEqual([4]);
	expect(expandTasks('delete')).toEqual([6]);
});

test('expandTasks - all', () => {
	expect(expandTasks('all')).toEqual([0, 1, 5, 2, 5, 3, 5, 4, 5, 6]);
	expect(expandTasks('ALL')).toEqual([0, 1, 5, 2, 5, 3, 5, 4, 5, 6]);
});

test('expandTasks - mixed specifications', () => {
	expect(expandTasks('1,3-5')).toEqual([1, 3, 4, 5]);
	expect(expandTasks('fetch,2-3')).toEqual([1, 2, 3]);
});

test('expandTasks - throws on invalid task number', () => {
	expect(() => expandTasks('7')).toThrow('Invalid task number');
	expect(() => expandTasks('99')).toThrow('Invalid task number');
});

test('expandTasks - throws on unknown task name', () => {
	expect(() => expandTasks('unknown')).toThrow('Unknown task');
});

// parseArgs tests
test('parseArgs - returns null for help flag', () => {
	expect(parseArgs(['-h'])).toBe(null);
	expect(parseArgs(['--help'])).toBe(null);
	expect(parseArgs(['help'])).toBe(null);
	expect(parseArgs([])).toBe(null);
});

test('parseArgs - parses valid arguments', () => {
	expect(parseArgs(['de/bw', '1'])).toEqual({ name: 'de/bw', tasks: [1] });
	expect(parseArgs(['fr', '2-4'])).toEqual({ name: 'fr', tasks: [2, 3, 4] });
	expect(parseArgs(['de', 'all'])).toEqual({
		name: 'de',
		tasks: [0, 1, 5, 2, 5, 3, 5, 4, 5, 6],
	});
});

test('parseArgs - throws on missing task', () => {
	expect(() => parseArgs(['de/bw'])).toThrow('Missing arguments');
});

test('parseArgs - throws on invalid region name', () => {
	expect(() => parseArgs(['invalid', '1'])).toThrow('Invalid region name');
});
