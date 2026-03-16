import { expect, test } from 'vitest';
import { readStatus } from './status.ts';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DATA_DIR = resolve(__dirname, '../../test-data/status');

test('readStatus - parses success status correctly', () => {
	const status = readStatus(resolve(TEST_DATA_DIR, 'success.yml'));
	expect(status.status).toBe('success');
	if (status.status === 'success') {
		expect(status.rating).toBe(4);
		expect(status.notes.length).toBe(2);
		expect(status.notes[0]).toBe('High resolution imagery');
		expect(status.entries.length).toBe(2);
		expect(status.entries[0].name).toBe('entry1');
		expect(status.entries[0].versaTilesExists).toBe(false);
		expect(status.license.name).toBe('CC BY 4.0');
		expect(status.license.requiresAttribution).toBe(true);
		expect(status.creator.name).toBe('Test Creator');
	}
});

test('readStatus - parses error status correctly', () => {
	const status = readStatus(resolve(TEST_DATA_DIR, 'error.yml'));
	expect(status.status).toBe('error');
	if (status.status === 'error') {
		expect(status.notes.length).toBe(1);
		expect(status.notes[0]).toBe('Data not available');
	}
});

test('readStatus - handles known license shortcuts', () => {
	const status = readStatus(resolve(TEST_DATA_DIR, 'license-shortcut.yml'));
	expect(status.status).toBe('success');
	if (status.status === 'success') {
		expect(status.license.name).toBe('CC0');
		expect(status.license.url).toBe('https://creativecommons.org/publicdomain/zero/1.0/');
		expect(status.license.requiresAttribution).toBe(false);
	}
});

test('readStatus - throws on invalid rating', () => {
	expect(() => readStatus(resolve(TEST_DATA_DIR, 'invalid-rating.yml'))).toThrow(
		'Invalid rating',
	);
});

test('readStatus - throws on invalid URL', () => {
	expect(() => readStatus(resolve(TEST_DATA_DIR, 'invalid-url.yml'))).toThrow(
		'Invalid license URL',
	);
});

test('readStatus - throws on missing license', () => {
	expect(() => readStatus(resolve(TEST_DATA_DIR, 'missing-license.yml'))).toThrow(
		'License must be an object',
	);
});

test('readStatus - throws on missing creator', () => {
	expect(() => readStatus(resolve(TEST_DATA_DIR, 'missing-creator.yml'))).toThrow(
		'Creator must be an object',
	);
});

test('readStatus - throws on invalid creator URL', () => {
	expect(() => readStatus(resolve(TEST_DATA_DIR, 'invalid-creator-url.yml'))).toThrow(
		'Invalid creator URL',
	);
});

test('readStatus - accepts rating of 0', () => {
	const status = readStatus(resolve(TEST_DATA_DIR, 'rating-0.yml'));
	expect(status.status).toBe('success');
	if (status.status === 'success') {
		expect(status.rating).toBe(0);
	}
});

test('readStatus - accepts rating of 5', () => {
	const status = readStatus(resolve(TEST_DATA_DIR, 'rating-5.yml'));
	expect(status.status).toBe('success');
	if (status.status === 'success') {
		expect(status.rating).toBe(5);
	}
});

test('readStatus - throws on rating of 6', () => {
	expect(() => readStatus(resolve(TEST_DATA_DIR, 'rating-6.yml'))).toThrow('Invalid rating');
});

test('readStatus - throws on negative rating', () => {
	expect(() => readStatus(resolve(TEST_DATA_DIR, 'rating-negative.yml'))).toThrow(
		'Invalid rating',
	);
});

test('readStatus - throws on unknown license shortcut', () => {
	expect(() => readStatus(resolve(TEST_DATA_DIR, 'unknown-license.yml'))).toThrow(
		'Unknown license',
	);
});

test('readStatus - handles DL-DE->BY-2.0 license shortcut', () => {
	const status = readStatus(resolve(TEST_DATA_DIR, 'dl-de-by.yml'));
	expect(status.status).toBe('success');
	if (status.status === 'success') {
		expect(status.license.name).toBe('DL-DE->BY-2.0');
		expect(status.license.url).toBe('https://www.govdata.de/dl-de/by-2-0');
		expect(status.license.requiresAttribution).toBe(true);
	}
});

test('readStatus - handles DL-DE->Zero-2.0 license shortcut', () => {
	const status = readStatus(resolve(TEST_DATA_DIR, 'dl-de-zero.yml'));
	expect(status.status).toBe('success');
	if (status.status === 'success') {
		expect(status.license.name).toBe('DL-DE->Zero-2.0');
		expect(status.license.url).toBe('https://www.govdata.de/dl-de/zero-2-0');
		expect(status.license.requiresAttribution).toBe(false);
	}
});
