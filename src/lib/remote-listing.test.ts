import { expect, test } from 'vitest';
import { parseLsLR } from './remote-listing.ts';

const SAMPLE = `/home/incoming:
total 24
-rw-r--r-- 1 me me 12345678 2025-03-27 14:25:01.000000000 +0000 ch.versatiles
-rw-r--r-- 1 me me 87654321 2025-04-12 09:00:00.000000000 +0000 hu.versatiles
drwxr-xr-x 2 me me     4096 2025-04-12 09:00:00.000000000 +0000 de
drwxr-xr-x 2 me me     4096 2025-04-12 09:00:00.000000000 +0000 fr
-rw-r--r-- 1 me me      512 2025-04-12 09:00:00.000000000 +0000 README.txt

/home/incoming/de:
total 100
-rw-r--r-- 1 me me 99999999 2024-12-03 12:00:00.000000000 +0000 bayern.versatiles
-rw-r--r-- 1 me me 11111111 2026-01-15 03:30:00.000000000 +0100 berlin.versatiles

/home/incoming/fr:
total 0
`;

test('parseLsLR extracts versatiles files with paths, sizes, and mtimes', () => {
	const files = parseLsLR(SAMPLE, '/home/incoming');
	const byPath = Object.fromEntries(files.map((f) => [f.path, f]));

	expect(Object.keys(byPath).sort()).toEqual([
		'ch.versatiles',
		'de/bayern.versatiles',
		'de/berlin.versatiles',
		'hu.versatiles',
	]);

	expect(byPath['ch.versatiles'].size).toBe(12345678);
	expect(byPath['ch.versatiles'].mtime.toISOString()).toBe('2025-03-27T14:25:01.000Z');

	expect(byPath['de/bayern.versatiles'].size).toBe(99999999);
	expect(byPath['de/bayern.versatiles'].mtime.toISOString()).toBe('2024-12-03T12:00:00.000Z');

	// "+0100" → mtime translated correctly
	expect(byPath['de/berlin.versatiles'].mtime.toISOString()).toBe('2026-01-15T02:30:00.000Z');
});

test('parseLsLR skips non-versatiles files and directories', () => {
	const files = parseLsLR(SAMPLE, '/home/incoming');
	expect(files.find((f) => f.path === 'README.txt')).toBeUndefined();
	expect(files.find((f) => f.path === 'de')).toBeUndefined();
	expect(files.find((f) => f.path === 'fr')).toBeUndefined();
});

test('parseLsLR handles empty output', () => {
	expect(parseLsLR('', '/dir')).toEqual([]);
});

test('parseLsLR handles output with only directory headers', () => {
	expect(parseLsLR('/dir:\ntotal 0\n', '/dir')).toEqual([]);
});

test('parseLsLR returns absolute path when entry sits outside rootDir', () => {
	const out = `/other:
total 8
-rw-r--r-- 1 me me 123 2025-01-01 00:00:00.000000000 +0000 stray.versatiles
`;
	const files = parseLsLR(out, '/home/incoming');
	expect(files[0].path).toBe('/other/stray.versatiles');
});
