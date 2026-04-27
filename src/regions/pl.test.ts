import { describe, expect, test } from 'vitest';
import { extractGridRef, parseDatasetFeed } from './pl.ts';

describe('parseDatasetFeed', () => {
	test('extracts polska_oi_<year>.zip links and sorts newest first', () => {
		const xml = `<?xml version="1.0"?>
		<feed xmlns="http://www.w3.org/2005/Atom">
			<entry>
				<link href="https://example.com/atom?name=polska_oi_2020.zip"/>
				<link href="https://example.com/atom?name=polska_oi_2024.zip"/>
				<link href="https://example.com/atom?name=polska_oi_2022.zip"/>
			</entry>
		</feed>`;
		const out = parseDatasetFeed(xml);
		expect(out.map((e) => e.year)).toEqual([2024, 2022, 2020]);
	});

	test('filters out entries before MIN_YEAR (2020)', () => {
		const xml = `<?xml version="1.0"?>
		<feed xmlns="http://www.w3.org/2005/Atom">
			<entry>
				<link href="https://example.com/atom?name=polska_oi_2018.zip"/>
				<link href="https://example.com/atom?name=polska_oi_2021.zip"/>
			</entry>
		</feed>`;
		expect(parseDatasetFeed(xml).map((e) => e.year)).toEqual([2021]);
	});

	test('decodes &amp; in href attributes', () => {
		const xml = `<?xml version="1.0"?>
		<feed xmlns="http://www.w3.org/2005/Atom">
			<entry>
				<link href="https://example.com/atom?a=1&amp;amp;name=polska_oi_2024.zip"/>
			</entry>
		</feed>`;
		const out = parseDatasetFeed(xml);
		expect(out).toHaveLength(1);
		// fast-xml-parser decodes &amp; → & once; the function does the same again,
		// reducing &amp;amp; → &amp; → &.
		expect(out[0].url).toBe('https://example.com/atom?a=1&name=polska_oi_2024.zip');
	});

	test('returns empty array when no entry is present', () => {
		expect(parseDatasetFeed('<?xml version="1.0"?><feed/>')).toEqual([]);
	});

	test('ignores links that do not match the polska_oi_<year>.zip pattern', () => {
		const xml = `<?xml version="1.0"?>
		<feed xmlns="http://www.w3.org/2005/Atom">
			<entry>
				<link href="https://example.com/something_else.zip"/>
				<link href="https://example.com/atom?name=polska_oi_2024.zip"/>
			</entry>
		</feed>`;
		expect(parseDatasetFeed(xml)).toHaveLength(1);
	});
});

describe('extractGridRef', () => {
	test('strips the operat-id and tile-id prefix from the filename', () => {
		const url = 'https://opendata.geoportal.gov.pl/ortofotomapa/12345/12345_678_N-34-126-C-b-1-3.tif';
		expect(extractGridRef(url)).toBe('N-34-126-C-b-1-3');
	});

	test('returns the basename minus .tif when there are no numeric segments to strip', () => {
		expect(extractGridRef('https://example.com/path/grid_ref_only.tif')).toBe('grid_ref_only');
	});

	test('returns empty string for malformed URLs without a path component', () => {
		expect(extractGridRef('')).toBe('');
	});
});
