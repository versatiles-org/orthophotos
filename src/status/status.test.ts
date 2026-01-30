import { assertEquals, assertThrows } from '@std/assert';
import { readStatus } from './status.ts';
import { resolve } from '@std/path';

const TEST_DATA_DIR = resolve(import.meta.dirname!, '../../test-data/status');

Deno.test('readStatus - parses success status correctly', () => {
	const status = readStatus(resolve(TEST_DATA_DIR, 'success.yml'));
	assertEquals(status.status, 'success');
	if (status.status === 'success') {
		assertEquals(status.rating, 4);
		assertEquals(status.notes.length, 2);
		assertEquals(status.notes[0], 'High resolution imagery');
		assertEquals(status.entries.length, 2);
		assertEquals(status.entries[0].name, 'entry1');
		assertEquals(status.entries[0].versaTilesExists, false);
		assertEquals(status.license.name, 'CC BY 4.0');
		assertEquals(status.license.requiresAttribution, true);
		assertEquals(status.creator.name, 'Test Creator');
	}
});

Deno.test('readStatus - parses error status correctly', () => {
	const status = readStatus(resolve(TEST_DATA_DIR, 'error.yml'));
	assertEquals(status.status, 'error');
	if (status.status === 'error') {
		assertEquals(status.notes.length, 1);
		assertEquals(status.notes[0], 'Data not available');
	}
});

Deno.test('readStatus - handles known license shortcuts', () => {
	const status = readStatus(resolve(TEST_DATA_DIR, 'license-shortcut.yml'));
	assertEquals(status.status, 'success');
	if (status.status === 'success') {
		assertEquals(status.license.name, 'CC0');
		assertEquals(status.license.url, 'https://creativecommons.org/publicdomain/zero/1.0/');
		assertEquals(status.license.requiresAttribution, false);
	}
});

Deno.test('readStatus - throws on invalid rating', () => {
	assertThrows(
		() => readStatus(resolve(TEST_DATA_DIR, 'invalid-rating.yml')),
		Error,
		'Invalid rating',
	);
});

Deno.test('readStatus - throws on invalid URL', () => {
	assertThrows(
		() => readStatus(resolve(TEST_DATA_DIR, 'invalid-url.yml')),
		Error,
		'Invalid license URL',
	);
});
