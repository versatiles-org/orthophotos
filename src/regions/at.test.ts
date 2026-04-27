import { describe, expect, test } from 'vitest';
import { parseDatasetFeed, parseServiceFeed } from './at.ts';

const SERVICE_FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
	<entry>
		<title>Operat 2022150</title>
		<link rel="alternate" type="application/atom+xml" href="https://example.com/operat_2022150.xml"/>
	</entry>
	<entry>
		<title>Operat 2099999</title>
		<link rel="alternate" type="application/atom+xml" href="https://example.com/operat_2099999.xml"/>
	</entry>
	<entry>
		<title>Some unrelated entry without operat suffix</title>
		<link rel="alternate" type="application/atom+xml" href="https://example.com/other.xml"/>
	</entry>
	<entry>
		<title>Operat 2022150</title>
		<link rel="self" type="application/atom+xml" href="https://example.com/self.xml"/>
		<link rel="alternate" type="application/atom+xml" href="https://example.com/operat_2022150_alt.xml?a=1&amp;amp;b=2"/>
	</entry>
</feed>`;

describe('parseServiceFeed', () => {
	test('returns only entries whose Operat is in the requested set', () => {
		const out = parseServiceFeed(SERVICE_FEED_XML, [2022150]);
		expect(out).toHaveLength(2);
		expect(out[0]).toEqual({ operat: 2022150, feedUrl: 'https://example.com/operat_2022150.xml' });
	});

	test('strips spurious "amp;" left over from double-escaped hrefs', () => {
		const out = parseServiceFeed(SERVICE_FEED_XML, [2022150]);
		// fast-xml-parser converts &amp; → & once; the source has &amp;amp; so a stray
		// "amp;" remains and parseServiceFeed must scrub it.
		expect(out[1].feedUrl).toBe('https://example.com/operat_2022150_alt.xml?a=1&b=2');
	});

	test('returns empty when no matching Operat is found', () => {
		expect(parseServiceFeed(SERVICE_FEED_XML, [9999999])).toEqual([]);
	});

	test('ignores non-alternate links and non-atom types', () => {
		const xml = `<?xml version="1.0"?>
		<feed xmlns="http://www.w3.org/2005/Atom">
			<entry>
				<title>Operat 1234567</title>
				<link rel="self" type="application/atom+xml" href="https://example.com/self.xml"/>
				<link rel="alternate" type="text/html" href="https://example.com/page.html"/>
			</entry>
		</feed>`;
		expect(parseServiceFeed(xml, [1234567])).toEqual([]);
	});
});

describe('parseDatasetFeed', () => {
	test('returns the first href ending with _Mosaik_RGB.tif', () => {
		const xml = `<?xml version="1.0"?>
		<feed xmlns="http://www.w3.org/2005/Atom">
			<entry>
				<link rel="alternate" type="image/tiff" href="https://example.com/Operat_2022150_DOM_Mosaik_RGB.tif"/>
				<link rel="alternate" type="image/tiff" href="https://example.com/Operat_2022150_DOM_Other.tif"/>
			</entry>
		</feed>`;
		expect(parseDatasetFeed(xml)).toBe('https://example.com/Operat_2022150_DOM_Mosaik_RGB.tif');
	});

	test('returns undefined when no _Mosaik_RGB.tif link is present', () => {
		const xml = `<?xml version="1.0"?>
		<feed xmlns="http://www.w3.org/2005/Atom">
			<entry>
				<link rel="alternate" type="image/tiff" href="https://example.com/something.tif"/>
			</entry>
		</feed>`;
		expect(parseDatasetFeed(xml)).toBeUndefined();
	});
});
