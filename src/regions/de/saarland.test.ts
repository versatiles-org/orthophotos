import { describe, expect, test } from 'vitest';
import { parseAtomEntries } from './saarland.ts';

function feed(href: string): string {
	return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
	<title>INSPIRE Datensatz Feed für ATKIS - DOP20</title>
	<entry>
		<title>ATKIS - DOP20 - generiert aus WMS Datenquelle im CRS EPSG:25832 und Format image/tiff</title>
		<link href="https://geoportal.saarland.de/mapbender/php/mod_inspireDownloadFeed.php?id=x&amp;type=DATASET" rel="alternate" title="Feed"/>
		<link rel="section" href="${href}" type="image/tiff" title="ATKIS - DOP20 im CRS EPSG:25832 - image/tiff - Teil 2 von 19024"/>
	</entry>
</feed>`;
}

const query =
	'REQUEST=GetMap&amp;VERSION=1.1.1&amp;SERVICE=WMS&amp;LAYERS=sl_dop20_rgb&amp;SRS=EPSG:25832&amp;BBOX=304151,5442057,304651,5442557&amp;WIDTH=2500&amp;HEIGHT=2500&amp;FORMAT=image/tiff';

describe('parseAtomEntries', () => {
	test('takes the grid from the feed and sends the requests to the 2025 WMS', () => {
		const tiles = parseAtomEntries(feed(`https://geoportal.saarland.de/freewms/dop2023?${query}`));
		expect(tiles).toEqual([
			{
				id: '2',
				url: `https://geoportal.saarland.de/freewms/dop2025?${query.replace(/&amp;/g, '&')}`,
			},
		]);
	});

	test('rejects a feed that points at another service', () => {
		expect(() => parseAtomEntries(feed(`https://example.com/wms?${query}`))).toThrow('unexpected service');
	});
});
