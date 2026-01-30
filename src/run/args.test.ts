import { assertEquals, assertThrows } from '@std/assert';
import { expandTasks, parseArgs, validateRegionName } from './args.ts';

// validateRegionName tests
Deno.test('validateRegionName - accepts two-letter country code', () => {
	validateRegionName('de');
	validateRegionName('fr');
});

Deno.test('validateRegionName - accepts country/subdivision format', () => {
	validateRegionName('de/bw');
	validateRegionName('fr/ne');
});

Deno.test('validateRegionName - rejects invalid formats', () => {
	assertThrows(() => validateRegionName('d'), Error, 'Invalid region name');
	assertThrows(() => validateRegionName('deu'), Error, 'Invalid region name');
	assertThrows(() => validateRegionName('DE'), Error, 'Invalid region name');
	assertThrows(() => validateRegionName('de/'), Error, 'Invalid region name');
	assertThrows(() => validateRegionName('de/b'), Error, 'Invalid region name');
	assertThrows(() => validateRegionName('de/bwx'), Error, 'Invalid region name');
	assertThrows(() => validateRegionName('de/bw/extra'), Error, 'Invalid region name');
});

// expandTasks tests
Deno.test('expandTasks - single numeric task', () => {
	assertEquals(expandTasks('3'), [3]);
	assertEquals(expandTasks('0'), [0]);
	assertEquals(expandTasks('6'), [6]);
});

Deno.test('expandTasks - comma-separated tasks', () => {
	assertEquals(expandTasks('1,2,3'), [1, 2, 3]);
	assertEquals(expandTasks('0,5,6'), [0, 5, 6]);
});

Deno.test('expandTasks - range ascending', () => {
	assertEquals(expandTasks('1-3'), [1, 2, 3]);
	assertEquals(expandTasks('0-2'), [0, 1, 2]);
});

Deno.test('expandTasks - range descending', () => {
	assertEquals(expandTasks('3-1'), [3, 2, 1]);
});

Deno.test('expandTasks - named tasks', () => {
	assertEquals(expandTasks('fetch'), [1]);
	assertEquals(expandTasks('download'), [0]);
	assertEquals(expandTasks('upload'), [5]);
	assertEquals(expandTasks('vrt'), [2]);
	assertEquals(expandTasks('preview'), [3]);
	assertEquals(expandTasks('convert'), [4]);
	assertEquals(expandTasks('delete'), [6]);
});

Deno.test('expandTasks - all', () => {
	assertEquals(expandTasks('all'), [0, 1, 5, 2, 5, 3, 5, 4, 5, 6]);
	assertEquals(expandTasks('ALL'), [0, 1, 5, 2, 5, 3, 5, 4, 5, 6]);
});

Deno.test('expandTasks - mixed specifications', () => {
	assertEquals(expandTasks('1,3-5'), [1, 3, 4, 5]);
	assertEquals(expandTasks('fetch,2-3'), [1, 2, 3]);
});

Deno.test('expandTasks - throws on invalid task number', () => {
	assertThrows(() => expandTasks('7'), Error, 'Invalid task number');
	assertThrows(() => expandTasks('99'), Error, 'Invalid task number');
});

Deno.test('expandTasks - throws on unknown task name', () => {
	assertThrows(() => expandTasks('unknown'), Error, 'Unknown task');
});

// parseArgs tests
Deno.test('parseArgs - returns null for help flag', () => {
	assertEquals(parseArgs(['-h']), null);
	assertEquals(parseArgs(['--help']), null);
	assertEquals(parseArgs(['help']), null);
	assertEquals(parseArgs([]), null);
});

Deno.test('parseArgs - parses valid arguments', () => {
	assertEquals(parseArgs(['de/bw', '1']), { name: 'de/bw', tasks: [1] });
	assertEquals(parseArgs(['fr', '2-4']), { name: 'fr', tasks: [2, 3, 4] });
	assertEquals(parseArgs(['de', 'all']), { name: 'de', tasks: [0, 1, 5, 2, 5, 3, 5, 4, 5, 6] });
});

Deno.test('parseArgs - throws on missing task', () => {
	assertThrows(() => parseArgs(['de/bw']), Error, 'Missing arguments');
});

Deno.test('parseArgs - throws on invalid region name', () => {
	assertThrows(() => parseArgs(['invalid', '1']), Error, 'Invalid region name');
});
