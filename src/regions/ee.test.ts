import { describe, expect, test } from 'vitest';
import { pickLatestFilename } from './ee.ts';

describe('pickLatestFilename', () => {
	test('picks the newest year whatever the order in the answer', () => {
		const html = [
			'<a href="?dl=1&f=54494_OF_RGB_GeoTIFF_2023_04_23-05_12.zip&x=1">2023</a>',
			'<a href="?dl=1&f=54494_OF_RGB_GeoTIFF_2025_07_18.zip&x=1">2025</a>',
			'<a href="?dl=1&f=54494_OF_RGB_GeoTIFF_1995.zip&x=1">1995</a>',
		].join('\n');
		expect(pickLatestFilename(html)).toBe('54494_OF_RGB_GeoTIFF_2025_07_18.zip');
	});

	test('returns null when the sheet has no RGB GeoTIFF', () => {
		expect(pickLatestFilename('<p>No results</p>')).toBeNull();
	});
});
