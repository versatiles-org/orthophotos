import { expect, test } from 'vitest';
import { parseTileIds, parseTileUrl } from './de_schleswig_holstein.ts';

const INDEX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:georss="http://www.georss.org/georss"
      xmlns:inspire_dls="http://inspire.ec.europa.eu/schemas/inspire_dls/1.0" xmlns:lang="ger">
<title>DOP20 OpenGBD</title>
<link href="https://service.gdi-sh.de/SH_OpenGBD/feeds/DOP20/DOP20.xml" rel="self" type="application/atom+xml"/>
<entry>
<title>Digitales Orthophoto (DOP20) 32424-6002</title>
<inspire_dls:spatial_dataset_identifier_code>dop20rgbi_32_424_6002_1_sh_2017</inspire_dls:spatial_dataset_identifier_code>
<link rel="describedby" href="https://sh-mis.gdi-sh.de/csw/api?id=abc" type="application/xml"/>
<link rel="alternate" href="https://service.gdi-sh.de/SH_OpenGBD/feeds/DOP20/DOP20_dop20rgbi_32_424_6002_1_sh_2017.xml" type="application/atom+xml"/>
</entry>
<entry>
<title>Digitales Orthophoto (DOP20) 32424-6003</title>
<inspire_dls:spatial_dataset_identifier_code>dop20rgbi_32_424_6003_1_sh_2017</inspire_dls:spatial_dataset_identifier_code>
<link rel="describedby" href="https://sh-mis.gdi-sh.de/csw/api?id=def" type="application/xml"/>
<link rel="alternate" href="https://service.gdi-sh.de/SH_OpenGBD/feeds/DOP20/DOP20_dop20rgbi_32_424_6003_1_sh_2017.xml" type="application/atom+xml"/>
</entry>
</feed>`;

const TILE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:georss="http://www.georss.org/georss" xmlns:lang="ger">
<title>Digitales Orthophoto (DOP20) 32424-6002</title>
<link href="https://service.gdi-sh.de/SH_OpenGBD/feeds/DOP20/DOP20_dop20rgbi_32_424_6002_1_sh_2017.xml" rel="self"/>
<entry>
<title>dop20rgbi_32_424_6002_1_sh_2017</title>
<link rel="alternate" href="https://udp.gdi-sh.de/fmedatastreaming/OpenAccess/WCSTileAssembler.fmw?token=abc&amp;Split=2&amp;WCSUrl=https://dienste.gdi-sh.de/WCS_SH_DOP20col_OpenGBD?SERVICE=WCS%26VERSION=1.0.0%26REQUEST=GetCoverage%26COVERAGE=7%26FORMAT=GeoTIFF%26BBOX=424000,6002000,425000.0,6003000.0%26WIDTH=5000%26HEIGHT=5000%26CRS=EPSG:25832%26INTERPOLATION=cubic" type="application/gml+xml"/>
</entry>
</feed>`;

test('parseTileIds - extracts IDs from atom feed', () => {
	const ids = parseTileIds(INDEX_XML);
	expect(ids).toEqual(['dop20rgbi_32_424_6002_1_sh_2017', 'dop20rgbi_32_424_6003_1_sh_2017']);
});

test('parseTileIds - returns empty array for feed with no entries', () => {
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Empty</title></feed>`;
	expect(parseTileIds(xml)).toEqual([]);
});

test('parseTileIds - ignores non-alternate links', () => {
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
<link rel="describedby" href="https://service.gdi-sh.de/SH_OpenGBD/feeds/DOP20/DOP20_dop20rgbi_32_424_6002_1_sh_2017.xml"/>
<link rel="self" href="https://service.gdi-sh.de/SH_OpenGBD/feeds/DOP20/DOP20_dop20rgbi_32_424_6003_1_sh_2017.xml"/>
</entry>
</feed>`;
	expect(parseTileIds(xml)).toEqual([]);
});

test('parseTileIds - handles single entry (not wrapped in array)', () => {
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
<link rel="alternate" href="https://service.gdi-sh.de/SH_OpenGBD/feeds/DOP20/DOP20_dop20rgbi_32_500_6100_1_sh_2020.xml" type="application/atom+xml"/>
</entry>
</feed>`;
	expect(parseTileIds(xml)).toEqual(['dop20rgbi_32_500_6100_1_sh_2020']);
});

test('parseTileUrl - extracts download URL from tile feed', () => {
	const url = parseTileUrl(TILE_XML);
	expect(url).toBe(
		'https://udp.gdi-sh.de/fmedatastreaming/OpenAccess/WCSTileAssembler.fmw?token=abc&Split=2&WCSUrl=https://dienste.gdi-sh.de/WCS_SH_DOP20col_OpenGBD?SERVICE=WCS%26VERSION=1.0.0%26REQUEST=GetCoverage%26COVERAGE=7%26FORMAT=GeoTIFF%26BBOX=424000,6002000,425000.0,6003000.0%26WIDTH=5000%26HEIGHT=5000%26CRS=EPSG:25832%26INTERPOLATION=cubic',
	);
});

test('parseTileUrl - decodes &amp; entities', () => {
	const url = parseTileUrl(TILE_XML)!;
	expect(url).not.toContain('amp;');
	expect(url).toContain('?token=abc&Split=2&WCSUrl=');
});

test('parseTileUrl - returns undefined when no matching link', () => {
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
<link rel="alternate" href="https://example.com/something-else" type="application/xml"/>
</entry>
</feed>`;
	expect(parseTileUrl(xml)).toBeUndefined();
});

test('parseTileUrl - returns undefined for empty feed', () => {
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Empty</title></feed>`;
	expect(parseTileUrl(xml)).toBeUndefined();
});
